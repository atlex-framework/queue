import { Queue } from 'bullmq'
import type { Redis } from 'ioredis'

import type { BullMQConnectionConfig } from '../config/queue.js'
import type { QueueDriver, QueuedJob } from '../contracts/QueueDriver.js'
import type { JobPayload } from '../JobPayload.js'

class BullQueuedJob implements QueuedJob {
  private deleted = false
  private released = false
  private failed = false

  public constructor(
    private readonly driver: BullMQDriver,
    private readonly jobId: string,
    private readonly queueName: string,
    public readonly payload: JobPayload,
    private readonly attemptsMade: number,
    private readonly createdAtMs: number,
  ) {}

  public get id(): string {
    return this.jobId
  }

  public get queue(): string {
    return this.queueName
  }

  public get attempts(): number {
    return this.attemptsMade
  }

  public get reservedAt(): Date | null {
    return null
  }

  public get availableAt(): Date {
    return new Date()
  }

  public get createdAt(): Date {
    return new Date(this.createdAtMs)
  }

  public async delete(): Promise<void> {
    this.deleted = true
    await this.driver.delete(this.jobId, this.queueName)
  }

  public async release(delay?: number): Promise<void> {
    this.released = true
    await this.driver.release(this.jobId, delay, this.queueName)
  }

  public async fail(_error: Error): Promise<void> {
    this.failed = true
    await this.driver.delete(this.jobId, this.queueName)
  }

  public async markAsFailed(): Promise<void> {
    this.failed = true
    await this.driver.delete(this.jobId, this.queueName)
  }

  public isDeleted(): boolean {
    return this.deleted
  }

  public isReleased(): boolean {
    return this.released
  }

  public hasFailed(): boolean {
    return this.failed
  }

  public maxTries(): number {
    return this.payload.maxTries
  }

  public maxExceptions(): number {
    return this.payload.maxExceptions ?? 0
  }

  public timeout(): number {
    return this.payload.timeout
  }

  public retryUntil(): Date | null {
    return this.payload.retryUntil === null ? null : new Date(this.payload.retryUntil * 1000)
  }
}

export class BullMQDriver implements QueueDriver {
  private readonly queue: Queue

  public constructor(
    private readonly config: BullMQConnectionConfig,
    redis: Redis,
  ) {
    this.queue = new Queue(config.queue, {
      connection: redis,
      prefix: config.prefix,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    })
  }

  public async push(payload: JobPayload, queue?: string): Promise<string> {
    const q = queue ?? this.config.queue
    const job = await this.queue.add(payload.displayName, payload, {
      jobId: payload.uuid,
      removeOnComplete: true,
      delay: 0,
    })
    // BullMQ queue name is fixed at construction; per-queue routing is handled by separate connections in config.
    void q
    return job.id ?? payload.uuid
  }

  public async later(delay: number, payload: JobPayload, queue?: string): Promise<string> {
    const q = queue ?? this.config.queue
    const job = await this.queue.add(payload.displayName, payload, {
      jobId: payload.uuid,
      removeOnComplete: true,
      delay: delay * 1000,
    })
    void q
    return job.id ?? payload.uuid
  }

  public async bulk(payloads: JobPayload[], queue?: string): Promise<string[]> {
    const q = queue ?? this.config.queue
    const jobs = await this.queue.addBulk(
      payloads.map((p) => ({
        name: p.displayName,
        data: p,
        opts: { jobId: p.uuid, delay: (p.delay ?? 0) * 1000, removeOnComplete: true },
      })),
    )
    void q
    return jobs.map((j, i) => j.id ?? payloads[i]!.uuid)
  }

  public async pop(_queue?: string): Promise<QueuedJob | null> {
    // BullMQ is worker-driven; for compatibility with Atlex Worker we emulate "pop" by peeking waiting jobs.
    const jobs = await this.queue.getJobs(['waiting'], 0, 0, true)
    const job = jobs[0]
    if (!job) return null
    const payload = job.data as JobPayload
    return new BullQueuedJob(
      this,
      job.id ?? payload.uuid,
      this.config.queue,
      payload,
      job.attemptsMade + 1,
      job.timestamp ?? Date.now(),
    )
  }

  public async delete(jobId: string, _queue?: string): Promise<void> {
    const job = await this.queue.getJob(jobId)
    await job?.remove()
  }

  public async release(jobId: string, delay?: number, _queue?: string): Promise<void> {
    const job = await this.queue.getJob(jobId)
    if (!job) return
    const ms = (delay ?? 0) * 1000
    if (ms <= 0) {
      // Re-queue by moving back to waiting.
      await job.moveToWait()
      return
    }
    await job.moveToDelayed(Date.now() + ms)
  }

  public async size(): Promise<number> {
    const counts = await this.queue.getJobCounts('waiting', 'delayed')
    return (counts.waiting ?? 0) + (counts.delayed ?? 0)
  }

  public async clear(): Promise<number> {
    const before = await this.size()
    await this.queue.drain(true)
    return before
  }

  public async disconnect(): Promise<void> {
    await this.queue.close()
  }

  public getConnection(): unknown {
    return this.queue
  }
}
