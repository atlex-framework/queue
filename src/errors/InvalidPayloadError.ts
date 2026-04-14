import { AtlexError } from '@atlex/core'

export class InvalidPayloadError extends AtlexError {
  public constructor(message: string) {
    super(message, 'E_INVALID_PAYLOAD')
  }
}
