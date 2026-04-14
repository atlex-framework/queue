import type { Batch } from './Batch.js'
import type { PendingBatch } from './PendingBatch.js'

export interface UpdatedBatchStatus {
  readonly pendingJobs: number
  readonly failedJobs: number
  readonly finishedJobs: number
  readonly allJobsHaveRanOrFailed: boolean
}

export interface BatchRepository {
  get(limit: number, before?: string): Promise<Batch[]>
  find(batchId: string): Promise<Batch | null>
  store(pendingBatch: PendingBatch): Promise<Batch>
  incrementTotalJobs(batchId: string, amount: number): Promise<void>
  decrementPendingJobs(batchId: string): Promise<UpdatedBatchStatus>
  markAsFinished(batchId: string): Promise<void>
  cancel(batchId: string): Promise<void>
  delete(batchId: string): Promise<void>
  prune(hours: number): Promise<number>
  transaction(callback: () => Promise<void>): Promise<void>
}
