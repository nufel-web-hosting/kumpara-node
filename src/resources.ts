import type { Kumpara } from './client.js';
import type {
  Customer,
  CustomerInput,
  Invoice,
  InvoiceInput,
  InvoiceListParams,
  InvoicePdf,
  KumparaObject,
  ListParams,
  MarkPaidInput,
  Product,
  ProductInput,
  Tenant,
  TenantInput,
} from './types.js';

/** Customers: /customers. */
export class Customers {
  constructor(private readonly client: Kumpara) {}

  list(params: ListParams = {}): Promise<KumparaObject> {
    return this.client.request('GET', '/customers', { ...params });
  }

  get(id: number): Promise<Customer> {
    return this.client.request('GET', `/customers/${id}`);
  }

  /** With externalRef, the same externalRef again updates that customer instead: safe to run more than once. */
  create(customer: CustomerInput): Promise<Customer> {
    return this.client.request('POST', '/customers', {}, customer);
  }

  update(id: number, changes: Partial<CustomerInput>): Promise<Customer> {
    return this.client.request('POST', `/customers/${id}`, {}, changes);
  }
}

/** Products: /products. Prices in øre. */
export class Products {
  constructor(private readonly client: Kumpara) {}

  list(params: ListParams = {}): Promise<KumparaObject> {
    return this.client.request('GET', '/products', { ...params });
  }

  get(id: number): Promise<Product> {
    return this.client.request('GET', `/products/${id}`);
  }

  create(product: ProductInput): Promise<Product> {
    return this.client.request('POST', '/products', {}, product);
  }

  update(id: number, changes: Partial<ProductInput>): Promise<Product> {
    return this.client.request('POST', `/products/${id}`, {}, changes);
  }
}

/**
 * Invoices and credit notes: /invoices. An issued invoice has the next number in the series and can never be
 * deleted; a mistake is fixed with credit(). Amounts in øre.
 */
export class Invoices {
  constructor(private readonly client: Kumpara) {}

  list(params: InvoiceListParams = {}): Promise<KumparaObject> {
    return this.client.request('GET', '/invoices', { ...params });
  }

  get(id: number): Promise<Invoice> {
    return this.client.request('GET', `/invoices/${id}`);
  }

  /**
   * Issues an invoice. Use externalRef (your order id): the same externalRef again gives the same invoice back,
   * never a new one and never a second e-mail, so a retry after a timeout is safe.
   */
  create(invoice: InvoiceInput): Promise<Invoice> {
    return this.client.request('POST', '/invoices', {}, invoice);
  }

  /** E-mails the invoice as PDF, to the customer or to `email`. */
  send(id: number, email?: string): Promise<Invoice> {
    return this.client.request('POST', `/invoices/${id}/send`, {}, email === undefined ? {} : { email });
  }

  /** Marks it as paid. Kumpara never moves money: this is your own record that the money came. */
  markPaid(id: number, details: MarkPaidInput = {}): Promise<Invoice> {
    return this.client.request('POST', `/invoices/${id}/paid`, {}, details);
  }

  markUnpaid(id: number): Promise<Invoice> {
    return this.client.request('POST', `/invoices/${id}/unpaid`, {}, {});
  }

  /** Makes a credit note for the whole invoice. */
  credit(id: number, reason?: string): Promise<Invoice> {
    return this.client.request('POST', `/invoices/${id}/credit`, {}, reason === undefined ? {} : { reason });
  }

  /** The PDF as the API gives it (base64). */
  pdf(id: number): Promise<InvoicePdf> {
    return this.client.request('GET', `/invoices/${id}/pdf`);
  }

  /** The PDF file itself, ready to save or send. */
  async pdfBuffer(id: number): Promise<Buffer> {
    const pdf = await this.pdf(id);
    return Buffer.from(pdf.base64 ?? '', 'base64');
  }
}

/**
 * Accounts for your customers: /tenants. The key needs the `tenants` scope. Work inside one with
 * kumpara.withTenant(id). With a live key, a new account is its own Pro subscription.
 */
export class Tenants {
  constructor(private readonly client: Kumpara) {}

  list(): Promise<KumparaObject> {
    return this.client.request('GET', '/tenants');
  }

  get(id: number): Promise<Tenant> {
    return this.client.request('GET', `/tenants/${id}`);
  }

  /** The same ref again gives the same account back (and is not charged again). */
  create(tenant: TenantInput): Promise<Tenant> {
    return this.client.request('POST', '/tenants', {}, tenant);
  }

  /** Changes only the fields you send. */
  update(id: number, changes: Partial<TenantInput>): Promise<Tenant> {
    return this.client.request('POST', `/tenants/${id}`, {}, changes);
  }

  /** Ends the account. A live account lasts out the paid period; a test account is closed. */
  release(id: number): Promise<KumparaObject> {
    return this.client.request('POST', `/tenants/${id}/release`, {}, {});
  }

  /** `logo`: a data URL (PNG, JPG, WebP or GIF, up to 2 MB), or the image bytes with their type. */
  setLogo(id: number, logo: string | { data: Uint8Array; type: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' }): Promise<KumparaObject> {
    const dataUrl = typeof logo === 'string' ? logo : `data:${logo.type};base64,${Buffer.from(logo.data).toString('base64')}`;
    return this.client.request('POST', `/tenants/${id}/logo`, {}, { logo: dataUrl });
  }

  removeLogo(id: number): Promise<KumparaObject> {
    return this.client.request('POST', `/tenants/${id}/logo/remove`, {}, {});
  }

  /** Sends your customer a link (valid 14 days) to take over the account. */
  transfer(id: number, email: string): Promise<KumparaObject> {
    return this.client.request('POST', `/tenants/${id}/transfer`, {}, { email });
  }

  withdrawTransfer(id: number): Promise<KumparaObject> {
    return this.client.request('POST', `/tenants/${id}/transfer/withdraw`, {}, {});
  }
}
