import type { Job } from '../Job.js'

import type { BatchRepository } from './BatchRepository.js'

export interface BatchOptions {
  readonly allowFailures: boolean
  readonly connection: string | null
  readonly queue: string | null
  readonly callbacks: {
    readonly before: string | null
    readonly progress: string | null
    readonly then: string | null
    readonly catch: string | null
    readonly finally: string | null
  }
}

export class Batch {
  public readonly id: string
  public readonly name: string
  public readonly totalJobs: number
  public readonly pendingJobs: number
  public readonly failedJobs: number
  public readonly processedJobs: number
  public readonly progress: number
  public readonly createdAt: Date
  public readonly cancelledAt: Date | null
  public readonly finishedAt: Date | null
  public readonly options: BatchOptions

  private readonly repository: BatchRepository

  public constructor(input: {
    repository: BatchRepository
    id: string
    name: string
    totalJobs: number
    pendingJobs: number
    failedJobs: number
    createdAt: Date
    cancelledAt: Date | null
    finishedAt: Date | null
    options: BatchOptions
  }) {
    this.repository = input.repository
    this.id = input.id
    this.name = input.name
    this.totalJobs = input.totalJobs
    this.pendingJobs = input.pendingJobs
    this.failedJobs = input.failedJobs
    this.processedJobs = Math.max(0, this.totalJobs - this.pendingJobs)
    this.progress =
      this.totalJobs === 0 ? 0 : Math.floor((this.processedJobs / this.totalJobs) * 100)
    this.createdAt = input.createdAt
    this.cancelledAt = input.cancelledAt
    this.finishedAt = input.finishedAt
    this.options = input.options
  }

  public async add(_jobs: Job | readonly Job[]): Promise<this> {
    // Job insertion and total/pending changes are handled by PendingBatch + QueueManager.
    return await this.fresh()
  }

  public finished(): boolean {
    return this.finishedAt !== null
  }

  public cancelled(): boolean {
    return this.cancelledAt !== null
  }

  public hasFailures(): boolean {
    return this.failedJobs > 0
  }

  public allowsFailures(): boolean {
    return this.options.allowFailures
  }

  public hasProgressedOnAllJobs(): boolean {
    return this.pendingJobs === 0
  }

  public async cancel(): Promise<void> {
    await this.repository.cancel(this.id)
  }

  public async delete(): Promise<void> {
    await this.repository.delete(this.id)
  }

  public async fresh(): Promise<this> {
    const b = await this.repository.find(this.id)
    if (b === null) {
      return this
    }
    return b as this
  }

  public async recordSuccessfulJob(_jobId: string): Promise<void> {
    await this.repository.decrementPendingJobs(this.id)
  }

  public async recordFailedJob(_jobId: string, _error: Error): Promise<void> {
    await this.repository.decrementPendingJobs(this.id)
  }
}
