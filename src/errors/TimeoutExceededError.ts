import { AtlexError } from '@atlex/core'

import type { Job } from '../Job.js'

export class TimeoutExceededError extends AtlexError {
  public constructor(public readonly job: Job) {
    const timeout = (job.constructor as typeof Job).timeout
    super(`${job.displayName()} exceeded the timeout of ${timeout}s.`, 'E_JOB_TIMEOUT')
  }
}
