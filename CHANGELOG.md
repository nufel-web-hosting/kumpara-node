# Changelog

All notable changes to this package. Versions follow [Semantic Versioning](https://semver.org).

## [0.1.0] - unreleased

First release.

- `Kumpara` client with customers, products, invoices (send, paid, unpaid, credit, PDF), tenants, `me()` and `registry()`
- `withTenant()` to work in one of your customers' accounts (`X-Tenant-Id`)
- Errors by HTTP status, with the API's `code` and `field`
- Safe retries: 429 with `Retry-After`, and network errors and 5xx for GET and for POST with `externalRef` or `ref`
- `Webhook.constructEvent()` checks `Kumpara-Signature`
- TypeScript types, ESM and CommonJS, no runtime dependencies
