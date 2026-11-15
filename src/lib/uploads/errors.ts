export type InvalidUploadReason =
  | 'empty'
  | 'too_large'
  | 'unsupported_type'
  | 'type_mismatch'
  | 'too_many_pixels'
  | 'corrupt';

// Raised by validateUpload. `reason` is safe to log; the file content never is.
export class InvalidUploadError extends Error {
  constructor(readonly reason: InvalidUploadReason) {
    super(`Invalid upload: ${reason}`);
    this.name = 'InvalidUploadError';
  }
}
