const E164 = /^\+[1-9]\d{7,14}$/;

export const COUNTRIES = [
  { iso: "GB", dial: "44", name: "United Kingdom", flag: "🇬🇧", example: "7700 900123" },
  { iso: "FR", dial: "33", name: "France", flag: "🇫🇷", example: "6 12 34 56 78" },
] as const;

export type Country = (typeof COUNTRIES)[number];
export type CountryIso = Country["iso"];

export const SUPPORTED_COUNTRY_CODES = COUNTRIES.map((country) => country.dial);

export function isE164(value: string): boolean {
  return E164.test(value);
}

export function countryOf(phone: string): Country | null {
  return COUNTRIES.find((country) => phone.startsWith(`+${country.dial}`)) ?? null;
}

export function normalisePhone(input: string): string | null {
  const compact = input.trim().replace(/[\s().\-/]/g, "");
  if (!/^\+?\d+$/.test(compact)) return null;

  let phone: string;
  if (compact.startsWith("+")) phone = compact;
  else if (compact.startsWith("00")) phone = `+${compact.slice(2)}`;
  else return null;

  // "+44 (0)7700 900123" and "+33 (0)6 12 34 56 78" keep the trunk zero once the brackets are gone.
  const country = countryOf(phone);
  if (!country) return null;
  const national = phone.slice(country.dial.length + 1).replace(/^0/, "");
  phone = `+${country.dial}${national}`;

  return isE164(phone) ? phone : null;
}

export function composePhone(dial: string, national: string): string | null {
  const trimmed = national.trim();
  if (trimmed.startsWith("+") || trimmed.startsWith("00")) return normalisePhone(trimmed);
  return normalisePhone(`+${dial}${trimmed}`);
}
