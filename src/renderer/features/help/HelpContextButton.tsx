import { HelpCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { IconButton } from '../../components/ui';
import { useT } from '../../i18n';

interface HelpContextButtonProps {
  articleId: string;
}

export function HelpContextButton({ articleId }: HelpContextButtonProps) {
  const t = useT();
  const navigate = useNavigate();

  return (
    <IconButton
      label={t('help.openContext')}
      onClick={() => {
        navigate(`/help/${articleId}`);
      }}
    >
      <HelpCircle size={18} />
    </IconButton>
  );
}

export function HelpLearnMoreButton({ articleId }: { articleId: string }) {
  const t = useT();
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="help-learn-more-btn"
      onClick={() => {
        navigate(`/help/${articleId}`);
      }}
    >
      {t('help.learnMore')}
    </button>
  );
}
