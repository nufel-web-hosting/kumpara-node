/**
 * Request shapes follow https://kumpara.no/docs. Answers are typed with the fields most code needs; every answer
 * also carries the rest of what the API returns. All amounts are in øre (149 kr = 14900).
 */

export interface ListParams {
  q?: string;
  page?: number;
}

export interface CustomerInput {
  type: 'company' | 'person';
  name: string;
  orgNumber?: string;
  email?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  /** Default NO. */
  country?: string;
  contactName?: string;
  phone?: string;
  note?: string;
  /** Your own id for the customer: the same externalRef again updates the same customer. */
  externalRef?: string;
}

export interface ProductInput {
  name: string;
  /** In øre. */
  unitPrice?: number;
  /** Default stk. */
  unit?: string;
  description?: string;
  productNumber?: string;
  vatRate?: 0 | 12 | 15 | 25;
  priceIncludesVat?: boolean;
}

export interface InvoiceLineInput {
  name: string;
  /** May have decimals: 1.5. */
  quantity?: number;
  /** In øre. */
  unitPrice?: number;
  unit?: string;
  description?: string;
  vatRate?: 0 | 12 | 15 | 25;
  priceIncludesVat?: boolean;
  discountPercent?: number;
  productId?: number;
}

export interface InvoiceInput {
  customerId: number;
  lines: InvoiceLineInput[];
  /** Your order id: the same externalRef again gives the same invoice back, never a new one and never a second e-mail. */
  externalRef?: string;
  /** E-mail the invoice as PDF to the customer. */
  send?: boolean;
  /** Create it as already paid (a receipt). */
  paid?: boolean;
  dueDays?: number;
  yourRef?: string;
  ourRef?: string;
  note?: string;
  /** YYYY-MM-DD */
  deliveryDate?: string;
}

export interface InvoiceListParams extends ListParams {
  filter?: '' | 'open' | 'overdue' | 'paid' | 'credited' | 'credit';
}

export interface MarkPaidInput {
  /** YYYY-MM-DD */
  paidDate?: string;
  paidRef?: string;
}

export interface TenantInput {
  /** Your own id for the account: the same ref again gives the same account back (and is not charged again). */
  ref: string;
  name: string;
  orgNumber?: string;
  email?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  bankAccount?: string;
  kidMode?: 'mod10' | 'mod11' | 'message';
  vatRegistered?: boolean;
  defaultVatRate?: 0 | 12 | 15 | 25;
  phone?: string;
  website?: string;
  paymentTermsDays?: number;
  invoiceNote?: string;
  invoiceColor?: string;
  /** First invoice number in the account (default 1000000). Cannot be changed later. */
  invoiceStart?: number;
}

/** Any answer from the API: the documented fields plus whatever else it returns. */
export type KumparaObject = Record<string, unknown>;

export interface Customer extends KumparaObject {
  id: number;
  name: string;
}

export interface Product extends KumparaObject {
  id: number;
  name: string;
}

export interface Invoice extends KumparaObject {
  id: number;
  kind: 'invoice' | 'credit';
  invoiceNumber: number;
  kid: string;
  kidMode: 'mod10' | 'mod11' | 'message';
  externalRef: string | null;
}

export interface InvoicePdf {
  filename: string;
  contentType: string;
  size: number;
  base64: string;
}

export interface Tenant extends KumparaObject {
  id: number;
  ref: string;
  name: string;
}

export interface WebhookEvent {
  id: string;
  type: 'invoice.issued' | 'invoice.sent' | 'invoice.paid' | 'invoice.unpaid' | 'invoice.credited' | 'invoice.overdue' | (string & {});
  created: number;
  livemode: boolean;
  tenantId: number | null;
  data: { invoice?: KumparaObject } & KumparaObject;
}
