// Stage 2 — Identifier Validator
// Syntax, GS1 Mod-10 check digit, and membership of the GS1 Company Prefix range this resolver serves.
// The same functions are meant to be reused by the link ingest path (single source of validation rules).
// DPP: a mistyped or foreign identifier stops here, so it can never lead to another product's passport.

export class ValidationError extends Error {
  constructor(status, title, detail) { super(detail); this.status = status; this.title = title; }
}

export function checkDigit(body) {
  // body = all digits except the check digit; weights 3,1,3,1… from the right
  let sum = 0;
  const digits = body.split('').reverse();
  digits.forEach((c, i) => { sum += Number(c) * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10;
}

export function normaliseGtin(value) {
  if (!/^\d+$/.test(value)) {
    throw new ValidationError(400, 'Invalid GTIN syntax', 'GTIN must contain digits only');
  }
  if (![8, 12, 13, 14].includes(value.length)) {
    throw new ValidationError(400, 'Invalid GTIN syntax', `GTIN must have 8, 12, 13 or 14 digits (got ${value.length})`);
  }
  return value.padStart(14, '0'); // GTIN-8/12/13 → GTIN-14 by leading zeros (GS1 General Specifications)
}

export function validate(parsed, { allowedPrefixes }) {
  const gtin14 = normaliseGtin(parsed.primary.value);
  const expected = checkDigit(gtin14.slice(0, 13));
  if (Number(gtin14[13]) !== expected) {
    throw new ValidationError(400, 'Invalid GTIN check digit', `Check digit should be ${expected}`);
  }
  // Position 1 is the indicator digit; the GS1 Company Prefix starts at position 2.
  const prefixPart = gtin14.slice(1);
  if (!allowedPrefixes.some((p) => prefixPart.startsWith(p))) {
    throw new ValidationError(404, 'GTIN outside served prefix range',
      'The GTIN is well formed but its GS1 Company Prefix is not managed by this resolver');
  }
  return { ...parsed, gtin14 };
}
