import type { Job } from '../Job.js'

import type { Batch } from './Batch.js'

export class PendingBatch {
  private readonly jobs: Job[]
  private batchName = ''
  private connection: string | null = null
  private queue: string | null = null
  private allowFailuresFlag = false

  private beforeCallback: ((batch: Batch) => void | Promise<void>) | null = null
  private progressCallback: ((batch: Batch) => void | Promise<void>) | null = null
  private thenCallback: ((batch: Batch) => void | Promise<void>) | null = null
  private catchCallback: ((batch: Batch, error: Error) => void | Promise<void>) | null = null
  private finallyCallback: ((batch: Batch) => void | Promise<void>) | null = null

  public constructor(jobs: readonly Job[]) {
    this.jobs = [...jobs]
  }

  public name(name: string): this {
    this.batchName = name
    return this
  }

  public onConnection(connection: string): this {
    this.connection = connection
    return this
  }

  public onQueue(queue: string): this {
    this.queue = queue
    return this
  }

  public allowFailures(): this {
    this.allowFailuresFlag = true
    return this
  }

  public before(callback: (batch: Batch) => void | Promise<void>): this {
    this.beforeCallback = callback
    return this
  }

  public progress(callback: (batch: Batch) => void | Promise<void>): this {
    this.progressCallback = callback
    return this
  }

  public then(callback: (batch: Batch) => void | Promise<void>): this {
    this.thenCallback = callback
    return this
  }

  public catch(callback: (batch: Batch, error: Error) => void | Promise<void>): this {
    this.catchCallback = callback
    return this
  }

  public finally(callback: (batch: Batch) => void | Promise<void>): this {
    this.finallyCallback = callback
    return this
  }

  public add(jobs: Job | readonly Job[]): this {
    if (Array.isArray(jobs)) {
      this.jobs.push(...(jobs as Job[]))
      return this
    }
    this.jobs.push(jobs as Job)
    return this
  }

  public getJobs(): readonly Job[] {
    return this.jobs
  }

  public getName(): string {
    return this.batchName
  }

  public getConnection(): string | null {
    return this.connection
  }

  public getQueue(): string | null {
    return this.queue
  }

  public allowsFailures(): boolean {
    return this.allowFailuresFlag
  }

  public getCallbacks(): {
    before: ((batch: Batch) => void | Promise<void>) | null
    progress: ((batch: Batch) => void | Promise<void>) | null
    then: ((batch: Batch) => void | Promise<void>) | null
    catch: ((batch: Batch, error: Error) => void | Promise<void>) | null
    finally: ((batch: Batch) => void | Promise<void>) | null
  } {
    return {
      before: this.beforeCallback,
      progress: this.progressCallback,
      then: this.thenCallback,
      catch: this.catchCallback,
      finally: this.finallyCallback,
    }
  }
}
