import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import type { ProjectDto } from '@shared/schemas/import';
import { useT } from '../../i18n';
import { DropdownMenu } from '../../components/overlay';
import { IconButton } from '../../components/ui';

export interface ProjectActionsMenuProps {
  project: ProjectDto;
  onDelete: () => void;
  onSetCurrentProject: (id: string, title: string) => void;
}

export function ProjectActionsMenu({
  project,
  onDelete,
  onSetCurrentProject,
}: ProjectActionsMenuProps) {
  const t = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const go = (path: string) => {
    onSetCurrentProject(project.id, project.title);
    navigate(path);
    setOpen(false);
  };

  const openExportFolder = () => {
    setOpen(false);
    void window.novelTrans.portability
      .openExportDirectory({ projectId: project.id })
      .catch(() => {
        /* ignore — toast handled elsewhere if needed */
      });
  };

  return (
    <>
      <IconButton
        ref={anchorRef}
        label={t('projects.moreActions')}
        className="project-card-menu-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal size={18} aria-hidden />
      </IconButton>
      <DropdownMenu
        open={open}
        onOpenChange={setOpen}
        anchorRef={anchorRef}
        className="translation-menu project-actions-menu"
        placement="bottom-end"
        minWidth={220}
        maxHeight={400}
      >
        <button type="button" role="menuitem" onClick={() => { go(`/projects/${project.id}`); }}>
          {t('actions.bookInfo')}
        </button>
        <button type="button" role="menuitem" onClick={() => { go(`/projects/${project.id}/chapters`); }}>
          {t('actions.sourceFolder')}
        </button>
        <button type="button" role="menuitem" onClick={() => { go(`/projects/${project.id}/ai-memory`); }}>
          {t('projects.aiMemory')}
        </button>
        <button type="button" role="menuitem" onClick={() => { go(`/projects/${project.id}/data`); }}>
          {t('projectNav.data')}
        </button>
        <div className="translation-menu__sep" role="separator" />
        <button type="button" role="menuitem" onClick={openExportFolder}>
          {t('projects.changeExportLocation')}
        </button>
        <div className="translation-menu__sep" role="separator" />
        <button
          type="button"
          role="menuitem"
          className="project-actions-menu__danger"
          onClick={() => {
            setOpen(false);
            onDelete();
          }}
        >
          {t('projects.deleteProjectMenu')}
        </button>
      </DropdownMenu>
    </>
  );
}
