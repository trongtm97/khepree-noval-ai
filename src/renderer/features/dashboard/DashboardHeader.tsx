import { HelpContextButton } from '../help/HelpContextButton';
import { PageHeader } from '../../components/ui';
import { useT } from '../../i18n';

export function DashboardHeader() {
  const t = useT();
  return (
    <PageHeader
      title={t('dashboard.title')}
      description={t('dashboard.subtitle')}
      actions={<HelpContextButton articleId="quick-start" />}
    />
  );
}
