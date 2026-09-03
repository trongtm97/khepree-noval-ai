import { Button } from '../../components/ui';
import { useT } from '../../i18n';

export interface DashboardPrimaryActionsProps {
  onImportOne: () => void;
  onImportMany: () => void;
}

export function DashboardPrimaryActions({
  onImportOne,
  onImportMany,
}: DashboardPrimaryActionsProps) {
  const t = useT();
  return (
    <section
      className="dashboard-primary-actions"
      aria-label={t('dashboard.primaryActionsAria')}
    >
      <Button
        variant="primary"
        className="dashboard-primary-actions__btn"
        onClick={onImportOne}
      >
        {t('dashboard.importOne')}
      </Button>
      <Button
        variant="secondary"
        className="dashboard-primary-actions__btn"
        onClick={onImportMany}
      >
        {t('actions.importManyNovels')}
      </Button>
    </section>
  );
}
