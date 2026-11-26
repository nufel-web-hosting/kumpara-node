import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Webhook, SignatureError } from '../dist/esm/index.js';

const SECRET = 'whsec_test';
const NOW = 1763571234;
const BODY = '{"id":"evt_1","type":"invoice.paid","created":1763571234,"livemode":false,"tenantId":null,"data":{"invoice":{"id":26}}}';

const header = (body, t = NOW, secret = SECRET) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

test('a valid event', () => {
  const event = Webhook.constructEvent(BODY, header(BODY), SECRET, { now: NOW + 10 });
  assert.equal(event.type, 'invoice.paid');
  assert.equal(event.data.invoice.id, 26);
});

test('a Buffer body works too', () => {
  const event = Webhook.constructEvent(Buffer.from(BODY), header(BODY), SECRET, { now: NOW });
  assert.equal(event.id, 'evt_1');
});

test('a tampered body', () => {
  assert.throws(() => Webhook.constructEvent(BODY.replace('26', '27'), header(BODY), SECRET, { now: NOW }), SignatureError);
});

test('the wrong secret', () => {
  assert.throws(() => Webhook.constructEvent(BODY, header(BODY, NOW, 'whsec_other'), SECRET, { now: NOW }), SignatureError);
});

test('too old', () => {
  assert.throws(() => Webhook.constructEvent(BODY, header(BODY), SECRET, { now: NOW + 301 }), SignatureError);
});

test('missing header and empty secret', () => {
  assert.throws(() => Webhook.constructEvent(BODY, undefined, SECRET), SignatureError);
  assert.throws(() => Webhook.constructEvent(BODY, header(BODY), ''), SignatureError);
});
