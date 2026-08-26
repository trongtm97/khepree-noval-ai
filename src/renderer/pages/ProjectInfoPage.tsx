import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ProjectMetadataDto } from '@shared/schemas/book-metadata';
import { GENRE_PRESETS } from '@shared/constants/book-metadata';
import { Button, Input, Select } from '../components/ui';
import { useT } from '../i18n';
import { HelpContextButton } from '../features/help/HelpContextButton';

export function ProjectInfoPage() {
  const t = useT();
  const navigate = useNavigate();
  const { projectId = '' } = useParams();
  const [metadata, setMetadata] = useState<ProjectMetadataDto | null>(null);
  const [documents, setDocuments] = useState<
    { id: string; documentType: string; sourceFileName: string | null }[]
  >([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    void Promise.all([
      window.novelTrans.bookMetadata.get(projectId),
      window.novelTrans.bookMetadata.listDocuments(projectId),
    ])
      .then(([metaRes, docsRes]) => {
        setMetadata(metaRes.metadata);
        setDocuments(docsRes.documents);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
      });
  }, [projectId, t]);

  const save = async () => {
    if (!metadata || !projectId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await window.novelTrans.bookMetadata.update({ projectId, metadata });
      setMetadata(res.metadata);
      setEditing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  };

  const syncNotebook = async () => {
    if (!projectId) return;
    setBusy(true);
    try {
      await window.novelTrans.bookMetadata.syncProfile(projectId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    } finally {
      setBusy(false);
    }
  };

  if (!metadata) {
    return <div className="page">{error ?? t('common.loading')}</div>;
  }

  const field = (
    label: string,
    key: keyof ProjectMetadataDto,
    multiline = false,
  ) => (
    <label>
      {label}
      {multiline ? (
        <textarea
          className="input"
          rows={4}
          disabled={!editing}
          value={(metadata[key] as string | null) ?? ''}
          onChange={(e) => {
            setMetadata({ ...metadata, [key]: e.target.value || null });
          }}
        />
      ) : (
        <Input
          disabled={!editing}
          value={(metadata[key] as string | null) ?? ''}
          onChange={(e) => {
            setMetadata({ ...metadata, [key]: e.target.value || null });
          }}
        />
      )}
    </label>
  );

  return (
    <div className="page">
      <div className="page-header-row">
        <h1>{t('bookMetadata.pageTitle')}</h1>
        <div className="btn-row">
          <HelpContextButton articleId="project-info" />
          <Button onClick={() => { navigate(`/projects/${projectId}/source`); }}>
            {t('bookMetadata.viewSource')}
          </Button>
          {!editing ? (
            <Button variant="primary" onClick={() => { setEditing(true); }}>
              {t('actions.edit')}
            </Button>
          ) : (
            <>
              <Button variant="primary" disabled={busy} onClick={() => { void save(); }}>
                {t('actions.save')}
              </Button>
              <Button onClick={() => { setEditing(false); }}>
                {t('actions.cancel')}
              </Button>
            </>
          )}
          <Button disabled={busy} onClick={() => { void syncNotebook(); }}>
            {t('bookMetadata.syncNotebook')}
          </Button>
        </div>
      </div>

      {error ? <p className="banner banner-error">{error}</p> : null}

      <div className="card form-stack">
        {field(t('bookMetadata.title'), 'title')}
        {field(t('bookMetadata.titleCn'), 'titleCn')}
        {field(t('bookMetadata.titleVi'), 'titleVi')}
        {field(t('bookMetadata.author'), 'authorName')}
        <label>
          {t('bookMetadata.genre')}
          <Select
            disabled={!editing}
            value={metadata.genre ?? ''}
            onChange={(e) => {
              setMetadata({ ...metadata, genre: e.target.value || null });
            }}
          >
            <option value="">{t('bookMetadata.genreUnset')}</option>
            {GENRE_PRESETS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </Select>
        </label>
        {field(t('bookMetadata.publicationStatus'), 'publicationStatus')}
        <label>
          {t('bookMetadata.expectedChapters')}
          <Input
            type="number"
            disabled={!editing}
            value={metadata.expectedChapterCount ?? ''}
            onChange={(e) => {
              const val = e.target.value ? Number.parseInt(e.target.value, 10) : null;
              setMetadata({ ...metadata, expectedChapterCount: val });
            }}
          />
        </label>
        {field(t('bookMetadata.description'), 'description', true)}
        {field(t('bookMetadata.introduction'), 'introduction', true)}
        {field(t('bookMetadata.officialSummary'), 'officialSummary', true)}
        {field(t('bookMetadata.notes'), 'notes', true)}
      </div>

      {documents.length > 0 ? (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3>{t('bookMetadata.documents')}</h3>
          <table className="import-chapter-table">
            <thead>
              <tr>
                <th>{t('bookMetadata.docType')}</th>
                <th>{t('createProjectWizard.colFile')}</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.documentType}</td>
                  <td>{doc.sourceFileName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
