import type { Job } from './Job.js'
import { PendingDispatch } from './PendingDispatch.js'
import type { QueueManager } from './QueueManager.js'

let manager: QueueManager | null = null

/**
 * @internal Set the QueueManager used by the module-level dispatch helpers.
 */
export function _setQueueManager(next: QueueManager | null): void {
  manager = next
}

/**
 * @internal Returns the manager set by {@link _setQueueManager}, if any.
 */
export function _getQueueManager(): QueueManager | null {
  return manager
}

function requireManager(): QueueManager {
  if (manager === null) {
    throw new Error(
      'Queue dispatch is not configured. Register QueueServiceProvider or call _setQueueManager().',
    )
  }
  return manager
}

/**
 * Dispatch a job to the queue.
 */
export function dispatch(job: Job): PendingDispatch {
  return new PendingDispatch(job, async (j) => await requireManager().push(j))
}

/**
 * Execute a job immediately in the current process (bypass queue backend).
 */
export async function dispatchSync(job: Job): Promise<void> {
  await requireManager().dispatchSync(job)
}

/**
 * Dispatch after the HTTP response is sent.
 *
 * In this package, this is implemented as a microtask deferral; frameworks can
 * provide stronger guarantees by hooking response lifecycle.
 */
export function dispatchAfterResponse(job: Job): void {
  queueMicrotask(() => {
    void dispatch(job).dispatch()
  })
}
