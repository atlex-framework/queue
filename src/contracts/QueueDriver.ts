import type { JobPayload } from '../JobPayload.js'

export interface QueuedJob {
  readonly id: string
  readonly queue: string
  readonly payload: JobPayload
  readonly attempts: number
  readonly reservedAt: Date | null
  readonly availableAt: Date
  readonly createdAt: Date

  /**
   * Delete this job from the backend.
   */
  delete(): Promise<void>

  /**
   * Release this job back onto the queue.
   *
   * @param delay - Optional delay in seconds.
   */
  release(delay?: number): Promise<void>

  /**
   * Permanently fail this job (driver should delete it and let worker log the failure).
   */
  fail(error: Error): Promise<void>

  /**
   * Mark as failed without an error object.
   */
  markAsFailed(): Promise<void>

  /**
   * @returns True if this job has been deleted.
   */
  isDeleted(): boolean

  /**
   * @returns True if this job has been released.
   */
  isReleased(): boolean

  /**
   * @returns True if this job has been marked as failed.
   */
  hasFailed(): boolean

  /**
   * Max tries from payload.
   */
  maxTries(): number

  /**
   * Max exceptions from payload.
   */
  maxExceptions(): number

  /**
   * Timeout seconds from payload.
   */
  timeout(): number

  /**
   * Retry until date, if set.
   */
  retryUntil(): Date | null
}

export interface QueueDriver {
  /**
   * Push a raw job payload onto the queue.
   *
   * @returns Backend job ID.
   */
  push(payload: JobPayload, queue?: string): Promise<string>

  /**
   * Push a job with a delay.
   *
   * @param delay - Delay in seconds.
   * @returns Backend job ID.
   */
  later(delay: number, payload: JobPayload, queue?: string): Promise<string>

  /**
   * Push multiple jobs in a single operation.
   *
   * @returns Backend job IDs.
   */
  bulk(payloads: JobPayload[], queue?: string): Promise<string[]>

  /**
   * Pop the next job from the queue.
   *
   * @returns A queued job wrapper, or null when empty.
   */
  pop(queue?: string): Promise<QueuedJob | null>

  /**
   * Delete a job by ID.
   */
  delete(jobId: string, queue?: string): Promise<void>

  /**
   * Release a job back to the queue.
   *
   * @param delay - Optional delay in seconds.
   */
  release(jobId: string, delay?: number, queue?: string): Promise<void>

  /**
   * Get the number of waiting jobs.
   */
  size(queue?: string): Promise<number>

  /**
   * Clear all jobs from the queue.
   *
   * @returns Count of removed jobs.
   */
  clear(queue?: string): Promise<number>

  /**
   * Close driver connections.
   */
  disconnect(): Promise<void>

  /**
   * Get the underlying connection.
   */
  getConnection(): unknown
}
