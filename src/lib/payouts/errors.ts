// A payout cannot be queued or paid in the order's / payout's current state.
export class PayoutStateError extends Error {
  constructor(message = 'Payout is not in a payable state') {
    super(message);
    this.name = 'PayoutStateError';
  }
}
