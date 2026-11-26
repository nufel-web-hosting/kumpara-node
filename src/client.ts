import { ConnectionError, errorFromResponse } from './errors.js';
import { Customers, Invoices, Products, Tenants } from './resources.js';
import type { KumparaObject } from './types.js';

export const VERSION = '0.1.0';
export const DEFAULT_BASE_URL = 'https://api.kumpara.no/v1';

const MAX_RETRY_WAIT = 10; // seconds; a longer Retry-After is thrown to the caller

export interface KumparaOptions {
  /** kp_test_... or kp_live_...; default: the KUMPARA_API_KEY environment variable. */
  apiKey?: string;
  /** Work in one of your customers' accounts (X-Tenant-Id). */
  tenantId?: number | null;
  baseUrl?: string;
  /** Milliseconds per attempt. Default 30000. */
  timeout?: number;
  /** Extra attempts when it is safe to repeat. Default 2. */
  maxRetries?: number;
  /** Your own fetch (for tests or a proxy). Default: the global fetch. */
  fetch?: typeof fetch;
  /** @internal How to wait between attempts (tests). */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The Kumpara API client.
 *
 *     const kumpara = new Kumpara();                 // reads KUMPARA_API_KEY
 *     const invoice = await kumpara.invoices.create({ ... });
 *
 * Every call resolves with the `data` part of the API's answer, and rejects with an ApiError (or one of its
 * subclasses) when the API says no. Amounts are in øre (149 kr = 14900).
 */
export class Kumpara {
  readonly customers: Customers;
  readonly products: Products;
  readonly invoices: Invoices;
  readonly tenants: Tenants;

  readonly #apiKey: string;
  readonly #tenantId: number | null;
  readonly #baseUrl: string;
  readonly #timeout: number;
  readonly #maxRetries: number;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #options: KumparaOptions;

  constructor(options: KumparaOptions = {}) {
    const apiKey = (options.apiKey ?? process.env.KUMPARA_API_KEY ?? '').trim();
    if (apiKey === '') {
      throw new TypeError('No API key. Pass { apiKey }, or set the KUMPARA_API_KEY environment variable.');
    }
    const fetchFn = options.fetch ?? globalThis.fetch;
    if (typeof fetchFn !== 'function') {
      throw new TypeError('No fetch available. Use Node.js 20 or newer, or pass { fetch }.');
    }

    this.#options = options;
    this.#apiKey = apiKey;
    this.#tenantId = options.tenantId ?? null;
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#timeout = options.timeout ?? 30_000;
    this.#maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.#fetch = fetchFn;
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

    this.customers = new Customers(this);
    this.products = new Products(this);
    this.invoices = new Invoices(this);
    this.tenants = new Tenants(this);
  }

  /** A new client working in one of your customers' accounts (X-Tenant-Id). This one is unchanged. */
  withTenant(tenantId: number | null): Kumpara {
    return new Kumpara({ ...this.#options, apiKey: this.#apiKey, tenantId });
  }

  /** True for a kp_test_ key: test account, no e-mail to customers, TEST on the PDF. */
  get isTestMode(): boolean {
    return this.#apiKey.startsWith('kp_test_');
  }

  /** The account the key works in, and `mode`: test or live. */
  me(): Promise<KumparaObject> {
    return this.request('GET', '/me');
  }

  /** Look up a company in Enhetsregisteret by organisation number or name. */
  registry(query: string): Promise<KumparaObject> {
    return this.request('GET', '/registry', { q: query });
  }

  /**
   * One API call. Retries what is safe to repeat: a 429 (the call was not run), and for GET, or a POST whose body
   * carries externalRef/ref (Kumpara gives the same result back), also network errors and 5xx answers.
   *
   * @internal Used by the resource classes; prefer those.
   */
  async request<T = KumparaObject>(method: 'GET' | 'POST', path: string, query: Record<string, unknown> = {},
                                   body?: object): Promise<T> {
    const url = new URL(this.#baseUrl + path);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.#apiKey}`,
      Accept: 'application/json',
      'User-Agent': `kumpara-node/${VERSION} node/${process.versions.node}`,
    };
    if (this.#tenantId !== null) {
      headers['X-Tenant-Id'] = String(this.#tenantId);
    }
    let payload: string | undefined;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const sent = (body ?? {}) as Record<string, unknown>;
    const repeatable = method === 'GET' || sent.externalRef !== undefined || sent.ref !== undefined;

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await this.#fetch(url, {
          method,
          headers,
          body: payload,
          signal: AbortSignal.timeout(this.#timeout),
        });
      } catch (cause) {
        if (repeatable && attempt < this.#maxRetries) {
          await this.#sleep(this.#backoff(attempt));
          continue;
        }
        const reason = cause instanceof Error ? cause.message : String(cause);
        throw Object.assign(new ConnectionError(`Could not reach Kumpara: ${reason}`), { cause });
      }

      const text = await response.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        // not JSON: handled as an error below
      }
      const answer = (json && typeof json === 'object' ? json : {}) as { success?: unknown; data?: unknown };
      if (response.ok && answer.success === true) {
        return (answer.data && typeof answer.data === 'object' ? answer.data : {}) as T;
      }

      const error = errorFromResponse(response.status, json, text, response.headers.get('retry-after'));
      if (attempt < this.#maxRetries) {
        if (response.status === 429 && error.code === 'rate_limited') {
          const wait = error.retryAfter ?? 1;
          if (wait <= MAX_RETRY_WAIT) {
            await this.#sleep(wait * 1000);
            continue;
          }
        } else if (response.status >= 500 && repeatable && error.code !== 'payment_provider') {
          await this.#sleep(this.#backoff(attempt));
          continue;
        }
      }
      throw error;
    }
  }

  #backoff(attempt: number): number {
    return Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
  }
}
