const E164 = /^\+[1-9]\d{7,14}$/;

export const SUPPORTED_COUNTRY_CODES = ["44", "33"] as const;

export function isE164(value: string): boolean {
  return E164.test(value);
}

export function normalisePhone(input: string): string | null {
  const compact = input.trim().replace(/[\s().\-/]/g, "");
  if (!/^\+?\d+$/.test(compact)) return null;

  let phone: string;
  if (compact.startsWith("+")) phone = compact;
  else if (compact.startsWith("00")) phone = `+${compact.slice(2)}`;
  else if (compact.startsWith("0")) phone = `+44${compact.slice(1)}`;
  else return null;

  // "+44 (0)7700 900123" keeps the UK trunk zero once the brackets are gone.
  if (phone.startsWith("+440")) phone = `+44${phone.slice(4)}`;

  const supported = SUPPORTED_COUNTRY_CODES.some((code) => phone.startsWith(`+${code}`));
  return supported && isE164(phone) ? phone : null;
}
