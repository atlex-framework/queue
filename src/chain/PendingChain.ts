import type { Job } from '../Job.js'
import type { JobPayload } from '../JobPayload.js'

type ChainCatch = (error: Error) => void | Promise<void>

function serializeCallback(fn: ChainCatch | null): string | null {
  if (fn === null) return null
  return fn.toString()
}

export class PendingChain implements PromiseLike<string> {
  private connection: string | null = null
  private queue: string | null = null
  private catchCallback: ChainCatch | null = null

  public constructor(
    private readonly jobs: Job[],
    private readonly dispatcher: (job: Job) => Promise<string>,
  ) {}

  public onConnection(connection: string): this {
    this.connection = connection
    return this
  }

  public onQueue(queue: string): this {
    this.queue = queue
    return this
  }

  public catch(callback: ChainCatch): this {
    this.catchCallback = callback
    return this
  }

  public async dispatch(): Promise<string> {
    if (this.jobs.length === 0) {
      throw new Error('PendingChain.dispatch: no jobs provided.')
    }

    const [first, ...rest] = this.jobs
    if (first === undefined) {
      throw new Error('PendingChain.dispatch: no jobs provided.')
    }
    const chained = rest.map((j) => j.serialize())

    first.chained = chained
    const p = first.serialize()
    const firstPayload: JobPayload = {
      ...p,
      chained,
      chainConnection: this.connection,
      chainQueue: this.queue,
      chainCatchCallbackSerialized: serializeCallback(this.catchCallback),
    }
    const job = (await import('../Job.js')).Job.deserialize(firstPayload)
    return await this.dispatcher(job)
  }

  public then<TResult1 = string, TResult2 = never>(
    onfulfilled?: ((value: string) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.dispatch().then(onfulfilled, onrejected)
  }
}
