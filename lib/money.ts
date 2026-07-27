/**
 * Canonical Money — ADR-007.
 *
 * Money is an **integer count of the currency's smallest unit** plus an ISO 4217
 * code. NGN 500,000 is stored as `{ amountMinor: 50000000, currency: 'NGN' }`
 * — fifty million kobo.
 *
 * ─── Why not floating-point major units ──────────────────────────────────────
 * The pre-v5 representation stored face values as JavaScript numbers. That
 * survived only because nothing computed with them. `0.1 + 0.2` is
 * `0.30000000000000004`, and a Program budget envelope consumed across hundreds
 * of Moments accumulates that error until the reported margin is wrong.
 * Integers are exact, compare safely, and serialize to JSON byte-identically.
 *
 * ─── Why the exponent is pinned, not derived ─────────────────────────────────
 * The number of decimal places a currency uses is a property of the currency,
 * not of the reader. `Intl` can be asked, but it varies by runtime and ICU
 * version, and a value that changes with the browser is not a basis for storing
 * money. The table below is explicit, versioned with the code, and the single
 * authority. Locale is used for *display only*, never to decide precision.
 */

// ─── Currency table (pinned) ─────────────────────────────────────────────────

/**
 * ISO 4217 minor-unit exponents.
 *
 * `exponent` is how many decimal places the currency has, i.e. one major unit
 * equals `10 ** exponent` minor units:
 *
 *   0 — the minor unit *is* the major unit (JPY: 1 yen = 1 yen)
 *   2 — the common case (NGN: 1 naira = 100 kobo)
 *   3 — Gulf currencies (KWD: 1 dinar = 1000 fils)
 *
 * Add a currency here before it can be stored. An unknown code is refused
 * rather than assumed to be 2 — silently guessing would misprice every amount
 * in a zero- or three-decimal currency by a factor of 100 or 10.
 */
export const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = {
  // ── Zero-decimal ──
  JPY: 0, // Japanese yen
  KRW: 0, // South Korean won
  VND: 0, // Vietnamese dong
  RWF: 0, // Rwandan franc
  UGX: 0, // Ugandan shilling
  XOF: 0, // West African CFA franc
  XAF: 0, // Central African CFA franc
  CLP: 0, // Chilean peso
  ISK: 0, // Icelandic krona

  // ── Two-decimal ──
  NGN: 2, // Nigerian naira — kobo
  KES: 2, // Kenyan shilling — cents
  GHS: 2, // Ghanaian cedi — pesewas
  ZAR: 2, // South African rand — cents
  USD: 2, // US dollar
  EUR: 2, // Euro
  GBP: 2, // Pound sterling
  EGP: 2, // Egyptian pound
  MAD: 2, // Moroccan dirham
  TZS: 2, // Tanzanian shilling
  ETB: 2, // Ethiopian birr
  CAD: 2, // Canadian dollar
  AUD: 2, // Australian dollar
  AED: 2, // UAE dirham
  CHF: 2, // Swiss franc
  CNY: 2, // Chinese yuan
  INR: 2, // Indian rupee

  // ── Three-decimal ──
  BHD: 3, // Bahraini dinar — fils
  KWD: 3, // Kuwaiti dinar — fils
  OMR: 3, // Omani rial — baisa
  TND: 3, // Tunisian dinar — millimes
  JOD: 3, // Jordanian dinar — fils
  IQD: 3, // Iraqi dinar — fils
  LYD: 3, // Libyan dinar — dirham
};

export type CurrencyCode = string;

/** ISO 4217 alpha-3, uppercase. */
export const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export function isKnownCurrency(currency: string): boolean {
  return Object.prototype.hasOwnProperty.call(CURRENCY_EXPONENTS, currency);
}

/**
 * Minor-unit exponent for a currency, or `null` when the currency is unknown.
 *
 * Returns null rather than a default so every caller has to decide what to do
 * about an unrecognized currency. A default of 2 here would be a silent
 * hundred-fold error on JPY.
 */
export function currencyExponent(currency: string): number | null {
  if (!isKnownCurrency(currency)) return null;
  return CURRENCY_EXPONENTS[currency];
}

/** Minor units per major unit — 1, 100, or 1000. */
export function minorUnitsPerMajor(currency: string): number | null {
  const exponent = currencyExponent(currency);
  return exponent === null ? null : 10 ** exponent;
}

// ─── Canonical type ──────────────────────────────────────────────────────────

export interface Money {
  /** Integer count of the currency's smallest unit. Never fractional. */
  amountMinor: number;
  /** ISO 4217 alpha-3, uppercase. */
  currency: CurrencyCode;
}

export type MoneyResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export function isValidMoney(value: unknown): value is Money {
  if (typeof value !== 'object' || value === null) return false;
  const money = value as Partial<Money>;
  return (
    typeof money.amountMinor === 'number' &&
    Number.isSafeInteger(money.amountMinor) &&
    typeof money.currency === 'string' &&
    CURRENCY_CODE_PATTERN.test(money.currency) &&
    isKnownCurrency(money.currency)
  );
}

/**
 * Build a Money from minor units, refusing anything that cannot be stored
 * faithfully.
 */
export function money(amountMinor: number, currency: string): MoneyResult<Money> {
  const normalized = currency.trim().toUpperCase();

  if (!CURRENCY_CODE_PATTERN.test(normalized)) {
    return { ok: false, reason: `"${currency}" is not a three-letter currency code.` };
  }
  if (!isKnownCurrency(normalized)) {
    return {
      ok: false,
      reason: `${normalized} is not a supported currency. Supported: ${supportedCurrencies().join(', ')}.`,
    };
  }
  if (!Number.isFinite(amountMinor)) {
    return { ok: false, reason: 'Amount is not a finite number.' };
  }
  if (!Number.isInteger(amountMinor)) {
    return { ok: false, reason: `Amount must be a whole number of minor units, got ${amountMinor}.` };
  }
  if (!Number.isSafeInteger(amountMinor)) {
    return {
      ok: false,
      reason: `Amount ${amountMinor} is too large to represent exactly. The safe limit is ${Number.MAX_SAFE_INTEGER}.`,
    };
  }

  return { ok: true, value: { amountMinor, currency: normalized } };
}

export function zero(currency: string): MoneyResult<Money> {
  return money(0, currency);
}

export function supportedCurrencies(): string[] {
  return Object.keys(CURRENCY_EXPONENTS).sort();
}

// ─── Rounding ────────────────────────────────────────────────────────────────

/**
 * Half away from zero — 2.5 → 3, −2.5 → −3.
 *
 * Chosen over `Math.round` (which is half-*up*, so −2.5 → −2) because it treats
 * gains and refunds symmetrically. An asymmetric rule quietly favours one
 * direction, which is the kind of bias nobody notices until an audit.
 */
export function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

// ─── Parsing from human input ────────────────────────────────────────────────

export interface ParseOptions {
  /**
   * How to handle input with more decimal places than the currency supports.
   * `reject` is the default: a typo is more likely than a genuine sub-unit.
   */
  excessPrecision?: 'reject' | 'round';
}

export interface ParsedMoney {
  money: Money;
  /** Set when `excessPrecision: 'round'` actually discarded precision. */
  warning?: string;
}

/**
 * Parse a human-entered **major-unit** amount into canonical Money.
 *
 * Accepts `"1,234.56"`, `"1234.56"`, `" 1234 "`, `1234.56`. Thousands
 * separators are stripped; a leading minus is honoured.
 *
 * The conversion multiplies by the currency's minor-unit factor and rounds once,
 * so no floating-point value survives past this boundary.
 */
export function parseMoney(
  input: string | number,
  currency: string,
  options: ParseOptions = {},
): MoneyResult<ParsedMoney> {
  const normalizedCurrency = currency.trim().toUpperCase();
  const exponent = currencyExponent(normalizedCurrency);

  if (!CURRENCY_CODE_PATTERN.test(normalizedCurrency)) {
    return { ok: false, reason: `"${currency}" is not a three-letter currency code.` };
  }
  if (exponent === null) {
    return {
      ok: false,
      reason: `${normalizedCurrency} is not a supported currency. Supported: ${supportedCurrencies().join(', ')}.`,
    };
  }

  const raw = typeof input === 'number' ? String(input) : input.trim().replace(/,/g, '');

  if (raw === '') return { ok: false, reason: 'Enter an amount.' };
  if (!/^-?\d*(\.\d*)?$/.test(raw) || raw === '-' || raw === '.' || raw === '-.') {
    return { ok: false, reason: `"${String(input).trim()}" is not a valid amount. Use digits, for example 25000 or 25000.50.` };
  }

  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole = '', fraction = ''] = unsigned.split('.');

  if (fraction.length > exponent) {
    const mode = options.excessPrecision ?? 'reject';
    if (mode === 'reject') {
      return {
        ok: false,
        reason:
          exponent === 0
            ? `${normalizedCurrency} amounts have no decimal places. Enter a whole number.`
            : `${normalizedCurrency} amounts have at most ${exponent} decimal place${exponent === 1 ? '' : 's'}.`,
      };
    }
  }

  // Integer arithmetic only: pad or truncate the fraction to the exponent, then
  // round the discarded tail once. Never `parseFloat(x) * 100`.
  const padded = fraction.padEnd(exponent, '0');
  const kept = padded.slice(0, exponent);
  const discarded = padded.slice(exponent);

  const wholeMinor = Number(whole === '' ? '0' : whole) * 10 ** exponent;
  const fractionMinor = kept === '' ? 0 : Number(kept);
  let amountMinor = wholeMinor + fractionMinor;

  let warning: string | undefined;
  if (discarded !== '') {
    const carry = roundHalfAwayFromZero(Number(`0.${discarded}`));
    amountMinor += carry;
    warning =
      `${normalizedCurrency} supports ${exponent} decimal place${exponent === 1 ? '' : 's'}; ` +
      `"${String(input).trim()}" was rounded to ${formatMinor(amountMinor, normalizedCurrency, exponent)}.`;
  }

  const signed = negative ? -amountMinor : amountMinor;
  const built = money(signed, normalizedCurrency);
  if (!built.ok) return built;

  return { ok: true, value: { money: built.value, ...(warning ? { warning } : {}) } };
}

// ─── Formatting for display ──────────────────────────────────────────────────

function formatMinor(amountMinor: number, currency: string, exponent: number): string {
  const negative = amountMinor < 0;
  const digits = String(Math.abs(amountMinor)).padStart(exponent + 1, '0');
  const whole = digits.slice(0, digits.length - exponent) || '0';
  const fraction = exponent === 0 ? '' : `.${digits.slice(digits.length - exponent)}`;
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction}`;
}

/**
 * Major-unit string, without a currency symbol — `"500,000.00"`.
 *
 * Built from the integer, not by dividing: division would reintroduce the
 * floating-point error the minor-unit representation exists to avoid.
 */
export function toMajorString(value: Money): string {
  const exponent = currencyExponent(value.currency) ?? 2;
  return formatMinor(value.amountMinor, value.currency, exponent);
}

/**
 * Plain major-unit number, for pre-filling a form field. Lossy by nature —
 * never write the result back into storage.
 */
export function toMajorNumber(value: Money): number {
  const exponent = currencyExponent(value.currency) ?? 2;
  return value.amountMinor / 10 ** exponent;
}

/** `"NGN 500,000.00"` — code rather than symbol, which is unambiguous across Africa. */
export function formatMoney(value: Money): string {
  return `${value.currency} ${toMajorString(value)}`;
}

/**
 * Locale-aware display. Precision still comes from the pinned table, never from
 * the locale — the locale decides separators and symbol placement only.
 */
export function formatMoneyLocalized(value: Money, locale?: string): string {
  const exponent = currencyExponent(value.currency);
  if (exponent === null) return formatMoney(value);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: value.currency,
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    }).format(toMajorNumber(value));
  } catch {
    return formatMoney(value);
  }
}

// ─── Comparison and arithmetic ───────────────────────────────────────────────
//
// Every operation refuses a currency mismatch. Cross-currency arithmetic needs
// an explicit, dated exchange-rate snapshot (ADR-007) and is never implicit.

function requireSameCurrency(a: Money, b: Money): string | null {
  if (a.currency !== b.currency) {
    return `Cannot combine ${a.currency} and ${b.currency}. Convert with an explicit exchange rate first.`;
  }
  return null;
}

export function addMoney(a: Money, b: Money): MoneyResult<Money> {
  const mismatch = requireSameCurrency(a, b);
  if (mismatch) return { ok: false, reason: mismatch };
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtractMoney(a: Money, b: Money): MoneyResult<Money> {
  const mismatch = requireSameCurrency(a, b);
  if (mismatch) return { ok: false, reason: mismatch };
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function sumMoney(values: Money[], currency: string): MoneyResult<Money> {
  let total = zero(currency);
  if (!total.ok) return total;
  for (const value of values) {
    const next = addMoney(total.value, value);
    if (!next.ok) return next;
    total = next;
  }
  return total;
}

export function compareMoney(a: Money, b: Money): MoneyResult<number> {
  const mismatch = requireSameCurrency(a, b);
  if (mismatch) return { ok: false, reason: mismatch };
  return { ok: true, value: Math.sign(a.amountMinor - b.amountMinor) };
}

export function moneyEquals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountMinor === b.amountMinor;
}

export function isZeroMoney(value: Money): boolean {
  return value.amountMinor === 0;
}

export function isNegativeMoney(value: Money): boolean {
  return value.amountMinor < 0;
}
