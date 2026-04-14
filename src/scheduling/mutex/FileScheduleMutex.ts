import crypto from 'node:crypto'
import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { ScheduledTask } from '../ScheduledTask.js'

import type { ScheduleMutex } from './ScheduleMutex.js'

interface LockFile {
  readonly expiresAtMs: number
}

/**
 * File-backed mutex for overlap prevention.
 */
export class FileScheduleMutex implements ScheduleMutex {
  readonly #lockPath: string

  /**
   * @param lockPath - Directory for lock files.
   */
  constructor(lockPath: string) {
    this.#lockPath = lockPath
  }

  async create(task: ScheduledTask, expiresAt: number): Promise<boolean> {
    await mkdir(this.#lockPath, { recursive: true })
    const file = this.#lockFile(task)
    const now = Date.now()
    const payload: LockFile = { expiresAtMs: now + expiresAt * 60_000 }

    try {
      const fh = await open(file, 'wx')
      try {
        await fh.writeFile(JSON.stringify(payload), { encoding: 'utf8' })
      } finally {
        await fh.close()
      }
      return true
    } catch {
      // Exists: if stale, delete and retry once.
      const existing = await this.#readLock(file)
      if (existing !== null && existing.expiresAtMs <= now) {
        await safeUnlink(file)
        return await this.create(task, expiresAt)
      }
      return false
    }
  }

  async exists(task: ScheduledTask): Promise<boolean> {
    const file = this.#lockFile(task)
    const existing = await this.#readLock(file)
    if (existing === null) return false
    if (existing.expiresAtMs <= Date.now()) {
      await safeUnlink(file)
      return false
    }
    return true
  }

  async forget(task: ScheduledTask): Promise<void> {
    await safeUnlink(this.#lockFile(task))
  }

  #lockFile(task: ScheduledTask): string {
    const hash = crypto.createHash('sha256').update(task.mutexName()).digest('hex').slice(0, 32)
    return path.join(this.#lockPath, `${hash}.lock`)
  }

  async #readLock(file: string): Promise<LockFile | null> {
    try {
      const raw = await readFile(file, 'utf8')
      const parsed = JSON.parse(raw) as unknown
      if (typeof parsed !== 'object' || parsed === null) return null
      const p = parsed as { expiresAtMs?: unknown }
      if (typeof p.expiresAtMs !== 'number' || !Number.isFinite(p.expiresAtMs)) return null
      return { expiresAtMs: p.expiresAtMs }
    } catch {
      return null
    }
  }

  /**
   * Force-clear all locks (best-effort).
   *
   * @param tasks - Tasks to clear.
   */
  async clear(tasks: readonly ScheduledTask[]): Promise<void> {
    await mkdir(this.#lockPath, { recursive: true })
    for (const task of tasks) {
      await safeUnlink(this.#lockFile(task))
    }
  }

  /**
   * Write lock (for tests / manual recovery).
   *
   * @param task - Task.
   * @param expiresAtMs - Absolute ms timestamp.
   */
  async writeLock(task: ScheduledTask, expiresAtMs: number): Promise<void> {
    await mkdir(this.#lockPath, { recursive: true })
    await writeFile(
      this.#lockFile(task),
      JSON.stringify({ expiresAtMs } satisfies LockFile),
      'utf8',
    )
  }
}

async function safeUnlink(file: string): Promise<void> {
  try {
    await unlink(file)
  } catch {
    // ignore
  }
}
