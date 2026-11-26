// The package must also work from CommonJS: require('kumpara')
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('require() gives the same API', () => {
  const kumpara = require('../dist/cjs/index.js');
  assert.equal(typeof kumpara.Kumpara, 'function');
  assert.equal(kumpara.default, kumpara.Kumpara);
  assert.equal(typeof kumpara.Webhook.constructEvent, 'function');
  assert.equal(new kumpara.Kumpara({ apiKey: 'kp_test_x', fetch: async () => {} }).isTestMode, true);
});
