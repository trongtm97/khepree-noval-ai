import { useCallback, useEffect, useState } from 'react';
import { Brain } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';

interface TranslationContextStatusProps {
  projectId: string;
  onOpenContext?: () => void;
}

interface MemoryState {
  memoryOk: boolean;
  notebookLinked: boolean;
}

/** Quiet status chip + beginner summary for knowledge / Notebook reuse. */
export function TranslationContextStatus({
  projectId,
  onOpenContext,
}: TranslationContextStatusProps) {
  const t = useT();
  const navigate = useNavigate();
  const [state, setState] = useState<MemoryState | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setState(null);
      return;
    }
    try {
      const [boot, health] = await Promise.all([
        window.khepreeNovelAI.notebook.getBootstrapStatus(projectId),
        window.khepreeNovelAI.notebook.health({ projectId }).catch(() => null),
      ]);

      const localReady =
        boot.characterCount > 0 ||
        boot.termCandidateCount > 0 ||
        boot.relationshipCount > 0 ||
        (boot.throughChapter ?? 0) > 0 ||
        boot.status === 'COMPLETED' ||
        boot.status === 'COMPLETED_WITH_WARNINGS' ||
        boot.status === 'READY';

      const healthAny = health as {
        notebookUrl?: string | null;
        translation?: { notebookUrl?: string | null; status?: string };
        status?: string;
      } | null;

      const notebookUrl =
        healthAny?.translation?.notebookUrl ?? healthAny?.notebookUrl ?? null;
      const linked =
        Boolean(notebookUrl) ||
        healthAny?.translation?.status === 'ready' ||
        healthAny?.status === 'ready';

      setState({
        memoryOk: localReady,
        notebookLinked: linked,
      });
    } catch {
      setState({
        memoryOk: false,
        notebookLinked: false,
      });
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!state) return null;

  const tooltip = state.memoryOk
    ? t('translation.memoryTooltipActive')
    : t('translation.memoryTooltipLocal');

  return (
    <div className="translation-status-summary">
      <button
        type="button"
        className={`translation-memory-badge translation-memory-badge--ghost ${state.memoryOk ? 'is-ok' : ''}`}
        title={tooltip}
        aria-label={tooltip}
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
          {state.memoryOk ? t('translation.memoryChipOkShort') : t('translation.memoryChipShort')}
        </span>
      </button>
      <div className="translation-status-summary__lines" aria-live="polite">
        <span className={`translation-status-summary__item ${state.memoryOk ? 'is-ok' : ''}`}>
          {state.memoryOk
            ? t('translation.statusKnowledgeReady')
            : t('translation.statusKnowledgePending')}
        </span>
        <span
          className={`translation-status-summary__item ${state.notebookLinked ? 'is-ok' : ''}`}
        >
          {state.notebookLinked
            ? t('translation.statusNotebookLinked')
            : t('translation.statusNotebookOptional')}
        </span>
      </div>
    </div>
  );
}
