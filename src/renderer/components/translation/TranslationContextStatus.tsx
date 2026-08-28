import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';

interface TranslationContextStatusProps {
  projectId: string;
}

interface MemoryBadge {
  ok: boolean;
  tooltip: string;
}

/**
 * Translator-facing memory status — local SQLite only.
 * Chip only: "Bộ nhớ ✓". No pack-mode / version numbers.
 */
export function TranslationContextStatus({
  projectId,
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
        ok: localReady,
        tooltip: localReady
          ? t('translation.memoryTooltipActive')
          : t('translation.memoryTooltipLocal'),
      });
    } catch {
      setBadge({
        ok: false,
        tooltip: t('translation.memoryTooltipLocal'),
      });
    }
  }, [projectId, t]);

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
      {badge.ok ? t('translation.memoryChipOk') : t('translation.memoryChip')}
    </button>
  );
}
