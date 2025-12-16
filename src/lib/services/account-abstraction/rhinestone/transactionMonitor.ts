/**
 * Transaction Monitor for Cross-Chain Swaps
 *
 * Monitors the status of Rhinestone intent operations and provides
 * real-time updates on cross-chain swap progress.
 */

import { writable, type Readable } from 'svelte/store';
import { getRhinestoneClient } from './client';

// =============================================================================
// Types
// =============================================================================

export type IntentStatus =
	| 'pending'
	| 'preconfirmed'
	| 'filled'
	| 'completed'
	| 'failed'
	| 'expired';

export interface MonitoredTransaction {
	intentId: string;
	status: IntentStatus;
	sourceChainId: number;
	targetChainId: number;
	startTime: number;
	lastUpdate: number;
	fillTxHash?: string;
	error?: string;
}

export interface TransactionUpdate {
	intentId: string;
	previousStatus: IntentStatus;
	newStatus: IntentStatus;
	txHash?: string;
	error?: string;
}

// =============================================================================
// Constants
// =============================================================================

// Poll interval for status updates
const POLL_INTERVAL_MS = 3000; // 3 seconds

// Max time to monitor a transaction before giving up
const MAX_MONITOR_DURATION_MS = 10 * 60 * 1000; // 10 minutes

// =============================================================================
// Transaction Monitor Class
// =============================================================================

export class TransactionMonitor {
	private transactions: Map<string, MonitoredTransaction> = new Map();
	private pollIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
	private statusCallbacks: Map<string, ((update: TransactionUpdate) => void)[]> = new Map();

	// Svelte store for reactive updates
	private store = writable<Map<string, MonitoredTransaction>>(new Map());

	/**
	 * Get the store for reactive UI updates
	 */
	get subscribe(): Readable<Map<string, MonitoredTransaction>>['subscribe'] {
		return this.store.subscribe;
	}

	/**
	 * Start monitoring a transaction
	 */
	startMonitoring(
		intentId: string,
		sourceChainId: number,
		targetChainId: number,
		onStatusChange?: (update: TransactionUpdate) => void
	): void {
		// Check if already monitoring
		if (this.transactions.has(intentId)) {
			if (onStatusChange) {
				this.addCallback(intentId, onStatusChange);
			}
			return;
		}

		// Create new monitored transaction
		const tx: MonitoredTransaction = {
			intentId,
			status: 'pending',
			sourceChainId,
			targetChainId,
			startTime: Date.now(),
			lastUpdate: Date.now()
		};

		this.transactions.set(intentId, tx);
		this.updateStore();

		// Add callback if provided
		if (onStatusChange) {
			this.addCallback(intentId, onStatusChange);
		}

		// Start polling
		this.startPolling(intentId);
	}

	/**
	 * Add a status change callback
	 */
	private addCallback(intentId: string, callback: (update: TransactionUpdate) => void): void {
		const callbacks = this.statusCallbacks.get(intentId) || [];
		callbacks.push(callback);
		this.statusCallbacks.set(intentId, callbacks);
	}

	/**
	 * Start polling for status updates
	 */
	private startPolling(intentId: string): void {
		const poll = async () => {
			const tx = this.transactions.get(intentId);
			if (!tx) {
				this.stopPolling(intentId);
				return;
			}

			// Check if monitoring has exceeded max duration
			if (Date.now() - tx.startTime > MAX_MONITOR_DURATION_MS) {
				this.updateStatus(intentId, 'expired', undefined, 'Monitoring timeout exceeded');
				this.stopPolling(intentId);
				return;
			}

			try {
				const client = getRhinestoneClient();
				const sdk = client.getSDK();
				const statusResult = await sdk.getIntentStatus(BigInt(intentId));

				// Map Rhinestone status to our status
				const newStatus = this.mapStatus(statusResult.status);

				if (newStatus !== tx.status) {
					const txHash = statusResult.txHash;
					this.updateStatus(intentId, newStatus, txHash);
				}

				// Stop polling if in terminal state
				if (['completed', 'failed', 'expired'].includes(newStatus)) {
					this.stopPolling(intentId);
				}
			} catch (error) {
				console.warn(
					`Failed to get status for intent ${intentId}:`,
					error instanceof Error ? error.message : 'Unknown error'
				);
				// Continue polling on error, don't give up
			}
		};

		// Initial poll
		poll();

		// Set up interval
		const interval = setInterval(poll, POLL_INTERVAL_MS);
		this.pollIntervals.set(intentId, interval);
	}

	/**
	 * Stop polling for a transaction
	 */
	private stopPolling(intentId: string): void {
		const interval = this.pollIntervals.get(intentId);
		if (interval) {
			clearInterval(interval);
			this.pollIntervals.delete(intentId);
		}
	}

	/**
	 * Map Rhinestone status to our status type
	 */
	private mapStatus(rhinestoneStatus: string): IntentStatus {
		switch (rhinestoneStatus.toUpperCase()) {
			case 'PENDING':
				return 'pending';
			case 'PRECONFIRMED':
				return 'preconfirmed';
			case 'FILLED':
				return 'filled';
			case 'COMPLETED':
			case 'CLAIMED':
				return 'completed';
			case 'FAILED':
				return 'failed';
			case 'EXPIRED':
				return 'expired';
			default:
				return 'pending';
		}
	}

	/**
	 * Update transaction status and notify callbacks
	 */
	private updateStatus(
		intentId: string,
		newStatus: IntentStatus,
		txHash?: string,
		error?: string
	): void {
		const tx = this.transactions.get(intentId);
		if (!tx) return;

		const previousStatus = tx.status;
		tx.status = newStatus;
		tx.lastUpdate = Date.now();
		if (txHash) tx.fillTxHash = txHash;
		if (error) tx.error = error;

		this.updateStore();

		// Notify callbacks
		const callbacks = this.statusCallbacks.get(intentId) || [];
		const update: TransactionUpdate = {
			intentId,
			previousStatus,
			newStatus,
			txHash,
			error
		};

		callbacks.forEach((callback) => {
			try {
				callback(update);
			} catch (e) {
				console.error('Error in status callback:', e);
			}
		});
	}

	/**
	 * Update the Svelte store
	 */
	private updateStore(): void {
		this.store.set(new Map(this.transactions));
	}

	/**
	 * Get current status of a transaction
	 */
	getStatus(intentId: string): MonitoredTransaction | undefined {
		return this.transactions.get(intentId);
	}

	/**
	 * Stop monitoring a transaction
	 */
	stopMonitoring(intentId: string): void {
		this.stopPolling(intentId);
		this.transactions.delete(intentId);
		this.statusCallbacks.delete(intentId);
		this.updateStore();
	}

	/**
	 * Stop monitoring all transactions
	 */
	stopAll(): void {
		for (const intentId of this.transactions.keys()) {
			this.stopPolling(intentId);
		}
		this.transactions.clear();
		this.statusCallbacks.clear();
		this.updateStore();
	}

	/**
	 * Get all monitored transactions
	 */
	getAll(): MonitoredTransaction[] {
		return Array.from(this.transactions.values());
	}

	/**
	 * Check if a transaction is being monitored
	 */
	isMonitoring(intentId: string): boolean {
		return this.transactions.has(intentId);
	}
}

// =============================================================================
// Singleton Instance
// =============================================================================

let monitorInstance: TransactionMonitor | null = null;

/**
 * Get the transaction monitor singleton
 */
export function getTransactionMonitor(): TransactionMonitor {
	if (!monitorInstance) {
		monitorInstance = new TransactionMonitor();
	}
	return monitorInstance;
}

/**
 * Convenience function to start monitoring
 */
export function monitorTransaction(
	intentId: string,
	sourceChainId: number,
	targetChainId: number,
	onStatusChange?: (update: TransactionUpdate) => void
): void {
	getTransactionMonitor().startMonitoring(intentId, sourceChainId, targetChainId, onStatusChange);
}

/**
 * Get status description for display
 */
export function getStatusDescription(status: IntentStatus): string {
	switch (status) {
		case 'pending':
			return 'Waiting for solver...';
		case 'preconfirmed':
			return 'Solver accepted, executing...';
		case 'filled':
			return 'Transaction submitted...';
		case 'completed':
			return 'Swap completed!';
		case 'failed':
			return 'Swap failed';
		case 'expired':
			return 'Swap expired';
		default:
			return 'Unknown status';
	}
}
