import { useCallback, useEffect, useState } from 'react';
import { Brain } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';

interface TranslationContextStatusProps {
  projectId: string;
  onOpenContext?: () => void;
}

interface MemoryBadge {
  ok: boolean;
  tooltip: string;
}

/** Quiet ghost chip — opens context panel or memory summary. */
export function TranslationContextStatus({
  projectId,
  onOpenContext,
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
      const boot = await window.khepreeNovelAI.notebook.getBootstrapStatus(projectId);
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
      className={`translation-memory-badge translation-memory-badge--ghost ${badge.ok ? 'is-ok' : ''}`}
      title={badge.tooltip}
      aria-label={badge.tooltip}
      onClick={() => {
        if (onOpenContext) {
          onOpenContext();
          return;
        }
        navigate(`/projects/${projectId}/ai-memory`);
      }}
    >
      <Brain size={14} aria-hidden className="translation-memory-badge__icon" />
      <span className="translation-memory-badge__label">
        {badge.ok ? t('translation.memoryChipOkShort') : t('translation.memoryChipShort')}
      </span>
    </button>
  );
}
