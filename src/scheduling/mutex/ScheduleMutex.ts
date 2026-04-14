import type { ScheduledTask } from '../ScheduledTask.js'

/**
 * Mutex contract for overlap prevention.
 */
export interface ScheduleMutex {
  /**
   * Attempt to acquire a lock for the task.
   *
   * @param task - Scheduled task.
   * @param expiresAt - Lock TTL in minutes.
   * @returns True if acquired.
   */
  create(task: ScheduledTask, expiresAt: number): Promise<boolean>

  /**
   * Check if a lock exists for the task.
   *
   * @param task - Scheduled task.
   * @returns True if lock exists.
   */
  exists(task: ScheduledTask): Promise<boolean>

  /**
   * Release the lock for the task.
   *
   * @param task - Scheduled task.
   */
  forget(task: ScheduledTask): Promise<void>
}
