/**
 * OFFLINE MANAGER
 *
 * Mendukung offline mode dengan queue, sync, dan caching.
 */

import { get, type Writable, writable } from "svelte/store";

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
	 * @default "tkmpos-offline"
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
	storageKey: "tkmpos-offline",
	maxQueueSize: 100,
};

// ============================================
// OFFLINE MANAGER CLASS
// ============================================

export class OfflineManager {
	private readonly config: OfflineConfig;
	private readonly state: Writable<OfflineState>;
	private readonly retryTimer: NodeJS.Timeout | null = null;

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

		let syncedCount = 0;
		let failedCount = 0;

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
					// Remove from queue but could be moved to failed actions
					this.removeAction(action.id);
					failedCount++;
				}
			}
		}

		this.setState({
			lastSyncTime: Date.now(),
			pendingSyncCount: this.getState().queuedActions.length,
		});

		console.log(
			`[OfflineManager] Sync complete: ${syncedCount} synced, ${failedCount} failed`
		);
	}

	private executeAction(action: QueuedAction): void {
		// This should be implemented by the consuming app
		// using actual API calls
		console.log(
			`[OfflineManager] Executing action: ${action.type}`,
			action.data
		);

		// Example implementation:
		switch (action.type) {
			case "createOrder":
				// await api.orders.createOrder(action.data);
				break;
			// Add other action types as needed
			default:
				console.warn(`[OfflineManager] Unknown action type: ${action.type}`);
		}
	}

	private startSyncWhenOnline(): void {
		// Already handled by event listener
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
			clearTimeout(this.retryTimer);
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

// ============================================
// EXPORT ALL
// ============================================

export type { QueuedAction, OfflineState, OfflineConfig };
