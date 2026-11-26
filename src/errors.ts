/** Every error this SDK throws extends this one. */
export class KumparaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** No answer from Kumpara (DNS, TLS, timeout). The call may or may not have run: use externalRef to repeat it safely. */
export class ConnectionError extends KumparaError {}

/** A webhook whose Kumpara-Signature does not match, is too old, or whose body is not a Kumpara event. */
export class SignatureError extends KumparaError {}

/**
 * The API answered with an error. `message` is the API's own text (Norwegian, for people); use `code` and `field`
 * in code. The subclasses follow the HTTP status.
 */
export class ApiError extends KumparaError {
  /** HTTP status, for example 422. */
  readonly status: number;
  /** Stable error code, for example validation_error, conflict, rate_limited. */
  readonly code: string;
  /** The field the error is about, when it is about one (for example email, settings, plan). */
  readonly field: string | null;
  /** Seconds to wait (429). */
  readonly retryAfter: number | null;
  /** The raw response body. */
  readonly body: string;

  constructor(message: string, status: number, code: string, field: string | null, retryAfter: number | null, body: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
    this.retryAfter = retryAfter;
    this.body = body;
  }
}

/** 401: no key, or the key does not exist (invalid_api_key, unauthorized). */
export class AuthenticationError extends ApiError {}
/** 402 payment_failed or 502 payment_provider: the card was declined or the payment provider did not answer. Nothing was made. */
export class PaymentError extends ApiError {}
/** 403: missing_scope, not_allowed_for_api_key or account_closed. */
export class PermissionError extends ApiError {}
/** 404 not_found. */
export class NotFoundError extends ApiError {}
/** 409 conflict: cannot be done now. `field` says why, for example settings (sender details missing) or numberStart. */
export class ConflictError extends ApiError {}
/** 422 validation_error. `field` names the field, for example plan when the free invoices are used up. */
export class ValidationError extends ApiError {}
/** 429: rate_limited (see retryAfter) or too_many_invalid_keys. */
export class RateLimitError extends ApiError {}
/** 5xx: an error at Kumpara. Try again later. */
export class ServerError extends ApiError {}

const CODE_FOR_STATUS: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  402: 'payment_failed',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  409: 'conflict',
  422: 'validation_error',
  429: 'rate_limited',
};

/** @internal */
export function errorFromResponse(status: number, json: unknown, body: string, retryAfterHeader: string | null): ApiError {
  const data = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const code = typeof data.code === 'string' ? data.code : (CODE_FOR_STATUS[status] ?? 'server_error');
  const message = typeof data.message === 'string' && data.message !== '' ? data.message : `Kumpara answered HTTP ${status}`;
  const field = typeof data.field === 'string' ? data.field : null;
  const retryAfter = retryAfterHeader !== null && /^\d+$/.test(retryAfterHeader) ? Number(retryAfterHeader) : null;

  const ErrorClass =
    status === 401 ? AuthenticationError
    : status === 402 || code === 'payment_provider' ? PaymentError
    : status === 403 ? PermissionError
    : status === 404 ? NotFoundError
    : status === 409 ? ConflictError
    : status === 422 ? ValidationError
    : status === 429 ? RateLimitError
    : status >= 500 ? ServerError
    : ApiError;

  return new ErrorClass(message, status, code, field, retryAfter, body);
}
