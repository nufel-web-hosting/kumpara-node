import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Kumpara,
  ConflictError,
  ConnectionError,
  RateLimitError,
  ServerError,
  ValidationError,
} from '../dist/esm/index.js';

/** A fetch that answers from a queue and remembers every request. */
function fakeFetch(...answers) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body });
    const next = answers.shift();
    if (!next) throw new Error('No answer queued');
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.json), { status: next.status ?? 200, headers: next.headers ?? {} });
  };
  fn.calls = calls;
  return fn;
}

function client(fetch, options = {}) {
  const slept = [];
  const kumpara = new Kumpara({ apiKey: 'kp_test_abc', fetch, sleep: async (ms) => { slept.push(ms); }, ...options });
  return { kumpara, slept };
}

const ok = (data) => ({ json: { success: true, message: 'OK', data } });

test('sends the key and JSON, and returns data', async () => {
  const fetch = fakeFetch(ok({ id: 26, kid: '10000008' }));
  const { kumpara } = client(fetch);

  const invoice = await kumpara.invoices.create({
    customerId: 7,
    lines: [{ name: 'Oppsett', quantity: 1, unitPrice: 95000 }],
    externalRef: 'ordre-1001',
  });

  assert.equal(invoice.id, 26);
  const call = fetch.calls[0];
  assert.equal(call.method, 'POST');
  assert.equal(call.url, 'https://api.kumpara.no/v1/invoices');
  assert.equal(call.headers.Authorization, 'Bearer kp_test_abc');
  assert.equal(call.headers['Content-Type'], 'application/json');
  assert.equal(call.headers['X-Tenant-Id'], undefined);
  assert.equal(JSON.parse(call.body).externalRef, 'ordre-1001');
});

test('query string skips empty values; empty POST body is {}', async () => {
  const fetch = fakeFetch(ok({ invoices: [] }), ok({}));
  const { kumpara } = client(fetch);

  await kumpara.invoices.list({ filter: 'overdue', q: '', page: 2 });
  await kumpara.invoices.markUnpaid(5);

  assert.equal(fetch.calls[0].url, 'https://api.kumpara.no/v1/invoices?filter=overdue&page=2');
  assert.equal(fetch.calls[1].body, '{}');
});

test('withTenant sends X-Tenant-Id and leaves the original alone', async () => {
  const fetch = fakeFetch(ok({}), ok({}));
  const { kumpara } = client(fetch);

  await kumpara.withTenant(1234).customers.list();
  await kumpara.customers.list();

  assert.equal(fetch.calls[0].headers['X-Tenant-Id'], '1234');
  assert.equal(fetch.calls[1].headers['X-Tenant-Id'], undefined);
});

test('a validation error carries status, code and field', async () => {
  const fetch = fakeFetch({ status: 422, json: { success: false, message: 'Gratis har 5 fakturaer i måneden', code: 'validation_error', field: 'plan' } });
  const { kumpara } = client(fetch);

  await assert.rejects(kumpara.invoices.create({ customerId: 1, lines: [] }), (e) => {
    assert.ok(e instanceof ValidationError);
    assert.equal(e.status, 422);
    assert.equal(e.code, 'validation_error');
    assert.equal(e.field, 'plan');
    assert.equal(e.message, 'Gratis har 5 fakturaer i måneden');
    assert.equal(e.name, 'ValidationError');
    return true;
  });
});

test('a conflict is not retried', async () => {
  const fetch = fakeFetch({ status: 409, json: { success: false, message: 'Mangler avsender', code: 'conflict', field: 'settings' } });
  const { kumpara } = client(fetch);

  await assert.rejects(kumpara.invoices.create({ customerId: 1, lines: [], externalRef: 'x' }), ConflictError);
  assert.equal(fetch.calls.length, 1);
});

test('GET is retried after a server error', async () => {
  const fetch = fakeFetch({ status: 500, json: { success: false, message: 'Feil', code: 'server_error' } }, ok({ mode: 'test' }));
  const { kumpara, slept } = client(fetch);

  assert.equal((await kumpara.me()).mode, 'test');
  assert.equal(fetch.calls.length, 2);
  assert.equal(slept.length, 1);
});

test('POST without externalRef is not retried', async () => {
  const fetch = fakeFetch({ status: 500, json: { success: false, message: 'Feil', code: 'server_error' } });
  const { kumpara } = client(fetch);

  await assert.rejects(kumpara.invoices.create({ customerId: 1, lines: [] }), ServerError);
  assert.equal(fetch.calls.length, 1);
});

test('POST with externalRef is retried after a network error', async () => {
  const fetch = fakeFetch(new TypeError('fetch failed'), ok({ id: 9 }));
  const { kumpara } = client(fetch);

  const invoice = await kumpara.invoices.create({ customerId: 1, lines: [], externalRef: 'ordre-9' });
  assert.equal(invoice.id, 9);
  assert.equal(fetch.calls.length, 2);
});

test('network errors give up after maxRetries', async () => {
  const fetch = fakeFetch(new TypeError('a'), new TypeError('b'), new TypeError('c'));
  const { kumpara } = client(fetch);

  await assert.rejects(kumpara.me(), ConnectionError);
  assert.equal(fetch.calls.length, 3);
});

test('rate limit waits Retry-After', async () => {
  const fetch = fakeFetch(
    { status: 429, json: { success: false, message: 'For mange kall', code: 'rate_limited' }, headers: { 'Retry-After': '3' } },
    ok({}),
  );
  const { kumpara, slept } = client(fetch);

  await kumpara.customers.create({ type: 'person', name: 'Kari' });
  assert.deepEqual(slept, [3000]);
});

test('a long Retry-After is thrown, not waited', async () => {
  const fetch = fakeFetch({ status: 429, json: { success: false, message: 'For mange kall', code: 'rate_limited' }, headers: { 'Retry-After': '45' } });
  const { kumpara, slept } = client(fetch);

  await assert.rejects(kumpara.me(), (e) => e instanceof RateLimitError && e.retryAfter === 45);
  assert.deepEqual(slept, []);
});

test('pdfBuffer decodes the PDF', async () => {
  const fetch = fakeFetch(ok({ filename: 'faktura-1.pdf', contentType: 'application/pdf', size: 8, base64: Buffer.from('%PDF-1.4').toString('base64') }));
  const { kumpara } = client(fetch);

  assert.equal((await kumpara.invoices.pdfBuffer(1)).toString(), '%PDF-1.4');
});

test('test mode and missing key', () => {
  assert.equal(new Kumpara({ apiKey: 'kp_test_x', fetch: fakeFetch() }).isTestMode, true);
  assert.equal(new Kumpara({ apiKey: 'kp_live_x', fetch: fakeFetch() }).isTestMode, false);
  const saved = process.env.KUMPARA_API_KEY;
  delete process.env.KUMPARA_API_KEY;
  try {
    assert.throws(() => new Kumpara({ apiKey: '  ' }), TypeError);
    assert.throws(() => new Kumpara(), TypeError);
  } finally {
    if (saved !== undefined) process.env.KUMPARA_API_KEY = saved;
  }
});
