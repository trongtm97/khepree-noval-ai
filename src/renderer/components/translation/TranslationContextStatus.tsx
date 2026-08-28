import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';

interface TranslationContextStatusProps {
  projectId: string;
  /** Live packMode from active job — technical tooltip only. */
  packMode?: 'local_context' | 'notebook_assisted' | null;
}

interface MemoryBadge {
  label: string;
  ok: boolean;
  tooltip: string;
}

/**
 * Translator-facing memory status — local SQLite only (Phase 5).
 * Research Notebook is optional and never blocks translation.
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
      const boot = await window.novelTrans.notebook.getBootstrapStatus(projectId);
      const localReady =
        boot.characterCount > 0 ||
        boot.termCandidateCount > 0 ||
        boot.relationshipCount > 0 ||
        (boot.throughChapter ?? 0) > 0 ||
        boot.status === 'COMPLETED' ||
        boot.status === 'COMPLETED_WITH_WARNINGS' ||
        boot.status === 'READY';

      setBadge({
        label: t('translation.memoryLocal'),
        ok: localReady,
        tooltip: [
          localReady
            ? t('translation.memoryTooltipLocalReady')
            : t('translation.memoryTooltipLocal'),
          packModeTip(packMode, t),
        ]
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
  packMode: 'local_context' | 'notebook_assisted' | null | undefined,
  t: (key: string, vars?: Record<string, string>) => string,
): string {
  if (!packMode) return '';
  const label =
    packMode === 'notebook_assisted' ? 'NOTEBOOK_ASSISTED' : 'LOCAL_CONTEXT';
  return t('translation.memoryPackTooltip', { mode: label });
}
