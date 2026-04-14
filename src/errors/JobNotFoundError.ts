import { AtlexError } from '@atlex/core'

export class JobNotFoundError extends AtlexError {
  public constructor(public readonly jobName: string) {
    super(`Job class "${jobName}" is not registered in JobRegistry.`, 'E_JOB_NOT_FOUND')
  }
}
