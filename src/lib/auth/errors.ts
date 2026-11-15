export class RateLimitError extends Error {
  constructor(message = 'Too many requests') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class InvalidPhoneError extends Error {
  constructor(message = 'Invalid phone number') {
    super(message);
    this.name = 'InvalidPhoneError';
  }
}
