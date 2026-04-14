import type { Constructor, Listener } from '@atlex/core'
import { ListenerException, SHOULD_QUEUE_LISTENER } from '@atlex/core'

import { Job } from '../../Job.js'
import { RegisterJob } from '../../JobRegistry.js'

interface SerializedEvent {
  eventName: string
  payload: unknown
}

function serializeEvent(event: object): SerializedEvent {
  const payload =
    typeof (event as { toJSON?: unknown }).toJSON === 'function'
      ? (event as { toJSON: () => unknown }).toJSON()
      : JSON.parse(JSON.stringify(event))
  return { eventName: event.constructor.name, payload }
}

/**
 * Job that resolves a listener from the app container and invokes it.
 */
@RegisterJob()
export class HandleListenerJob extends Job {
  public constructor(
    private readonly listenerClass: Constructor<object>,
    private readonly event: object,
  ) {
    super()
  }

  public async handle(): Promise<void> {
    const app = this._app()
    if (app === null) throw new Error('HandleListenerJob cannot run without Job runtime app.')

    const listener = app.make(this.listenerClass) as Listener<object> & {
      failed?: (event: unknown, error: Error) => void
      shouldDispatch?: (event: unknown) => boolean
    }

    if (typeof listener.shouldDispatch === 'function' && !listener.shouldDispatch(this.event)) {
      return
    }

    try {
      await listener.handle(this.event)
    } catch (cause) {
      const err = cause instanceof Error ? cause : new Error(String(cause))
      if (typeof listener.failed === 'function') {
        listener.failed(this.event, err)
      }
      throw new ListenerException(this.listenerClass, this.event, err)
    }
  }

  protected override serializeData(): Record<string, unknown> {
    return {
      listenerClassName: this.listenerClass.name,
      event: serializeEvent(this.event),
    }
  }

  public override displayName(): string {
    return `HandleListenerJob(${this.listenerClass.name})`
  }

  public override onQueue(queue: string): this {
    return super.onQueue(queue)
  }

  public override onConnection(connection: string): this {
    return super.onConnection(connection)
  }

  /**
   * Set runtime queue options from the listener class (when available).
   */
  public applyListenerOptions(): this {
    const meta = this.listenerClass as unknown as Record<PropertyKey, unknown>
    if (meta[SHOULD_QUEUE_LISTENER] !== true) return this

    const queue = meta.queue
    const connection = meta.connection
    if (typeof queue === 'string') this.onQueue(queue)
    if (typeof connection === 'string') this.onConnection(connection)
    return this
  }
}
