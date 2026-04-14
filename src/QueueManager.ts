import type { Application } from '@atlex/core'
import type { QueryBuilder } from '@atlex/orm'
import type { Redis } from 'ioredis'

import type { QueueConfig, QueueConnectionConfig } from './config/queue.js'
import type { QueueDriver } from './contracts/QueueDriver.js'
import { BullMQDriver } from './drivers/BullMQDriver.js'
import { DatabaseDriver } from './drivers/DatabaseDriver.js'
import { NullDriver } from './drivers/NullDriver.js'
import { SqsDriver } from './drivers/SqsDriver.js'
import { SyncDriver } from './drivers/SyncDriver.js'
import { type Job } from './Job.js'
import type { JobPayload } from './JobPayload.js'

export interface QueueManagerBindings {
  /**
   * Resolve an ORM query builder for a configured connection name.
   */
  readonly query?: (connectionName: string) => QueryBuilder

  /**
   * Resolve a Redis client by name.
   */
  readonly redis?: (connectionName: string) => Redis

  /**
   * Optional owning application (for SyncDriver pipeline context).
   */
  readonly app?: Application
}

type DriverFactory = (cfg: QueueConnectionConfig) => QueueDriver

export class QueueManager {
  private defaultDriver: string
  private readonly drivers = new Map<string, QueueDriver>()
  private readonly customFactories = new Map<string, DriverFactory>()

  public constructor(
    private readonly config: QueueConfig,
    private readonly bindings: QueueManagerBindings = {},
  ) {
    this.defaultDriver = config.default
  }

  /**
   * Get a driver instance for the given connection (or default).
   */
  public connection(name?: string): QueueDriver {
    const resolved = (name ?? this.defaultDriver).trim()
    const existing = this.drivers.get(resolved)
    if (existing !== undefined) return existing

    const cfg = this.config.connections[resolved]
    if (cfg === undefined) {
      throw new Error(`QueueManager.connection: connection "${resolved}" not found in config.`)
    }

    const driver = this.createDriver(cfg)
    this.drivers.set(resolved, driver)
    return driver
  }

  /**
   * Push a job onto the configured connection.
   */
  public async push(job: Job): Promise<string> {
    const payload = job.serialize()
    const connectionName = payload.connection ?? this.defaultDriver
    const driver = this.connection(connectionName)
    const queue = payload.queue
    const id =
      payload.delay !== null && payload.delay > 0
        ? await driver.later(payload.delay, payload, queue)
        : await driver.push(payload, queue)
    return id
  }

  /**
   * Push a job with delay (seconds).
   */
  public async later(delay: number, job: Job): Promise<string> {
    const payload = job.serialize()
    const connectionName = payload.connection ?? this.defaultDriver
    const driver = this.connection(connectionName)
    return await driver.later(delay, payload, payload.queue)
  }

  /**
   * Push multiple jobs.
   */
  public async bulk(jobs: readonly Job[]): Promise<string[]> {
    const payloads: JobPayload[] = jobs.map((j) => j.serialize())
    if (payloads.length === 0) return []
    const first = payloads[0]!
    const connectionName = first.connection ?? this.defaultDriver
    const driver = this.connection(connectionName)
    return await driver.bulk(payloads, first.queue)
  }

  /**
   * Get the size of a queue.
   */
  public async size(queue?: string, connection?: string): Promise<number> {
    return await this.connection(connection).size(queue)
  }

  /**
   * Register a custom driver factory.
   */
  public extend(driver: string, factory: (config: QueueConnectionConfig) => QueueDriver): void {
    this.customFactories.set(driver, factory)
  }

  /**
   * Get all configured connections.
   */
  public getConnections(): string[] {
    return Object.keys(this.config.connections)
  }

  /**
   * Disconnect a specific connection (or all).
   */
  public async disconnect(name?: string): Promise<void> {
    if (name !== undefined) {
      const d = this.drivers.get(name)
      await d?.disconnect()
      this.drivers.delete(name)
      return
    }

    for (const [k, d] of this.drivers.entries()) {
      await d.disconnect()
      this.drivers.delete(k)
    }
  }

  public getDefaultDriver(): string {
    return this.defaultDriver
  }

  public setDefaultDriver(name: string): void {
    this.defaultDriver = name
  }

  /**
   * Execute the job immediately using the SyncDriver pipeline.
   */
  public async dispatchSync(job: Job): Promise<void> {
    const d = new SyncDriver(this.bindings.app ?? null)
    const queue = job.queue ?? (job.constructor as typeof Job).queue
    await d.push(job.serialize(), queue)
  }

  private createDriver(cfg: QueueConnectionConfig): QueueDriver {
    const custom = this.customFactories.get(cfg.driver)
    if (custom !== undefined) return custom(cfg)

    switch (cfg.driver) {
      case 'sync':
        return new SyncDriver(this.bindings.app ?? null)
      case 'null':
        return new NullDriver()
      case 'database': {
        if (this.bindings.query === undefined) {
          throw new Error('QueueManager: database driver requires bindings.query(connectionName).')
        }
        return new DatabaseDriver(this.bindings.query(cfg.connection), cfg)
      }
      case 'bullmq': {
        if (this.bindings.redis === undefined) {
          throw new Error('QueueManager: bullmq driver requires bindings.redis(connectionName).')
        }
        return new BullMQDriver(cfg, this.bindings.redis(cfg.connection))
      }
      case 'sqs':
        return new SqsDriver(cfg)
      default: {
        const _exhaustive: never = cfg
        return _exhaustive
      }
    }
  }
}
