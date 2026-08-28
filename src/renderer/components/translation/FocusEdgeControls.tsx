import { Brain, PanelLeft } from 'lucide-react';
import { useT } from '../../i18n';
import { IconButton } from '../ui';

interface FocusEdgeControlsProps {
  onToggleChapterRail: () => void;
  onToggleContext: () => void;
}

export function FocusEdgeControls({
  onToggleChapterRail,
  onToggleContext,
}: FocusEdgeControlsProps) {
  const t = useT();

  return (
    <>
      <IconButton
        className="translation-focus-edge translation-focus-edge--left"
        label={t('translation.expandChapterRail')}
        onClick={onToggleChapterRail}
      >
        <PanelLeft size={16} aria-hidden />
      </IconButton>
      <IconButton
        className="translation-focus-edge translation-focus-edge--right"
        label={t('translation.showContext')}
        onClick={onToggleContext}
      >
        <Brain size={16} aria-hidden />
      </IconButton>
    </>
  );
}
