import { useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useT } from '../../i18n';
import { HelpContextButton } from '../../features/help/HelpContextButton';
import { DropdownMenu } from '../overlay';
import { Button, IconButton } from '../ui';

export interface SectionAction {
  id: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Custom node (e.g. dialog trigger). Takes precedence over label/onClick. */
  element?: ReactNode;
}

export interface ProjectSectionHeaderProps {
  title: string;
  description?: string;
  helpArticleId?: string;
  primaryAction?: SectionAction | ReactNode;
  secondaryAction?: SectionAction | ReactNode;
  overflowActions?: SectionAction[];
}

function isSectionAction(value: SectionAction | ReactNode): value is SectionAction {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

function renderSectionAction(action: SectionAction) {
  if (action.element) {
    return <span key={action.id}>{action.element}</span>;
  }
  return (
    <Button
      key={action.id}
      variant={action.variant ?? 'secondary'}
      disabled={action.disabled}
      onClick={action.onClick}
    >
      {action.label}
    </Button>
  );
}

export function ProjectSectionHeader({
  title,
  description,
  helpArticleId,
  primaryAction,
  secondaryAction,
  overflowActions = [],
}: ProjectSectionHeaderProps) {
  const t = useT();
  const overflowRef = useRef<HTMLButtonElement>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);

  return (
    <div className="project-section-header">
      <div className="project-section-header__text">
        <div className="project-section-header__title-row">
          <span className="project-section-header__title">{title}</span>
          {helpArticleId ? <HelpContextButton articleId={helpArticleId} /> : null}
        </div>
        {description ? (
          <p className="project-section-header__desc muted">{description}</p>
        ) : null}
      </div>

      {primaryAction || secondaryAction || overflowActions.length > 0 ? (
        <div className="project-section-header__actions">
          {primaryAction
            ? isSectionAction(primaryAction)
              ? renderSectionAction(primaryAction)
              : primaryAction
            : null}
          {secondaryAction
            ? isSectionAction(secondaryAction)
              ? renderSectionAction(secondaryAction)
              : secondaryAction
            : null}
          {overflowActions.length > 0 ? (
            <>
              <IconButton
                ref={overflowRef}
                label={t('common.moreActions')}
                aria-expanded={overflowOpen}
                onClick={() => {
                  setOverflowOpen((open) => !open);
                }}
              >
                <MoreHorizontal size={18} aria-hidden />
              </IconButton>
              <DropdownMenu
                open={overflowOpen}
                onOpenChange={setOverflowOpen}
                anchorRef={overflowRef}
                className="translation-menu project-section-overflow"
                placement="bottom-end"
                minWidth={200}
              >
                {overflowActions.map((action) =>
                  action.element ? (
                    <div key={action.id} className="project-section-overflow__custom">
                      {action.element}
                    </div>
                  ) : (
                    <button
                      key={action.id}
                      type="button"
                      role="menuitem"
                      disabled={action.disabled}
                      onClick={() => {
                        setOverflowOpen(false);
                        action.onClick?.();
                      }}
                    >
                      {action.label}
                    </button>
                  ),
                )}
              </DropdownMenu>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
