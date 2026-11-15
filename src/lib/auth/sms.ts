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
