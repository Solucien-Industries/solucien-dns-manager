export type Country = {
  /** ISO 3166-1 alpha-2 code. */
  iso: string;
  name: string;
  /** International dialing code, digits only (no "+"). */
  dial: string;
  flag: string;
};

/**
 * Curated dialing-code list for the SMS recipient picker. Ordered with the
 * common regional entries first, then alphabetical. `dial` never includes "+".
 */
export const COUNTRIES: Country[] = [
  { iso: "ZA", name: "South Africa", dial: "27", flag: "🇿🇦" },
  { iso: "KE", name: "Kenya", dial: "254", flag: "🇰🇪" },
  { iso: "NG", name: "Nigeria", dial: "234", flag: "🇳🇬" },
  { iso: "GH", name: "Ghana", dial: "233", flag: "🇬🇭" },
  { iso: "TZ", name: "Tanzania", dial: "255", flag: "🇹🇿" },
  { iso: "UG", name: "Uganda", dial: "256", flag: "🇺🇬" },
  { iso: "RW", name: "Rwanda", dial: "250", flag: "🇷🇼" },
  { iso: "ZM", name: "Zambia", dial: "260", flag: "🇿🇲" },
  { iso: "ZW", name: "Zimbabwe", dial: "263", flag: "🇿🇼" },
  { iso: "CD", name: "DR Congo", dial: "243", flag: "🇨🇩" },
  { iso: "CI", name: "Côte d’Ivoire", dial: "225", flag: "🇨🇮" },
  { iso: "SN", name: "Senegal", dial: "221", flag: "🇸🇳" },
  { iso: "CM", name: "Cameroon", dial: "237", flag: "🇨🇲" },
  { iso: "ET", name: "Ethiopia", dial: "251", flag: "🇪🇹" },
  { iso: "EG", name: "Egypt", dial: "20", flag: "🇪🇬" },
  { iso: "MA", name: "Morocco", dial: "212", flag: "🇲🇦" },
  { iso: "MW", name: "Malawi", dial: "265", flag: "🇲🇼" },
  { iso: "MZ", name: "Mozambique", dial: "258", flag: "🇲🇿" },
  { iso: "BW", name: "Botswana", dial: "267", flag: "🇧🇼" },
  { iso: "NA", name: "Namibia", dial: "264", flag: "🇳🇦" },
  { iso: "US", name: "United States", dial: "1", flag: "🇺🇸" },
  { iso: "GB", name: "United Kingdom", dial: "44", flag: "🇬🇧" },
  { iso: "CA", name: "Canada", dial: "1", flag: "🇨🇦" },
  { iso: "IN", name: "India", dial: "91", flag: "🇮🇳" },
  { iso: "AE", name: "United Arab Emirates", dial: "971", flag: "🇦🇪" },
  { iso: "AU", name: "Australia", dial: "61", flag: "🇦🇺" },
  { iso: "DE", name: "Germany", dial: "49", flag: "🇩🇪" },
  { iso: "FR", name: "France", dial: "33", flag: "🇫🇷" },
  { iso: "NL", name: "Netherlands", dial: "31", flag: "🇳🇱" },
  { iso: "ES", name: "Spain", dial: "34", flag: "🇪🇸" },
  { iso: "IT", name: "Italy", dial: "39", flag: "🇮🇹" },
  { iso: "PT", name: "Portugal", dial: "351", flag: "🇵🇹" },
  { iso: "IE", name: "Ireland", dial: "353", flag: "🇮🇪" },
  { iso: "BE", name: "Belgium", dial: "32", flag: "🇧🇪" },
  { iso: "SE", name: "Sweden", dial: "46", flag: "🇸🇪" },
  { iso: "CH", name: "Switzerland", dial: "41", flag: "🇨🇭" },
  { iso: "BR", name: "Brazil", dial: "55", flag: "🇧🇷" },
  { iso: "MX", name: "Mexico", dial: "52", flag: "🇲🇽" },
  { iso: "AR", name: "Argentina", dial: "54", flag: "🇦🇷" },
  { iso: "CN", name: "China", dial: "86", flag: "🇨🇳" },
  { iso: "JP", name: "Japan", dial: "81", flag: "🇯🇵" },
  { iso: "SG", name: "Singapore", dial: "65", flag: "🇸🇬" },
  { iso: "SA", name: "Saudi Arabia", dial: "966", flag: "🇸🇦" },
  { iso: "TR", name: "Türkiye", dial: "90", flag: "🇹🇷" },
];

export const DEFAULT_COUNTRY_ISO = "ZA";

export function findCountry(iso: string): Country | undefined {
  return COUNTRIES.find((c) => c.iso === iso);
}

/**
 * Best-effort match of an E.164 number (with leading "+") back to a country,
 * preferring the longest dialing-code match.
 */
export function countryFromE164(e164: string): Country | undefined {
  const digits = e164.replace(/[^\d]/g, "");
  return [...COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => digits.startsWith(c.dial));
}
