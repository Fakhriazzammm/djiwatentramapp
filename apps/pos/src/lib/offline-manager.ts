/**
 * OFFLINE MANAGER
 *
 * Mendukung offline mode dengan queue, sync, dan caching.
 */

// Simple reactive state (replaces svelte/store)
interface Writable<T> {
	subscribe(run: (value: T) => void): () => void;
	update(fn: (value: T) => T): void;
}

function writable<T>(initial: T): Writable<T> {
	let value = initial;
	const subscribers = new Set<(value: T) => void>();
	return {
		subscribe(run) {
			subscribers.add(run);
			run(value);
			return () => subscribers.delete(run);
		},
		update(fn) {
			value = fn(value);
			for (const sub of subscribers) {
				sub(value);
			}
		},
	};
}

function get<T>(store: Writable<T>): T {
	let value = undefined as T;
	const unsubscribe = store.subscribe((v) => {
		value = v;
	});
	unsubscribe();
	return value;
}

// ============================================
// TYPES
// ============================================

export interface QueuedAction {
	id: string;
	type: "createOrder" | "updateProduct" | "deleteProduct" | "other";
	timestamp: number;
	data: unknown;
	retries: number;
	maxRetries: number;
	status: "pending" | "failed";
	lastError?: string;
	lastAttemptAt?: number;
}

type ActionExecutor = (action: QueuedAction) => Promise<void>;

export interface OfflineState {
	isOnline: boolean;
	isOfflineMode: boolean;
	queuedActions: QueuedAction[];
	/** All retained unsynced actions, including failed records. */
	pendingSyncCount: number;
	lastSyncTime: number;
	isSyncing: boolean;
	storageError: string | null;
}

export interface OfflineConfig {
	/**
	 * Maximum number of retries for failed actions
	 * @default 3
	 */
	maxRetries: number;

	/**
	 * Interval between retry attempts (ms)
	 * @default 5000 (5 seconds)
	 */
	retryInterval: number;

	/**
	 * Whether to enable offline mode
	 * @default true
	 */
	enabled: boolean;

	/**
	 * Storage key for persisted data
	 * @default "pos-offline"
	 */
	storageKey: string;

	/**
	 * Maximum queue size
	 * @default 100
	 */
	maxQueueSize: number;
}

// ============================================
// DEFAULT CONFIG
// ============================================

const DEFAULT_CONFIG: OfflineConfig = {
	maxRetries: 3,
	retryInterval: 5000,
	enabled: true,
	storageKey: "pos-offline",
	maxQueueSize: 100,
};

// ============================================
// OFFLINE MANAGER CLASS
// ============================================

export class OfflineManager {
	private readonly config: OfflineConfig;
	private readonly state: Writable<OfflineState>;
	private retryTimer: NodeJS.Timeout | null = null;
	private readonly executors = new Map<QueuedAction["type"], ActionExecutor>();
	private syncPromise: Promise<void> | null = null;
	private readonly retryPromises = new Map<string, Promise<void>>();
	private storageReadable = true;
	private readonly eventCleanup: (() => void)[] = [];

	constructor(config: Partial<OfflineConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };

		// Load persisted state
		const persistedState = this.loadPersistedState();

		this.state = writable<OfflineState>({
			isOnline: typeof navigator === "undefined" ? false : navigator.onLine,
			isOfflineMode: false,
			queuedActions: persistedState?.queuedActions || [],
			pendingSyncCount: persistedState?.queuedActions?.length ?? 0,
			isSyncing: false,
			storageError: this.storageReadable ? null : "Antrean tersimpan tidak dapat dibaca. Pulihkan penyimpanan perangkat sebelum melanjutkan.",
			lastSyncTime: persistedState?.lastSyncTime || Date.now(),
		});

		this.setupEventListeners();
		this.startSyncWhenOnline();
	}

	// ============================================
	// STATE MANAGEMENT
	// ============================================

	getState(): OfflineState {
		return get(this.state);
	}

	setState(update: Partial<OfflineState>): void {
		const newState = { ...this.getState(), ...update, storageError: null };
		newState.pendingSyncCount = newState.queuedActions.length;
		try {
			this.persistState(newState);
		} catch (error) {
			this.state.update((state) => ({ ...state, storageError: error instanceof Error ? error.message : "Antrean belum tersimpan." }));
			throw error;
		}
		this.state.update(() => newState);
	}

	subscribe(run: (state: OfflineState) => void): () => void {
		return this.state.subscribe(run);
	}

	registerExecutor(type: QueuedAction["type"], executor: ActionExecutor): void {
		this.executors.set(type, executor);
	}

	// ============================================
	// EVENT LISTENERS
	// ============================================

	private setupEventListeners(): void {
		if (typeof window === "undefined") {
			return;
		}

		const handleOnline = () => {
			console.log("[OfflineManager] Connection restored");
			this.state.update((state) => ({ ...state, isOnline: true }));
			void this.syncQueuedActions().catch(() => { /* Retained for manual recovery. */ });
		};

		const handleOffline = () => {
			console.log("[OfflineManager] Connection lost");
			this.state.update((state) => ({ ...state, isOnline: false }));
		};

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		const handleUnload = () => this.cleanup();
		window.addEventListener("beforeunload", handleUnload);
		this.eventCleanup.push(() => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
			window.removeEventListener("beforeunload", handleUnload);
		});
	}

	// ============================================
	// QUEUE MANAGEMENT
	// ============================================

	queueAction<T>(type: QueuedAction["type"], data: T): string {
		const currentState = this.getState();

		if (currentState.queuedActions.length >= this.config.maxQueueSize) {
			console.warn("[OfflineManager] Queue is full, cannot add action");
			throw new Error("Queue is full");
		}

		const action: QueuedAction = {
			id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			type,
			timestamp: Date.now(),
			data,
			retries: 0,
			maxRetries: this.config.maxRetries,
			status: "pending",
		};

		this.setState({
			queuedActions: [...currentState.queuedActions, action],
			pendingSyncCount: currentState.pendingSyncCount + 1,
		});

		return action.id;
	}

	removeAction(actionId: string): void {
		const currentState = this.getState();
		const filtered = currentState.queuedActions.filter(
			(a) => a.id !== actionId
		);

		this.setState({
			queuedActions: filtered,
			pendingSyncCount: Math.max(0, filtered.length),
		});
	}

	clearQueue(): void {
		this.setState({
			queuedActions: [],
			pendingSyncCount: 0,
		});
		console.log("[OfflineManager] Queue cleared");
	}

	// ============================================
	// SYNC MANAGEMENT
	// ============================================

	/** Retry one retained failure. Identity/data stay unchanged; offline retries wait for connectivity. */
	retryAction(actionId: string): Promise<void> {
		const existing = this.retryPromises.get(actionId);
		if (existing) return existing;
		const retry = Promise.resolve().then(async () => {
			if (this.syncPromise) await this.syncPromise;
			const action = this.getState().queuedActions.find((item) => item.id === actionId);
			if (!action) return;
			if (action.status === "failed") {
				this.replaceAction({ ...action, status: "pending", retries: 0, lastError: undefined });
			}
			await this.syncQueuedActions();
		}).finally(() => { this.retryPromises.delete(actionId); });
		this.retryPromises.set(actionId, retry);
		return retry;
	}

	/** Concurrent callers join the same sync; failed records require explicit retryAction. */
	syncQueuedActions(): Promise<void> {
		if (this.syncPromise) return this.syncPromise;
		if (!this.config.enabled || !this.getState().isOnline) return Promise.resolve();
		// Defer execution so the lock exists before notifying subscribers or running executors.
		this.syncPromise = Promise.resolve().then(() => this.runSync()).finally(() => {
			this.syncPromise = null;
			this.state.update((state) => ({ ...state, isSyncing: false }));
		});
		return this.syncPromise;
	}

	private replaceAction(action: QueuedAction): void {
		this.setState({ queuedActions: this.getState().queuedActions.map((item) => item.id === action.id ? action : item) });
	}

	private async runSync(): Promise<void> {
		const actions = this.getState().queuedActions.filter((action) => action.status === "pending");
		if (actions.length === 0) return;
		this.state.update((state) => ({ ...state, isSyncing: true }));
		for (const queued of actions) {
			if (!this.getState().isOnline) break;
			const action = this.getState().queuedActions.find((item) => item.id === queued.id);
			if (!action || action.status !== "pending") continue;
			const executor = this.executors.get(action.type);
			// Executors register after startup; absence must not consume retry attempts.
			if (!executor) continue;
			// Persist a recovery stop before sending. A crash or storage failure after the
			// request may mean it succeeded remotely; do not automatically send it again.
			const attempt: QueuedAction = { ...action, status: "failed", lastAttemptAt: Date.now(),
				lastError: "Status pengiriman belum pasti. Periksa transaksi sebelum mencoba lagi." };
			this.replaceAction(attempt);
			try {
				await executor(attempt);
			} catch {
				const retries = action.retries + 1;
				this.replaceAction({ ...attempt, retries, status: retries >= action.maxRetries ? "failed" : "pending",
					lastError: "Transaksi belum tersinkron. Periksa koneksi dan data transaksi, lalu coba lagi." });
				continue;
			}
			// A failed local acknowledgement remains a retained failure, not an automatic retry.
			this.removeAction(action.id);
		}
		this.setState({ lastSyncTime: Date.now() });
	}

	private startSyncWhenOnline(): void {
		if (this.retryTimer) {
			clearInterval(this.retryTimer);
		}
		this.retryTimer = setInterval(() => {
			if (this.getState().isOnline && this.getState().queuedActions.length > 0) {
				void this.syncQueuedActions().catch(() => { /* Durable records stay available. */ });
			}
		}, this.config.retryInterval);
	}

	// ============================================
	// PERSISTENCE
	// ============================================

	private persistState(state: OfflineState): void {
		if (!this.storageReadable) throw new Error("Antrean tersimpan tidak dapat dibaca. Pulihkan penyimpanan sebelum melanjutkan.");
		try {
			localStorage.setItem(this.config.storageKey, JSON.stringify({
				queuedActions: state.queuedActions, lastSyncTime: state.lastSyncTime,
			}));
		} catch {
			throw new Error("Antrean belum tersimpan. Periksa ruang penyimpanan perangkat lalu coba lagi.");
		}
	}

	private loadPersistedState(): Partial<OfflineState> | null {
		try {
			const data = localStorage.getItem(this.config.storageKey);
			if (!data) return null;
			const parsed = JSON.parse(data);
			if (!parsed || !Array.isArray(parsed.queuedActions)) throw new Error("Invalid queue");
			const queuedActions = parsed.queuedActions.map((action: QueuedAction) => {
				if (!action || typeof action.id !== "string" || typeof action.type !== "string") throw new Error("Invalid action");
				const retries = Number.isFinite(action.retries) ? Math.max(0, action.retries) : 0;
				const maxRetries = Number.isFinite(action.maxRetries) ? Math.max(1, action.maxRetries) : this.config.maxRetries;
				return { ...action, retries, maxRetries,
					status: action.status === "failed" || retries >= maxRetries ? "failed" : "pending",
					// Never display arbitrary persisted backend errors or credentials.
					lastError: action.lastError || retries >= maxRetries ? "Transaksi belum tersinkron. Periksa transaksi sebelum mencoba lagi." : undefined,
				} satisfies QueuedAction;
			});
			return { queuedActions, lastSyncTime: typeof parsed.lastSyncTime === "number" ? parsed.lastSyncTime : 0 };
		} catch {
			// Do not overwrite records if storage is unavailable or cannot be decoded.
			this.storageReadable = false;
			return null;
		}
	}

	clearPersistedState(): void {
		try {
			localStorage.removeItem(this.config.storageKey);
		} catch (error) {
			console.error("[OfflineManager] Failed to clear persisted state:", error);
		}
	}

	// ============================================
	// UTILITY METHODS
	// ============================================

	isOnline(): boolean {
		return this.getState().isOnline;
	}

	getQueueSize(): number {
		return this.getState().queuedActions.length;
	}

	getPendingSyncCount(): number {
		return this.getState().pendingSyncCount;
	}

	// ============================================
	// CLEANUP
	// ============================================

	cleanup(): void {
		if (this.retryTimer) {
			clearInterval(this.retryTimer);
		}
		for (const dispose of this.eventCleanup.splice(0)) dispose();
	}
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let managerInstance: OfflineManager | null = null;

export function getOfflineManager(
	config?: Partial<OfflineConfig>
): OfflineManager {
	if (!managerInstance) {
		managerInstance = new OfflineManager(config);
	}
	return managerInstance;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

export function queueOfflineAction<T>(
	type: QueuedAction["type"],
	data: T
): string {
	return getOfflineManager().queueAction(type, data);
}

export function isDeviceOnline(): boolean {
	return getOfflineManager().isOnline();
}

export function getOfflineQueueSize(): number {
	return getOfflineManager().getQueueSize();
}

// Types are already exported at their definitions above.
