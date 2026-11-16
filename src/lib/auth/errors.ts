export class RateLimitError extends Error {
  constructor(message = 'Too many requests') {
    super(message);
    this.name = 'RateLimitError';
  }
}

// The platform-wide SMS budget for the last 24 h is spent (cost guard; operators are alerted).
export class SmsCapError extends Error {
  constructor(readonly cap: number) {
    super('Daily SMS cap reached');
    this.name = 'SmsCapError';
  }
}

export class InvalidPhoneError extends Error {
  constructor(message = 'Invalid phone number') {
    super(message);
    this.name = 'InvalidPhoneError';
  }
}
