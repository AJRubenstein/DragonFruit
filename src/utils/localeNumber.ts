/**
 * Locale-aware number formatting for user-visible text.
 *
 * `toFixed` always writes "." as the decimal separator, so a Spanish UI shows
 * "28.03 MB" next to a Lingui plural that prints "560.464 polígonos". These
 * helpers go through Intl.NumberFormat with the active Lingui locale instead.
 *
 * The locale is a required argument rather than a read of `i18n.locale` in here:
 * React Compiler memoizes a call on the arguments it can see, so a locale read
 * inside the helper would leave the old language cached after a switch. Callers
 * pass `i18n.locale` from `useLingui()`.
 *
 * Only for display. Input values, serialization, file names and logs keep
 * `toFixed`/`String`, which stay parseable.
 */

const formatters = new Map<string, Intl.NumberFormat>();

/** Formats `value` for `locale` with any Intl.NumberFormat options. */
export function formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string {
  const key = `${locale}|${options ? JSON.stringify(options) : ''}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    formatters.set(key, formatter);
  }
  return formatter.format(value);
}

/** The locale-aware counterpart of `value.toFixed(fractionDigits)`. */
export function formatFixed(value: number, fractionDigits: number, locale: string): string {
  return formatNumber(value, locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}
