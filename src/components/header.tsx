import { useTranslations } from 'next-intl';
import { LangToggle } from './lang-toggle';
import { HeaderSearchTrigger } from './header-search-trigger';
import { UserMenu } from './user-menu';

export function Header({ userInitials = 'RL', userName = 'Russell L.' }: { userInitials?: string; userName?: string }) {
  const t = useTranslations();
  return (
    <header className="col-span-2 bg-surface border-b border-line flex items-center px-6 gap-6 h-14">
      <div className="font-semibold text-[15px] tracking-tight">
        <span className="inline-block w-2 h-2 bg-accent rounded-full mr-2 align-middle" />
        {t('brand')}
      </div>
      <div className="flex-1 flex justify-center">
        <HeaderSearchTrigger />
      </div>
      <div className="flex items-center gap-4">
        <LangToggle />
        {/* Avatar pill — opens a dropdown with name + Sign out. */}
        <UserMenu userName={userName} userInitials={userInitials} />
      </div>
    </header>
  );
}
