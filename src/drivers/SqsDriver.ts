import {
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs'
import { v4 as uuidv4 } from 'uuid'

import type { SqsConnectionConfig } from '../config/queue.js'
import type { QueueDriver, QueuedJob } from '../contracts/QueueDriver.js'
import type { JobPayload } from '../JobPayload.js'

type ReceiptHandle = string

class SqsQueuedJob implements QueuedJob {
  private deleted = false
  private released = false
  private failed = false

  public constructor(
    private readonly driver: SqsDriver,
    public readonly id: string,
    public readonly queue: string,
    public readonly payload: JobPayload,
    private readonly createdAtValue: Date,
  ) {}

  public get attempts(): number {
    return this.payload.attempts
  }

  public get reservedAt(): Date | null {
    return new Date()
  }

  public get availableAt(): Date {
    return new Date()
  }

  public get createdAt(): Date {
    return this.createdAtValue
  }

  public async delete(): Promise<void> {
    this.deleted = true
    await this.driver.delete(this.id, this.queue)
  }

  public async release(_delay?: number): Promise<void> {
    this.released = true
    // SQS release is approximated via visibility timeout; not supported here.
    await this.driver.delete(this.id, this.queue)
  }

  public async fail(_error: Error): Promise<void> {
    this.failed = true
    await this.driver.delete(this.id, this.queue)
  }

  public async markAsFailed(): Promise<void> {
    this.failed = true
    await this.driver.delete(this.id, this.queue)
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

export class SqsDriver implements QueueDriver {
  private readonly client: SQSClient
  private readonly receiptHandles = new Map<string, ReceiptHandle>()

  public constructor(private readonly config: SqsConnectionConfig) {
    this.client = new SQSClient({
      region: config.region,
      credentials: {
        accessKeyId: config.credentials.key,
        secretAccessKey: config.credentials.secret,
      },
    })
  }

  private queueUrl(queue?: string): string {
    const name = queue ?? this.config.queue
    return `${this.config.prefix}${name}${this.config.suffix}`
  }

  public async push(payload: JobPayload, queue?: string): Promise<string> {
    const url = this.queueUrl(queue)
    const uuid = payload.uuid || uuidv4()
    payload.uuid = uuid
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: url,
        MessageBody: JSON.stringify(payload),
        DelaySeconds: 0,
        MessageGroupId: this.config.suffix.includes('.fifo')
          ? (queue ?? this.config.queue)
          : undefined,
      }),
    )
    return uuid
  }

  public async later(delay: number, payload: JobPayload, queue?: string): Promise<string> {
    const url = this.queueUrl(queue)
    const uuid = payload.uuid || uuidv4()
    payload.uuid = uuid
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: url,
        MessageBody: JSON.stringify(payload),
        DelaySeconds: Math.max(0, Math.min(900, delay)),
        MessageGroupId: this.config.suffix.includes('.fifo')
          ? (queue ?? this.config.queue)
          : undefined,
      }),
    )
    return uuid
  }

  public async bulk(payloads: JobPayload[], queue?: string): Promise<string[]> {
    const ids: string[] = []
    for (const p of payloads) {
      ids.push(await this.push(p, queue))
    }
    return ids
  }

  public async pop(queue?: string): Promise<QueuedJob | null> {
    const url = this.queueUrl(queue)
    const out = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: url,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 0,
        VisibilityTimeout: this.config.retryAfter,
      }),
    )
    const msg = out.Messages?.[0]
    if (!msg?.Body || !msg.ReceiptHandle) return null
    const payload = JSON.parse(msg.Body) as JobPayload
    this.receiptHandles.set(payload.uuid, msg.ReceiptHandle)
    return new SqsQueuedJob(this, payload.uuid, queue ?? this.config.queue, payload, new Date())
  }

  public async delete(jobId: string, queue?: string): Promise<void> {
    const url = this.queueUrl(queue)
    const handle = this.receiptHandles.get(jobId)
    if (!handle) return
    await this.client.send(new DeleteMessageCommand({ QueueUrl: url, ReceiptHandle: handle }))
    this.receiptHandles.delete(jobId)
  }

  public async release(jobId: string, delay?: number, queue?: string): Promise<void> {
    // SQS does not support requeueing a specific message without receipt handle; approximate by re-sending.
    void jobId
    void delay
    void queue
  }

  public async size(queue?: string): Promise<number> {
    const url = this.queueUrl(queue)
    const out = await this.client.send(
      new GetQueueAttributesCommand({
        QueueUrl: url,
        AttributeNames: ['ApproximateNumberOfMessages'],
      }),
    )
    const raw = out.Attributes?.ApproximateNumberOfMessages
    return raw ? Number.parseInt(raw, 10) : 0
  }

  public async clear(queue?: string): Promise<number> {
    const before = await this.size(queue)
    await this.client.send(new PurgeQueueCommand({ QueueUrl: this.queueUrl(queue) }))
    return before
  }

  public async disconnect(): Promise<void> {
    this.client.destroy()
  }

  public getConnection(): unknown {
    return this.client
  }
}
