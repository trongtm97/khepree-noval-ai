import { useEffect, useState } from 'react';
import type { ProjectMetadataDto } from '@shared/schemas/book-metadata';
import { GENRE_PRESETS } from '@shared/constants/book-metadata';
import { Button, Drawer, Input, Select } from '../../components/ui';
import { useT } from '../../i18n';

interface ProjectMetadataEditDrawerProps {
  open: boolean;
  metadata: ProjectMetadataDto;
  busy: boolean;
  onClose: () => void;
  onSave: (metadata: ProjectMetadataDto) => void;
}

export function ProjectMetadataEditDrawer({
  open,
  metadata,
  busy,
  onClose,
  onSave,
}: ProjectMetadataEditDrawerProps) {
  const t = useT();
  const [draft, setDraft] = useState(metadata);

  useEffect(() => {
    if (open) setDraft(metadata);
  }, [open, metadata]);

  const field = (
    label: string,
    key: keyof ProjectMetadataDto,
    multiline = false,
  ) => (
    <label className="form-field">
      <span className="form-field__label">{label}</span>
      {multiline ? (
        <textarea
          className="nt-textarea"
          rows={4}
          value={(draft[key] as string | null) ?? ''}
          onChange={(e) => {
            setDraft({ ...draft, [key]: e.target.value || null });
          }}
        />
      ) : (
        <Input
          value={(draft[key] as string | null) ?? ''}
          onChange={(e) => {
            setDraft({ ...draft, [key]: e.target.value || null });
          }}
        />
      )}
    </label>
  );

  return (
    <Drawer open={open} title={t('bookMetadata.editTitle')} onClose={onClose}>
      <div className="form-stack">
        {field(t('bookMetadata.title'), 'title')}
        {field(t('bookMetadata.sourceTitle'), 'sourceTitle')}
        {field(t('bookMetadata.targetTitle'), 'targetTitle')}
        {field(t('bookMetadata.author'), 'authorName')}
        <label className="form-field">
          <span className="form-field__label">{t('bookMetadata.genre')}</span>
          <Select
            value={draft.genre ?? ''}
            onChange={(e) => {
              setDraft({ ...draft, genre: e.target.value || null });
            }}
          >
            <option value="">{t('bookMetadata.genreUnset')}</option>
            {GENRE_PRESETS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </Select>
        </label>
        {field(t('bookMetadata.publicationStatus'), 'publicationStatus')}
        <label className="form-field">
          <span className="form-field__label">{t('bookMetadata.expectedChapters')}</span>
          <Input
            type="number"
            value={draft.expectedChapterCount ?? ''}
            onChange={(e) => {
              const val = e.target.value ? Number.parseInt(e.target.value, 10) : null;
              setDraft({ ...draft, expectedChapterCount: val });
            }}
          />
        </label>
        {field(t('bookMetadata.description'), 'description', true)}
        {field(t('bookMetadata.introduction'), 'introduction', true)}
        {field(t('bookMetadata.officialSummary'), 'officialSummary', true)}
        {field(t('bookMetadata.notes'), 'notes', true)}
      </div>
      <div className="btn-row" style={{ marginTop: '1rem' }}>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            onSave(draft);
          }}
        >
          {t('actions.save')}
        </Button>
        <Button disabled={busy} onClick={onClose}>
          {t('actions.cancel')}
        </Button>
      </div>
    </Drawer>
  );
}
