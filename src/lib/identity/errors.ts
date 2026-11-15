// The seller has not had their identity approved by an admin (RF-02).
export class IdentityRequiredError extends Error {
  constructor(message = 'Identity verification required') {
    super(message);
    this.name = 'IdentityRequiredError';
  }
}

// The identity status does not allow the requested transition
// (e.g. resubmitting while pending, reviewing a non-pending user).
export class IdentityStateError extends Error {
  constructor(message = 'Invalid identity status transition') {
    super(message);
    this.name = 'IdentityStateError';
  }
}
