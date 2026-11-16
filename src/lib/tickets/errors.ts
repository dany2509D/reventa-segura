// Listing domain errors. Messages are for logs; routes map each class to a
// Spanish user-facing message and an HTTP status.

// The same ticket (same fingerprint) is already in a pending, verified or sold listing.
export class DuplicateTicketError extends Error {
  constructor(message = 'This ticket is already listed') {
    super(message);
    this.name = 'DuplicateTicketError';
  }
}

// File delivery where the ticket file and the proof show different readable QR codes.
export class AmbiguousTicketError extends Error {
  constructor(message = 'Ticket file and proof show different QR codes') {
    super(message);
    this.name = 'AmbiguousTicketError';
  }
}

// The event is cancelled or has already started.
export class EventClosedError extends Error {
  constructor(message = 'The event is closed for listings') {
    super(message);
    this.name = 'EventClosedError';
  }
}

// The organiser prohibits resale for this event.
export class ResaleProhibitedError extends Error {
  constructor(message = 'Resale is prohibited for this event') {
    super(message);
    this.name = 'ResaleProhibitedError';
  }
}

// 'transfer' delivery on an event whose ticketing does not allow transfers.
export class TransferNotAllowedError extends Error {
  constructor(message = 'This event does not allow ticket transfers') {
    super(message);
    this.name = 'TransferNotAllowedError';
  }
}

// The asking price is above the configured cap over face value.
export class PriceCapError extends Error {
  constructor(readonly maxCents: number) {
    super(`Price above the cap (max ${maxCents} cents)`);
    this.name = 'PriceCapError';
  }
}

// The seller already has the maximum number of pending/verified listings.
export class ListingLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Active listing limit reached (${limit})`);
    this.name = 'ListingLimitError';
  }
}

// The seller has not proven a phone number yet (users.phone_verified_at is null).
export class PhoneNotVerifiedError extends Error {
  constructor(message = 'Seller phone is not verified') {
    super(message);
    this.name = 'PhoneNotVerifiedError';
  }
}

// The seller lost too many disputes recently (SEG-08): no new listings.
export class SellerBlockedError extends Error {
  constructor(message = 'Seller blocked after repeated lost disputes') {
    super(message);
    this.name = 'SellerBlockedError';
  }
}

// The listing status does not allow the requested transition.
export class ListingStateError extends Error {
  constructor(message = 'Invalid listing status transition') {
    super(message);
    this.name = 'ListingStateError';
  }
}

// A live order (not cancelled/refunded) exists on the listing.
export class ListingBusyError extends Error {
  constructor(message = 'The listing has an order in progress') {
    super(message);
    this.name = 'ListingBusyError';
  }
}
