import { getTranslations } from 'next-intl/server';

/** Placeholder for sidebar destinations that haven't been built yet. */
export async function ComingSoon({ titleKey }: { titleKey: string }) {
  const t = await getTranslations();
  return (
    <>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tighter">{t(titleKey)}</h1>
          <p className="text-ink-2 text-[13px] mt-1">{t('common.coming_soon')}</p>
        </div>
      </div>
      <div className="card text-ink-2 text-[13px]">{t('common.coming_soon_body')}</div>
    </>
  );
}
