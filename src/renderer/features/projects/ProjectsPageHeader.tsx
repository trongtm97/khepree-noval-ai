import { useRef, useState } from 'react';
import { MoreHorizontal, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '../../i18n';
import { DropdownMenu } from '../../components/overlay';
import { Button, IconButton } from '../../components/ui';
import { HelpContextButton } from '../help/HelpContextButton';

export interface ProjectsPageHeaderProps {
  projectCount: number;
  chapterCount: number;
  needsAttentionCount: number;
  activeCount: number;
  onCreate: () => void;
  onImportMany: () => void;
  onStartCampaign: () => void;
  onImportLegacy: () => void;
  onRestoreBackup: () => void;
}

export function ProjectsPageHeader({
  projectCount,
  chapterCount,
  needsAttentionCount,
  activeCount,
  onCreate,
  onImportMany,
  onStartCampaign,
  onImportLegacy,
  onRestoreBackup,
}: ProjectsPageHeaderProps) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);

  const summaryParts: ReactNode[] = [
  t('projects.summaryProjects', { count: String(projectCount) }),
  ];
  if (chapterCount > 0) {
    summaryParts.push(
      t('projects.summaryChapters', { count: String(chapterCount) }),
    );
  }
  if (activeCount > 0) {
    summaryParts.push(
      t('projects.summaryActive', { count: String(activeCount) }),
    );
  }
  if (needsAttentionCount > 0) {
    summaryParts.push(
      t('projects.summaryAttention', { count: String(needsAttentionCount) }),
    );
  }

  return (
    <header className="projects-page-header">
      <div className="projects-page-header__text">
        <h2>{t('projects.title')}</h2>
        <p className="projects-page-header__summary muted">
          {summaryParts.map((part, i) => (
            <span key={i}>
              {i > 0 ? <span aria-hidden> · </span> : null}
              {part}
            </span>
          ))}
        </p>
      </div>
      <div className="projects-page-header__actions">
        <HelpContextButton articleId="import-novel" />
        <Button variant="primary" size="sm" onClick={onCreate}>
          <Plus size={16} aria-hidden />
          {t('actions.createProject')}
        </Button>
        <Button size="sm" onClick={onImportMany}>
          {t('actions.importManyNovels')}
        </Button>
        <Button size="sm" onClick={onStartCampaign}>
          {t('actions.startCampaign')}
        </Button>
        <IconButton
          ref={menuRef}
          label={t('projects.morePageActions')}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => {
            setMenuOpen((v) => !v);
          }}
        >
          <MoreHorizontal size={18} aria-hidden />
        </IconButton>
        <DropdownMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          anchorRef={menuRef}
          className="translation-menu"
          placement="bottom-end"
          minWidth={220}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onImportLegacy();
            }}
          >
            {t('actions.importOldProject')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onRestoreBackup();
            }}
          >
            {t('actions.restoreBackup')}
          </button>
        </DropdownMenu>
      </div>
    </header>
  );
}
