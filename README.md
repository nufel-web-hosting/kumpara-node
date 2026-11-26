# Kumpara for Node.js

[![CI](https://github.com/nufel-web-hosting/kumpara-node/actions/workflows/ci.yml/badge.svg)](https://github.com/nufel-web-hosting/kumpara-node/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/kumpara.svg)](https://www.npmjs.com/package/kumpara)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Offisielt Node.js-bibliotek for [Kumpara](https://kumpara.no): lag, send og følg opp norske fakturaer med KID og PDF fra din egen kode.

*The official Node.js SDK for Kumpara, the Norwegian invoicing API: create and send invoices with KID, PDF and webhooks from your own code.*

- Kunder, varer, fakturaer og kreditnotaer
- KID med MOD10 eller MOD11, fortløpende fakturanummer uten hull
- PDF og e-post til kunden
- Webhooks med signaturkontroll
- Kontoer for kundene dine (`tenants`)
- Trygge nye forsøk: `externalRef` gjør at ingenting blir dobbelt
- TypeScript-typer med, ingen avhengigheter, virker med både `import` og `require`

Kumpara flytter aldri penger. «Betalt» er en markering du eller systemet ditt gjør.

## Installer

```bash
npm install kumpara
```

Krever Node.js 20 eller nyere.

## Kom i gang

Lag en nøkkel i Kumpara under **Utviklerverktøy → API**. Start med en **Test**-nøkkel (`kp_test_...`): egen testkonto, «TEST» på PDF-en, og ingen e-post går til kunder.

Legg nøkkelen i miljøvariabelen `KUMPARA_API_KEY`. Aldri i koden, og aldri i nettleseren: biblioteket er for serveren din.

```js
import { Kumpara } from 'kumpara';

const kumpara = new Kumpara();   // leser KUMPARA_API_KEY

const customer = await kumpara.customers.create({
  type: 'company',
  name: 'Fjord Design AS',
  orgNumber: '923609016',
  email: 'post@fjorddesign.no',
  address: 'Strandgata 1',
  postalCode: '5003',
  city: 'Bergen',
  externalRef: 'kunde-42',        // din egen id: samme verdi igjen endrer samme kunde
});

const invoice = await kumpara.invoices.create({
  customerId: customer.id,
  lines: [
    { name: 'Abonnement Pro, desember', quantity: 1, unitPrice: 14900 },
    { name: 'Oppsett', quantity: 2, unit: 'time', unitPrice: 95000 },
  ],
  dueDays: 14,
  externalRef: 'ordre-1001',      // samme verdi igjen gir samme faktura tilbake, aldri en ny
  send: true,                     // e-post med PDF til kunden
});

console.log(invoice.invoiceNumber, invoice.kid);
```

Med CommonJS: `const { Kumpara } = require('kumpara');`

**Alle beløp er i øre, som hele tall.** 149 kr = `14900`.

Hvert kall gir `data`-delen av svaret fra API-et. Feltene står i [dokumentasjonen](https://kumpara.no/docs).

## Kall

```js
await kumpara.me();                                  // kontoen nøkkelen virker i, og mode: test eller live
await kumpara.registry('923609016');                 // slå opp i Enhetsregisteret (org.nr. eller navn)

await kumpara.customers.list({ q: 'fjord', page: 1 });
await kumpara.customers.get(12);
await kumpara.customers.update(12, { email: 'faktura@fjorddesign.no' });

await kumpara.products.create({ name: 'Timepris design', unit: 'time', unitPrice: 95000 });

await kumpara.invoices.list({ filter: 'overdue' });  // open, overdue, paid, credited, credit
await kumpara.invoices.send(26);                     // eller send(26, 'regnskap@firma.no')
await kumpara.invoices.markPaid(26, { paidDate: '2026-11-19' });
await kumpara.invoices.markUnpaid(26);
await kumpara.invoices.credit(26, 'Feil antall timer');   // kreditnota for hele fakturaen

import { writeFile } from 'node:fs/promises';
await writeFile('faktura.pdf', await kumpara.invoices.pdfBuffer(26));
```

## Feil

Når API-et sier nei, kastes en `ApiError` eller en av underklassene. `message` er API-ets egen tekst (norsk, for mennesker). Bruk `code` og `field` i koden.

```js
import { ConflictError, ValidationError } from 'kumpara';

try {
  await kumpara.invoices.create(invoice);
} catch (e) {
  if (e instanceof ValidationError) {
    // 422: e.field sier hvilket felt, for eksempel "plan" når gratisfakturaene er brukt opp
  } else if (e instanceof ConflictError) {
    // 409: "settings" (avsenderopplysninger mangler) eller "numberStart" (første fakturanummer ikke valgt)
  } else {
    throw e;
  }
}
```

| Feil | HTTP | Eksempel på `code` |
|---|---|---|
| `AuthenticationError` | 401 | `invalid_api_key`, `unauthorized` |
| `PaymentError` | 402, 502 | `payment_failed`, `payment_provider` |
| `PermissionError` | 403 | `missing_scope`, `not_allowed_for_api_key`, `account_closed` |
| `NotFoundError` | 404 | `not_found` |
| `ConflictError` | 409 | `conflict` |
| `ValidationError` | 422 | `validation_error` |
| `RateLimitError` | 429 | `rate_limited`, `too_many_invalid_keys` |
| `ServerError` | 5xx | `server_error` |
| `ConnectionError` | | Ikke noe svar (DNS, TLS, tidsavbrudd) |

### Nye forsøk

Biblioteket prøver igjen av seg selv (to ganger som standard) når det er trygt:

- `429 rate_limited`: venter så lenge `Retry-After` sier, opptil 10 sekunder.
- Nettverksfeil og `5xx`: bare for `GET`, og for `POST` med `externalRef` eller `ref`, fordi Kumpara da gir samme resultat tilbake i stedet for å lage noe nytt.

Bruk derfor alltid `externalRef` når du lager fakturaer.

```js
const kumpara = new Kumpara({ maxRetries: 0, timeout: 15_000 });
```

## Webhooks

Legg til en https-adresse under **Utviklerverktøy → Webhooks** i Kumpara. Sjekk signaturen mot den **rå** kroppen før du stoler på innholdet:

```js
import express from 'express';
import { Webhook, SignatureError } from 'kumpara';

const app = express();

app.post('/kumpara/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    event = Webhook.constructEvent(req.body, req.get('Kumpara-Signature'), process.env.KUMPARA_WEBHOOK_SECRET);
  } catch (e) {
    if (e instanceof SignatureError) return res.sendStatus(400);
    throw e;
  }

  if (event.type === 'invoice.paid') {
    const invoice = event.data.invoice;
    // marker ordren invoice.externalRef som betalt i systemet ditt
  }
  res.sendStatus(200);
});
```

Svar med `2xx` innen 5 sekunder. Samme hendelse kan i sjeldne tilfeller komme to ganger: bruk `event.id` for å se om du har behandlet den før.

## Kontoer for kundene dine

Lager du en app der kundene dine fakturerer, kan hver av dem få sin egen Kumpara-konto. Nøkkelen trenger rettigheten `tenants`.

```js
const tenant = await kumpara.tenants.create({
  ref: 'kunde-42',                // din egen id: samme ref igjen gir samme konto
  name: 'Rørlegger Hansen AS',
  orgNumber: '923609016',
  email: 'post@hansen.no',
  address: 'Ny vei 9',
  postalCode: '5003',
  city: 'Bergen',
  bankAccount: '86011117947',
});

const hansen = kumpara.withTenant(tenant.id);   // en ny klient som jobber i den kontoen
await hansen.invoices.create({ /* ... */ });
```

Med en live-nøkkel er hver ny konto et eget Pro-abonnement. Les [dokumentasjonen](https://kumpara.no/docs#kontoer-for-kundene-dine) før du bruker det.

## Test og live

`kumpara.isTestMode` er `true` for en `kp_test_`-nøkkel. Bygg og test med den, og bytt til `kp_live_` når alt virker.

## AI-assistenter

Kumpara kan også brukes direkte fra Claude og ChatGPT med MCP: `https://mcp.kumpara.no`. Dokumentasjonen for AI-assistenter som skriver kode: [kumpara.no/llms.txt](https://kumpara.no/llms.txt).

## Utvikling

```bash
npm install
npm test
```

## Lisens

MIT. Se [LICENSE](LICENSE). Kumpara er laget av Nufel Web Hosting.
