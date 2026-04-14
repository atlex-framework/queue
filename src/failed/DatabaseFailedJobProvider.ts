import type { QueryBuilder } from '@atlex/orm'
import { v4 as uuidv4 } from 'uuid'

import type { JobPayload } from '../JobPayload.js'

import type { FailedJob, FailedJobProvider } from './FailedJobProvider.js'

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function truncate64kb(input: string): string {
  if (input.length <= 65_536) return input
  return input.slice(0, 65_536)
}

interface FailedRow {
  id: number
  uuid: string
  connection: string
  queue: string
  payload: string
  exception: string
  failed_at: number
}

export class DatabaseFailedJobProvider implements FailedJobProvider {
  public constructor(
    private readonly db: QueryBuilder,
    private readonly table: string,
  ) {}

  public async log(
    connection: string,
    queue: string,
    payload: JobPayload,
    error: Error,
    failedAt: Date,
  ): Promise<string> {
    const uuid = uuidv4()
    const exception = truncate64kb(error.stack ?? error.message)
    await this.db
      .clone()
      .table(this.table)
      .insert({
        uuid,
        connection,
        queue,
        payload: JSON.stringify(payload),
        exception,
        failed_at: Math.floor(failedAt.getTime() / 1000),
      })
    return uuid
  }

  public async find(id: string): Promise<FailedJob | null> {
    const row = (await this.db
      .clone()
      .table(this.table)
      .where('uuid', id)
      .first()) as unknown as FailedRow | null
    if (row === null) return null
    return this.toFailedJob(row)
  }

  public async all(): Promise<FailedJob[]> {
    const rows = (await this.db
      .clone()
      .table(this.table)
      .orderBy('id', 'desc')
      .get()) as unknown as FailedRow[]
    return rows.map((r) => this.toFailedJob(r))
  }

  public async forget(id: string): Promise<boolean> {
    const n = await this.db.clone().table(this.table).where('uuid', id).delete()
    return n > 0
  }

  public async flush(hours?: number): Promise<number> {
    if (hours === undefined) {
      return await this.db.clone().table(this.table).delete()
    }
    const cutoff = nowSeconds() - Math.floor(hours * 3600)
    return await this.db.clone().table(this.table).where('failed_at', '<', cutoff).delete()
  }

  public async count(): Promise<number> {
    return await this.db.clone().table(this.table).count()
  }

  public async ids(queue?: string): Promise<string[]> {
    const qb = this.db.clone().table(this.table).select('uuid')
    if (queue !== undefined) {
      qb.where('queue', queue)
    }
    const rows = (await qb.get()) as unknown as { uuid: string }[]
    return rows.map((r) => r.uuid)
  }

  private toFailedJob(row: FailedRow): FailedJob {
    return {
      id: String(row.id),
      uuid: row.uuid,
      connection: row.connection,
      queue: row.queue,
      payload: JSON.parse(row.payload) as JobPayload,
      exception: row.exception,
      failedAt: new Date(row.failed_at * 1000),
    }
  }
}
