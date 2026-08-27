import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NOTEBOOK_CHANNEL_READY } from '@shared/constants/notebook';
import { useT } from '../../i18n';

interface TranslationContextStatusProps {
  projectId: string;
  /** Live packMode from active job — technical tooltip only. */
  packMode?: 'slim' | 'hybrid' | 'fat' | null;
}

interface MemoryBadge {
  label: string;
  ok: boolean;
  tooltip: string;
}

/**
 * Translator-facing memory status.
 * Never shows SLIM/HYBRID/FAT in the badge — those stay in tooltip.
 */
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
          tooltip: [t('translation.memoryTooltipLocal'), packModeTip(packMode, t)]
            .filter(Boolean)
            .join(' · '),
        });
        return;
      }
      const healthRes = await window.novelTrans.notebook.health({
        projectId,
        accountId,
      });
      const single = 'translation' in healthRes ? healthRes.translation : healthRes;
      const status = single.status;
      const local = single.localVersion;
      const notebook = single.notebookVersion;
      const channelOk = NOTEBOOK_CHANNEL_READY.has(status);

      if (channelOk && notebook > 0 && local > 0 && notebook === local) {
        setBadge({
          label: t('translation.memoryNotebookOk'),
          ok: true,
          tooltip: [
            t('translation.memoryTooltipSynced', { version: String(notebook) }),
            packModeTip(packMode, t),
          ]
            .filter(Boolean)
            .join(' · '),
        });
        return;
      }
      if (channelOk && (notebook > 0 || local > 0)) {
        setBadge({
          label: t('translation.memoryNotebookMixed'),
          ok: false,
          tooltip: [
            t('translation.memoryTooltipMixed', {
              notebook: notebook > 0 ? String(notebook) : '—',
              local: local > 0 ? String(local) : '—',
            }),
            packModeTip(packMode, t),
          ]
            .filter(Boolean)
            .join(' · '),
        });
        return;
      }
      setBadge({
        label: t('translation.memoryLocal'),
        ok: local > 0,
        tooltip: [t('translation.memoryTooltipLocal'), packModeTip(packMode, t)]
          .filter(Boolean)
          .join(' · '),
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

function packModeTip(
  packMode: 'slim' | 'hybrid' | 'fat' | null | undefined,
  t: (key: string, vars?: Record<string, string>) => string,
): string {
  if (!packMode) return '';
  return t('translation.memoryPackTooltip', { mode: packMode.toUpperCase() });
}
