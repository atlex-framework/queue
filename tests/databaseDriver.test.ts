import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import { ConnectionRegistry, QueryBuilder } from '@atlex/orm'
import { DatabaseDriver } from '../src/drivers/DatabaseDriver.js'
import type { DatabaseConnectionConfig } from '../src/config/queue.js'
import type { JobPayload } from '../src/JobPayload.js'

describe('DatabaseDriver', () => {
  beforeEach(() => {
    ConnectionRegistry.resetForTests()
    ConnectionRegistry.instance().register('default', {
      driver: 'better-sqlite3',
      database: ':memory:',
      filename: ':memory:',
    })
  })

  afterEach(async () => {
    try {
      const conn = ConnectionRegistry.instance().default()
      await conn.disconnect()
    } catch {
      // ignore
    }
  })

  it('push() then pop() reserves a job', async () => {
    const conn = ConnectionRegistry.instance().default()
    await conn._knex().schema.createTable('jobs', (t) => {
      t.increments('id').primary()
      t.string('uuid').notNullable().unique()
      t.string('queue').notNullable().index()
      t.text('payload').notNullable()
      t.integer('attempts').notNullable().defaultTo(0)
      t.integer('reserved_at').nullable()
      t.integer('available_at').notNullable().index()
      t.integer('created_at').notNullable()
    })

    const cfg: DatabaseConnectionConfig = {
      driver: 'database',
      connection: 'default',
      table: 'jobs',
      queue: 'default',
      retryAfter: 60,
      pollInterval: 1000,
      concurrency: 1,
    }
    const qb = new QueryBuilder(conn)
    const driver = new DatabaseDriver(qb, cfg)

    const payload: JobPayload = {
      uuid: 'u1',
      displayName: 'Test',
      job: 'TestJob',
      data: { args: [] },
      attempts: 0,
      maxTries: 1,
      maxExceptions: null,
      timeout: 60,
      backoff: 0,
      retryUntil: null,
      connection: null,
      queue: 'default',
      delay: null,
      chained: [],
      chainConnection: null,
      chainQueue: null,
      chainCatchCallbackSerialized: null,
      batchId: null,
      tags: [],
      pushedAt: Date.now(),
      encrypted: false,
    }

    await driver.push(payload)
    const job = await driver.pop('default')
    expect(job).not.toBeNull()
    expect(job?.payload.uuid).toBe('u1')
    expect(job?.attempts).toBe(1)
  })
})
