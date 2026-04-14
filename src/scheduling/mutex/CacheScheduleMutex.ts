import type { ScheduledTask } from '../ScheduledTask.js'

import type { ScheduleMutex } from './ScheduleMutex.js'

interface LockEntry {
  readonly expiresAtMs: number
}

/**
 * In-memory mutex (acts as the default "cache" mutex for now).
 *
 * Note: This is process-local; it prevents overlaps within one process.
 */
export class CacheScheduleMutex implements ScheduleMutex {
  readonly #locks = new Map<string, LockEntry>()

  /**
   * Attempt to acquire a lock atomically.
   *
   * @param task - Scheduled task.
   * @param expiresAt - TTL in minutes.
   * @returns True if acquired.
   */
  async create(task: ScheduledTask, expiresAt: number): Promise<boolean> {
    const key = task.mutexName()
    const now = Date.now()
    const current = this.#locks.get(key)
    if (current !== undefined && current.expiresAtMs > now) return false
    this.#locks.set(key, { expiresAtMs: now + expiresAt * 60_000 })
    return true
  }

  /**
   * @param task - Scheduled task.
   * @returns True if lock exists and isn't stale.
   */
  async exists(task: ScheduledTask): Promise<boolean> {
    const key = task.mutexName()
    const current = this.#locks.get(key)
    if (current === undefined) return false
    if (current.expiresAtMs <= Date.now()) {
      this.#locks.delete(key)
      return false
    }
    return true
  }

  /**
   * @param task - Scheduled task.
   */
  async forget(task: ScheduledTask): Promise<void> {
    this.#locks.delete(task.mutexName())
  }

  /**
   * Clear all locks.
   */
  clearAll(): void {
    this.#locks.clear()
  }
}
