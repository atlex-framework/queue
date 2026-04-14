import type { QueryBuilder } from '@atlex/orm'
import { v4 as uuidv4 } from 'uuid'

import type { DatabaseConnectionConfig } from '../config/queue.js'
import type { QueueDriver, QueuedJob } from '../contracts/QueueDriver.js'
import type { JobPayload } from '../JobPayload.js'

interface JobsRow {
  id: number
  uuid: string
  queue: string
  payload: string
  attempts: number
  reserved_at: number | null
  available_at: number
  created_at: number
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function parsePayload(raw: string): JobPayload {
  const parsed: unknown = JSON.parse(raw)
  return parsed as JobPayload
}

class DatabaseQueuedJob implements QueuedJob {
  private deleted = false
  private released = false
  private failed = false

  public constructor(
    private readonly driver: DatabaseDriver,
    private readonly row: JobsRow,
    public readonly payload: JobPayload,
  ) {}

  public get id(): string {
    return this.row.uuid
  }

  public get queue(): string {
    return this.row.queue
  }

  public get attempts(): number {
    return this.row.attempts
  }

  public get reservedAt(): Date | null {
    return this.row.reserved_at === null ? null : new Date(this.row.reserved_at * 1000)
  }

  public get availableAt(): Date {
    return new Date(this.row.available_at * 1000)
  }

  public get createdAt(): Date {
    return new Date(this.row.created_at * 1000)
  }

  public async delete(): Promise<void> {
    this.deleted = true
    await this.driver.delete(this.id, this.queue)
  }

  public async release(delay?: number): Promise<void> {
    this.released = true
    await this.driver.release(this.id, delay, this.queue)
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

export class DatabaseDriver implements QueueDriver {
  public constructor(
    private readonly db: QueryBuilder,
    private readonly config: DatabaseConnectionConfig,
  ) {}

  public async push(payload: JobPayload, queue?: string): Promise<string> {
    const q = queue ?? this.config.queue
    const uuid = payload.uuid || uuidv4()
    const available = nowSeconds()
    await this.db
      .clone()
      .table(this.config.table)
      .insert({
        uuid,
        queue: q,
        payload: JSON.stringify(payload),
        attempts: 0,
        reserved_at: null,
        available_at: available,
        created_at: available,
      })
    return uuid
  }

  public async later(delay: number, payload: JobPayload, queue?: string): Promise<string> {
    const q = queue ?? this.config.queue
    const uuid = payload.uuid || uuidv4()
    const now = nowSeconds()
    await this.db
      .clone()
      .table(this.config.table)
      .insert({
        uuid,
        queue: q,
        payload: JSON.stringify(payload),
        attempts: 0,
        reserved_at: null,
        available_at: now + delay,
        created_at: now,
      })
    return uuid
  }

  public async bulk(payloads: JobPayload[], queue?: string): Promise<string[]> {
    const q = queue ?? this.config.queue
    const now = nowSeconds()
    const rows = payloads.map((p) => ({
      uuid: p.uuid || uuidv4(),
      queue: q,
      payload: JSON.stringify(p),
      attempts: 0,
      reserved_at: null,
      available_at: now,
      created_at: now,
    }))
    await this.db.clone().table(this.config.table).insert(rows)
    return rows.map((r) => r.uuid)
  }

  public async pop(queue?: string): Promise<QueuedJob | null> {
    const q = queue ?? this.config.queue
    const now = nowSeconds()
    const retryAfter = this.config.retryAfter

    const row = await this.db.clone().transaction(async (trx) => {
      const qb = trx.clone().table(this.config.table)
      // NOTE: we rely on row locking via lockForUpdate(); SKIP LOCKED isn't exposed in the ORM wrapper yet.
      const candidate = (await qb
        .clone()
        .where('queue', q)
        .where('available_at', '<=', now)
        .where((inner) => {
          inner.whereNull('reserved_at').orWhere('reserved_at', '<', now - retryAfter)
        })
        .orderBy('id', 'asc')
        .limit(1)
        .lockForUpdate()
        .first()) as unknown as JobsRow | null

      if (candidate === null) return null

      await qb
        .clone()
        .where('id', candidate.id)
        .update({ reserved_at: now, attempts: candidate.attempts + 1 })

      return { ...candidate, reserved_at: now, attempts: candidate.attempts + 1 }
    })

    if (row === null) return null
    const payload = parsePayload(row.payload)
    payload.attempts = row.attempts
    return new DatabaseQueuedJob(this, row, payload)
  }

  public async delete(jobId: string, _queue?: string): Promise<void> {
    await this.db.clone().table(this.config.table).where('uuid', jobId).delete()
  }

  public async release(jobId: string, delay?: number, _queue?: string): Promise<void> {
    const now = nowSeconds()
    const availableAt = delay !== undefined ? now + delay : now
    await this.db
      .clone()
      .table(this.config.table)
      .where('uuid', jobId)
      .update({ reserved_at: null, available_at: availableAt })
  }

  public async size(queue?: string): Promise<number> {
    const q = queue ?? this.config.queue
    return await this.db.clone().table(this.config.table).where('queue', q).count()
  }

  public async clear(queue?: string): Promise<number> {
    const q = queue ?? this.config.queue
    const n = await this.db.clone().table(this.config.table).where('queue', q).delete()
    return n
  }

  public async disconnect(): Promise<void> {
    return
  }

  public getConnection(): unknown {
    return this.db
  }
}
