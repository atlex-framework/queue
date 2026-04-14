import type { Broadcastable, SocketBroadcaster } from '@atlex/core'

import { Job } from '../../Job.js'
import { RegisterJob } from '../../JobRegistry.js'

/**
 * Job that broadcasts an event via {@link SocketBroadcaster}.
 */
@RegisterJob()
export class BroadcastEventJob extends Job {
  public static override queue = 'broadcasting'

  public constructor(private readonly event: Broadcastable & object) {
    super()
  }

  public async handle(): Promise<void> {
    const app = this._app()
    if (app === null) throw new Error('BroadcastEventJob cannot run without Job runtime app.')
    const broadcaster = app.make<SocketBroadcaster>('SocketBroadcaster')
    await broadcaster.broadcast(this.event)
  }
}
