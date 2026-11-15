// Shared domain errors. Route handlers map them to HTTP status codes
// (ForbiddenError → 403, NotFoundError → 404, ValidationError → 400).

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(
    message = 'Invalid input',
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}
