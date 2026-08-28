import type { TabularDataType } from '@shared/constants/tabular';
import type { TabularDataTypeHandler } from './types';
import { termsTabularHandler } from './handlers/terms-handler';
import { charactersTabularHandler } from './handlers/characters-handler';
import { translationsTabularHandler } from './handlers/translations-handler';
import { projectDataTabularHandler } from './handlers/project-data-handler';
import { sourceWorkbookTabularHandler } from './handlers/source-workbook-tabular-handler';
import {
  operationalActivityHandler,
  operationalConflictsHandler,
  operationalJobsHandler,
  operationalQaHandler,
  operationalWorkbookHandler,
} from './handlers/operational-handlers';

const handlers = new Map<TabularDataType, TabularDataTypeHandler>([
  ['terms', termsTabularHandler],
  ['characters', charactersTabularHandler],
  ['translations', translationsTabularHandler],
  ['project_data', projectDataTabularHandler],
  ['source_workbook', sourceWorkbookTabularHandler],
  ['operational_jobs', operationalJobsHandler],
  ['operational_qa', operationalQaHandler],
  ['operational_activity', operationalActivityHandler],
  ['operational_conflicts', operationalConflictsHandler],
  ['operational_workbook', operationalWorkbookHandler],
]);

export class TabularSchemaRegistry {
  getHandler(dataType: TabularDataType): TabularDataTypeHandler {
    const handler = handlers.get(dataType);
    if (!handler) throw new Error(`No tabular handler for data type: ${dataType}`);
    return handler;
  }

  listDataTypes(): TabularDataType[] {
    return [...handlers.keys()];
  }

  detectDataType(
    headers: string[],
    metaDataType?: TabularDataType,
  ): TabularDataType | null {
    if (metaDataType && handlers.has(metaDataType)) return metaDataType;
    for (const handler of handlers.values()) {
      if (handler.detectFromHeaders(headers)) return handler.dataType;
    }
    return null;
  }
}

export const tabularSchemaRegistry = new TabularSchemaRegistry();
