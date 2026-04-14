import type { Application } from '@atlex/core'

import type { QueueDriver, QueuedJob } from '../contracts/QueueDriver.js'
import { Job } from '../Job.js'
import type { JobPayload } from '../JobPayload.js'

export class SyncDriver implements QueueDriver {
  public constructor(private readonly app: Application | null) {}

  public async push(payload: JobPayload, _queue?: string): Promise<string> {
    const job = Job.deserialize(payload)
    job._setRuntime({
      app: this.app,
      dispatch: async () => payload.uuid,
      resolveBatch: async () => null,
    })
    await job.handle()
    return payload.uuid
  }

  public async later(_delay: number, payload: JobPayload, _queue?: string): Promise<string> {
    return await this.push(payload)
  }

  public async bulk(payloads: JobPayload[], _queue?: string): Promise<string[]> {
    const ids: string[] = []
    for (const p of payloads) {
      ids.push(await this.push(p))
    }
    return ids
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
    return 0
  }

  public async disconnect(): Promise<void> {
    return
  }

  public getConnection(): unknown {
    return null
  }
}
