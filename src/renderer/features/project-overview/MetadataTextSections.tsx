import type { ProjectMetadataDto } from '@shared/schemas/book-metadata';
import { ReadTextBlock } from './MetadataReadView';
import { useT } from '../../i18n';

export function MetadataTextSections({ metadata }: { metadata: ProjectMetadataDto }) {
  const t = useT();

  return (
    <>
      <ReadTextBlock label={t('bookMetadata.description')} value={metadata.description} />
      <ReadTextBlock label={t('bookMetadata.introduction')} value={metadata.introduction} />
      <ReadTextBlock label={t('bookMetadata.officialSummary')} value={metadata.officialSummary} />
      <ReadTextBlock label={t('bookMetadata.notes')} value={metadata.notes} />
    </>
  );
}
