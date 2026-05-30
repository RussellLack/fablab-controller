import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export const locales = ['en', 'no'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'no';

/**
 * Language is per-user, not URL-based. Reads from a cookie set on toggle,
 * defaults to NO (Fablab is Norwegian by default — see 03-bilingual-pattern.md).
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('locale')?.value;
  const locale: Locale = (locales as readonly string[]).includes(cookieLocale ?? '')
    ? (cookieLocale as Locale)
    : defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default
  };
});
