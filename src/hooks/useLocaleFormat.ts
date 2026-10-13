import { useLingui } from '@lingui/react';
import { localeFormat, type LocaleFormat } from '@/utils/localeNumber';

/** Number formatters for the active Lingui locale; a new object after a locale switch. */
export function useLocaleFormat(): LocaleFormat {
  const { i18n } = useLingui();
  return localeFormat(i18n.locale);
}
