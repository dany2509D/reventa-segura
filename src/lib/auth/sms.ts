export interface SmsSender {
  send(phone: string, text: string): Promise<void>;
}

// Development-only sender. Never logs in production or under test.
export class ConsoleSmsSender implements SmsSender {
  async send(phone: string, text: string): Promise<void> {
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') return;
    console.info(`[sms] to ${phone}: ${text}`);
  }
}

export class SmsConfigError extends Error {
  constructor() {
    super('SMS provider not configured');
    this.name = 'SmsConfigError';
  }
}

// Throws in production until a real provider is wired in.
export function getSmsSender(): SmsSender {
  if (process.env.NODE_ENV === 'production') throw new SmsConfigError();
  return new ConsoleSmsSender();
}
