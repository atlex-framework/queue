import { AtlexError } from '@atlex/core'

import type { Job } from '../Job.js'

export class MaxAttemptsExceededError extends AtlexError {
  public constructor(public readonly job: Job) {
    super(`${job.displayName()} has been attempted too many times.`, 'E_MAX_ATTEMPTS')
  }
}
