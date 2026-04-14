import { AtlexError } from '@atlex/core'

export class BatchCancelledError extends AtlexError {
  public constructor(message: string) {
    super(message, 'E_BATCH_CANCELLED')
  }
}
