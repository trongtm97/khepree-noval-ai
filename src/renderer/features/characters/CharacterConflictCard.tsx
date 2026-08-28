import { useState } from 'react';
import type { MemoryConflictDto } from '@shared/schemas/memory';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui';
import { useT } from '../../i18n';

interface CharacterConflictCardProps {
  conflict: MemoryConflictDto;
  entityLabel: string;
  fieldLabel: string;
  busy: boolean;
  onKeep: () => void;
  onUseNew: () => void;
}

export function CharacterConflictCard({
  conflict,
  entityLabel,
  fieldLabel,
  busy,
  onKeep,
  onUseNew,
}: CharacterConflictCardProps) {
  const t = useT();
  const [showTechnical, setShowTechnical] = useState(false);

  return (
    <div className="card conflict-card">
      <p className="conflict-card__lead">
        {t('characters.conflictLead', { entity: entityLabel, field: fieldLabel })}
      </p>
      <div className="conflict-card__values">
        <div>
          <span className="muted">{t('characters.conflictCurrent')}</span>
          <p>{conflict.existingValue ?? '—'}</p>
        </div>
        <div>
          <span className="muted">{t('characters.conflictNew')}</span>
          <p>{conflict.proposedValue ?? '—'}</p>
        </div>
      </div>
      <div className="btn-row">
        <Button size="sm" variant="secondary" disabled={busy} onClick={onKeep}>
          {t('characters.conflictKeepCurrent')}
        </Button>
        <Button size="sm" variant="primary" disabled={busy} onClick={onUseNew}>
          {t('characters.conflictUseNew')}
        </Button>
      </div>
      <button
        type="button"
        className="conflict-card__tech-toggle"
        onClick={() => setShowTechnical((v) => !v)}
      >
        {showTechnical ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {t('characters.conflictDetails')}
      </button>
      {showTechnical ? (
        <p className="muted u-mono conflict-card__tech">
          {conflict.entityType} · {conflict.fieldKey} · {conflict.deltaSource}
        </p>
      ) : null}
    </div>
  );
}

export function conflictFieldLabel(fieldKey: string, t: (key: string) => string): string {
  switch (fieldKey) {
    case 'canonicalName':
    case 'canonicalSourceName':
      return t('characters.sourceName');
    case 'translatedName':
    case 'preferredTargetName':
      return t('characters.targetName');
    case 'role':
      return t('characters.role');
    case 'description':
      return t('characters.description');
    default:
      return fieldKey;
  }
}

export function conflictEntityLabel(entityType: string, t: (key: string) => string): string {
  switch (entityType.toUpperCase()) {
    case 'CHARACTER':
      return t('characters.entityCharacter');
    case 'RELATIONSHIP':
      return t('characters.entityRelationship');
    case 'STORY_STATE':
      return t('characters.tabStory');
    default:
      return entityType;
  }
}
