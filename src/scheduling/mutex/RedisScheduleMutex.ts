import type { Redis } from 'ioredis'

import type { ScheduledTask } from '../ScheduledTask.js'

import type { ScheduleMutex } from './ScheduleMutex.js'

/**
 * Redis-backed mutex for overlap prevention.
 */
export class RedisScheduleMutex implements ScheduleMutex {
  readonly #redis: Redis

  /**
   * @param redis - ioredis client.
   */
  constructor(redis: Redis) {
    this.#redis = redis
  }

  async create(task: ScheduledTask, expiresAt: number): Promise<boolean> {
    const key = task.mutexName()
    const ttlSeconds = Math.max(1, Math.floor(expiresAt * 60))
    const res = await this.#redis.set(key, '1', 'EX', ttlSeconds, 'NX')
    return res === 'OK'
  }

  async exists(task: ScheduledTask): Promise<boolean> {
    const key = task.mutexName()
    const res = await this.#redis.exists(key)
    return res === 1
  }

  async forget(task: ScheduledTask): Promise<void> {
    await this.#redis.del(task.mutexName())
  }
}
