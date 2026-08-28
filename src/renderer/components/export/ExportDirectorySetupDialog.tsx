import { useCallback, useState } from 'react';
import type { ExportDirectoryScope } from '@shared/constants/export-settings';
import { Button } from '../ui';
import { useT } from '../../i18n';

export interface ExportDirectorySetupDialogProps {
  open: boolean;
  directory: string;
  projectTitle: string;
  defaultScope?: ExportDirectoryScope;
  onConfirm: (scope: ExportDirectoryScope) => void;
  onCancel: () => void;
}

/** First-export prompt: save picked folder for project or as global default. */
export function ExportDirectorySetupDialog({
  open,
  directory,
  projectTitle,
  defaultScope = 'project',
  onConfirm,
  onCancel,
}: ExportDirectorySetupDialogProps) {
  const t = useT();
  const [scope, setScope] = useState<ExportDirectoryScope>(defaultScope);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dir-setup-title"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2 id="export-dir-setup-title">{t('exportDirectory.setupTitle')}</h2>
        <p className="muted">{t('exportDirectory.setupBody')}</p>
        <p className="export-directory-path">{directory}</p>
        <fieldset className="export-directory-scope">
          <label>
            <input
              type="radio"
              name="export-scope"
              checked={scope === 'project'}
              onChange={() => {
                setScope('project');
              }}
            />
            {t('exportDirectory.scopeProject', { project: projectTitle })}
          </label>
          <label>
            <input
              type="radio"
              name="export-scope"
              checked={scope === 'global'}
              onChange={() => {
                setScope('global');
              }}
            />
            {t('exportDirectory.scopeGlobal')}
          </label>
        </fieldset>
        <div className="btn-row">
          <Button variant="secondary" onClick={onCancel}>
            {t('actions.cancel')}
          </Button>
          <Button
            onClick={() => {
              onConfirm(scope);
            }}
          >
            {t('exportDirectory.continue')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function useExportDirectoryPersistPrompt() {
  const [pending, setPending] = useState<{
    directory: string;
    projectTitle: string;
    defaultScope: ExportDirectoryScope;
    resolve: (scope: ExportDirectoryScope | null) => void;
  } | null>(null);

  const prompt = useCallback(
    (input: {
      directory: string;
      projectTitle: string;
      defaultScope: ExportDirectoryScope;
    }) =>
      new Promise<ExportDirectoryScope | null>((resolve) => {
        setPending({ ...input, resolve });
      }),
    [],
  );

  const dialog = pending ? (
    <ExportDirectorySetupDialog
      open
      directory={pending.directory}
      projectTitle={pending.projectTitle}
      defaultScope={pending.defaultScope}
      onConfirm={(scope) => {
        pending.resolve(scope);
        setPending(null);
      }}
      onCancel={() => {
        pending.resolve(null);
        setPending(null);
      }}
    />
  ) : null;

  return { prompt, dialog };
}
