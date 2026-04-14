import type { QueueDriver, QueuedJob } from '../contracts/QueueDriver.js'
import type { JobPayload } from '../JobPayload.js'

export class NullDriver implements QueueDriver {
  private readonly pushed: JobPayload[] = []

  public async push(payload: JobPayload, _queue?: string): Promise<string> {
    this.pushed.push(payload)
    return payload.uuid
  }

  public async later(_delay: number, payload: JobPayload, _queue?: string): Promise<string> {
    return await this.push(payload)
  }

  public async bulk(payloads: JobPayload[], _queue?: string): Promise<string[]> {
    for (const p of payloads) {
      this.pushed.push(p)
    }
    return payloads.map((p) => p.uuid)
  }

  public async pop(): Promise<QueuedJob | null> {
    return null
  }

  public async delete(_jobId: string): Promise<void> {
    return
  }

  public async release(_jobId: string, _delay?: number): Promise<void> {
    return
  }

  public async size(): Promise<number> {
    return 0
  }

  public async clear(): Promise<number> {
    const n = this.pushed.length
    this.pushed.length = 0
    return n
  }

  public async disconnect(): Promise<void> {
    return
  }

  public getConnection(): unknown {
    return null
  }

  /**
   * Test helper.
   */
  public getPushed(): JobPayload[] {
    return [...this.pushed]
  }

  /**
   * Test helper.
   */
  public assertPushed(jobClass: string, count?: number): void {
    const actual = this.pushed.filter((p) => p.job === jobClass).length
    const expected = count ?? 1
    if (actual !== expected) {
      throw new Error(`Expected ${expected} "${jobClass}" job(s) pushed, got ${actual}.`)
    }
  }

  /**
   * Test helper.
   */
  public assertNothingPushed(): void {
    if (this.pushed.length !== 0) {
      throw new Error(`Expected no jobs pushed, got ${this.pushed.length}.`)
    }
  }
}
