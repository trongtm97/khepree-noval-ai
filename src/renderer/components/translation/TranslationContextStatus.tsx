import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NOTEBOOK_CHANNEL_READY } from '@shared/constants/notebook';
import { useT } from '../../i18n';

interface TranslationContextStatusProps {
  projectId: string;
  /** Live packMode from active job — tooltip only. */
  packMode?: 'slim' | 'hybrid' | 'fat' | null;
}

type MemoryBadge = {
  label: string;
  ok: boolean;
  tooltip: string;
};

export function TranslationContextStatus({
  projectId,
  packMode,
}: TranslationContextStatusProps) {
  const t = useT();
  const navigate = useNavigate();
  const [badge, setBadge] = useState<MemoryBadge | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setBadge(null);
      return;
    }
    try {
      const resolved = await window.novelTrans.projects.resolveWorker({
        projectId,
        purpose: 'translation',
      });
      const accountId = resolved.accountId;
      if (!accountId) {
        setBadge({
          label: t('translation.memoryLocal'),
          ok: false,
          tooltip: t('translation.memoryTooltipLocal'),
        });
        return;
      }
      const healthRes = await window.novelTrans.notebook.health({
        projectId,
        accountId,
      });
      const single = 'translation' in healthRes ? healthRes.translation : healthRes;
      const status = single.status;
      const local = single.localVersion ?? 0;
      const notebook = single.notebookVersion ?? 0;
      const channelOk = NOTEBOOK_CHANNEL_READY.has(status);
      const packTip = packMode
        ? t('translation.memoryPackTooltip', { mode: packMode.toUpperCase() })
        : '';

      if (channelOk && notebook > 0 && local > 0 && notebook === local) {
        setBadge({
          label: t('translation.memoryNotebookOk', { version: String(notebook) }),
          ok: true,
          tooltip: [t('translation.memoryTooltipSynced'), packTip].filter(Boolean).join(' · '),
        });
        return;
      }
      if (channelOk && (notebook > 0 || local > 0)) {
        setBadge({
          label: t('translation.memoryNotebookMixed', {
            notebook: notebook > 0 ? String(notebook) : '—',
            local: local > 0 ? String(local) : '—',
          }),
          ok: false,
          tooltip: [t('translation.memoryTooltipMixed'), packTip].filter(Boolean).join(' · '),
        });
        return;
      }
      setBadge({
        label: t('translation.memoryLocal'),
        ok: local > 0,
        tooltip: [t('translation.memoryTooltipLocal'), packTip].filter(Boolean).join(' · '),
      });
    } catch {
      setBadge({
        label: t('translation.memoryLocal'),
        ok: false,
        tooltip: t('translation.memoryTooltipLocal'),
      });
    }
  }, [projectId, packMode, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!badge) return null;

  return (
    <button
      type="button"
      className={`translation-memory-badge ${badge.ok ? 'is-ok' : ''}`}
      title={badge.tooltip}
      onClick={() => {
        navigate(`/projects/${projectId}/ai-memory`);
      }}
    >
      <span className="translation-memory-badge__label">{t('translation.memoryLabel')}</span>
      <span>{badge.label}</span>
    </button>
  );
}
