import { createHmac, timingSafeEqual } from 'node:crypto';
import { SignatureError } from './errors.js';
import type { WebhookEvent } from './types.js';

export const DEFAULT_TOLERANCE = 300; // seconds between the signature's time and now

export interface VerifyOptions {
  /** Seconds. Default 300; 0 turns the age check off. */
  tolerance?: number;
  /** @internal Unix seconds (tests). */
  now?: number;
}

/**
 * Checks a webhook from Kumpara before you trust it, and returns the event.
 *
 * Kumpara-Signature is "t=<unix time>,v1=<hex>": an HMAC-SHA256 of t, a dot and the raw body, with the webhook's
 * secret (whsec_...). Pass the raw body exactly as it came (in Express: express.raw({ type: 'application/json' })),
 * not a parsed and re-encoded copy.
 *
 * @throws SignatureError when the signature is missing, wrong or too old, or the body is not an event
 */
export function constructEvent(payload: string | Buffer, signatureHeader: string | string[] | null | undefined,
                               secret: string, options: VerifyOptions = {}): WebhookEvent {
  const body = typeof payload === 'string' ? payload : payload.toString('utf8');
  verify(body, signatureHeader, secret, options);

  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    throw new SignatureError('The webhook body is not JSON.');
  }
  const e = event as Partial<WebhookEvent> | null;
  if (!e || typeof e !== 'object' || typeof e.id !== 'string' || typeof e.type !== 'string') {
    throw new SignatureError('The webhook body is not a Kumpara event.');
  }
  return e as WebhookEvent;
}

/** @throws SignatureError */
export function verify(payload: string | Buffer, signatureHeader: string | string[] | null | undefined,
                       secret: string, options: VerifyOptions = {}): void {
  if (!secret) {
    throw new SignatureError('No webhook secret. Set KUMPARA_WEBHOOK_SECRET (whsec_...).');
  }
  const header = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of (header ?? '').split(',')) {
    const [key, value = ''] = part.split('=', 2).map((s) => s.trim());
    if (key === 't' && /^\d+$/.test(value)) {
      timestamp = Number(value);
    } else if (key === 'v1' && value !== '') {
      signatures.push(value);
    }
  }
  if (timestamp === null || signatures.length === 0) {
    throw new SignatureError('Missing or malformed Kumpara-Signature header.');
  }

  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (tolerance > 0 && Math.abs(now - timestamp) > tolerance) {
    throw new SignatureError('The webhook signature is too old.');
  }

  const body = typeof payload === 'string' ? payload : payload.toString('utf8');
  const expected = Buffer.from(createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex'));
  for (const signature of signatures) {
    const given = Buffer.from(signature);
    if (given.length === expected.length && timingSafeEqual(given, expected)) {
      return;
    }
  }
  throw new SignatureError('The webhook signature does not match.');
}

export const Webhook = { constructEvent, verify };
