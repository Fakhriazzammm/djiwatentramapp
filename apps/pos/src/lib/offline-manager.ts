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
}

type ActionExecutor = (action: QueuedAction) => Promise<void>;

export interface OfflineState {
	isOnline: boolean;
	isOfflineMode: boolean;
	queuedActions: QueuedAction[];
	pendingSyncCount: number;
	lastSyncTime: number;
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
	private isSyncing = false;

	constructor(config: Partial<OfflineConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };

		// Load persisted state
		const persistedState = this.loadPersistedState();

		this.state = writable<OfflineState>({
			isOnline: navigator.onLine,
			isOfflineMode: false,
			queuedActions: persistedState?.queuedActions || [],
			pendingSyncCount: 0,
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
		this.state.update((current) => {
			const newState = { ...current, ...update };
			this.persistState(newState);
			return newState;
		});
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
			this.setState({ isOnline: true });
			this.syncQueuedActions();
		};

		const handleOffline = () => {
			console.log("[OfflineManager] Connection lost");
			this.setState({ isOnline: false });
		};

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		// Cleanup on page unload
		window.addEventListener("beforeunload", () => {
			this.cleanup();
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
		};

		this.setState({
			queuedActions: [...currentState.queuedActions, action],
			pendingSyncCount: currentState.pendingSyncCount + 1,
		});

		console.log(`[OfflineManager] Queued action: ${action.id}`);
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

	async syncQueuedActions(): Promise<void> {
		if (this.isSyncing) {
			return;
		}
		if (!this.getState().isOnline) {
			console.log("[OfflineManager] Still offline, skipping sync");
			return;
		}

		const currentState = this.getState();
		const { queuedActions } = currentState;

		if (queuedActions.length === 0) {
			console.log("[OfflineManager] No actions to sync");
			return;
		}

		console.log(`[OfflineManager] Syncing ${queuedActions.length} actions...`);
		this.isSyncing = true;

		let syncedCount = 0;
		let failedCount = 0;

		try {
			for (const action of queuedActions) {
				try {
					await this.executeAction(action);
					this.removeAction(action.id);
					syncedCount++;
				} catch (error) {
					console.error(`[OfflineManager] Failed to sync ${action.id}:`, error);

					// Increment retry count
					action.retries++;

					if (action.retries >= action.maxRetries) {
						console.error(
							`[OfflineManager] Max retries exceeded for ${action.id}`
						);
						this.removeAction(action.id);
						failedCount++;
					}
				}
			}
		} finally {
			this.isSyncing = false;
			this.setState({
				lastSyncTime: Date.now(),
				pendingSyncCount: this.getState().queuedActions.length,
			});
		}

		console.log(
			`[OfflineManager] Sync complete: ${syncedCount} synced, ${failedCount} failed`
		);
	}

	private async executeAction(action: QueuedAction): Promise<void> {
		console.log(
			`[OfflineManager] Executing action: ${action.type}`,
			action.data
		);

		const executor = this.executors.get(action.type);
		if (!executor) {
			throw new Error(`No executor registered for ${action.type}`);
		}

		await executor(action);
	}

	private startSyncWhenOnline(): void {
		if (this.retryTimer) {
			clearInterval(this.retryTimer);
		}
		this.retryTimer = setInterval(() => {
			if (this.getState().isOnline && this.getState().queuedActions.length > 0) {
				void this.syncQueuedActions();
			}
		}, this.config.retryInterval);
	}

	// ============================================
	// PERSISTENCE
	// ============================================

	private persistState(state: OfflineState): void {
		try {
			const toPersist = {
				queuedActions: state.queuedActions,
				lastSyncTime: state.lastSyncTime,
			};
			localStorage.setItem(this.config.storageKey, JSON.stringify(toPersist));
		} catch (error) {
			console.error("[OfflineManager] Failed to persist state:", error);
		}
	}

	private loadPersistedState(): Partial<OfflineState> | null {
		try {
			const data = localStorage.getItem(this.config.storageKey);
			if (data) {
				return JSON.parse(data);
			}
		} catch (error) {
			console.error("[OfflineManager] Failed to load persisted state:", error);
		}
		return null;
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
		// Remove event listeners is handled by page unload
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
