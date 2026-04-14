import { AtlexError } from '@atlex/core'

export class ManuallyFailedError extends AtlexError {
  public constructor(message: string) {
    super(message, 'E_MANUALLY_FAILED')
  }
}
