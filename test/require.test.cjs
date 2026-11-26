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

test('the published types do not need @types/node', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const dir of ['../dist/esm', '../dist/cjs']) {
    for (const file of fs.readdirSync(path.join(__dirname, dir)).filter((f) => f.endsWith('.d.ts'))) {
      // Comments may mention Buffer; the code may not need Node or DOM types
      const code = fs.readFileSync(path.join(__dirname, dir, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      assert.ok(!/\bBuffer\b|\bNodeJS\b|from 'node:|typeof fetch|\bResponse\b/.test(code), `${dir}/${file} needs Node or DOM types`);
    }
  }
});
