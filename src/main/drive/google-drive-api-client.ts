import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { DriveClient, DriveFileRef } from './drive-client';
import { mapGoogleError } from './drive-client';
import { GOOGLE_DOC_MIME_TYPE } from '@shared/constants/notebook-source-binding';

function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export class GoogleDriveApiClient implements DriveClient {
  constructor(private readonly auth: OAuth2Client) {}

  private drive() {
    return google.drive({ version: 'v3', auth: this.auth });
  }

  private docs() {
    return google.docs({ version: 'v1', auth: this.auth });
  }

  async findFolder(name: string, parentId?: string): Promise<DriveFileRef | null> {
    try {
      const parentClause = parentId ? ` and '${parentId}' in parents` : '';
      const q = `name='${escapeQuery(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`;
      const res = await this.drive().files.list({
        q,
        fields: 'files(id, modifiedTime, mimeType)',
        pageSize: 1,
        spaces: 'drive',
      });
      const file = res.data.files?.[0];
      if (!file?.id) return null;
      return {
        id: file.id,
        modifiedTime: file.modifiedTime ?? null,
        mimeType: file.mimeType ?? null,
      };
    } catch (error) {
      mapGoogleError(error);
    }
  }

  async createFolder(name: string, parentId?: string): Promise<DriveFileRef> {
    try {
      const res = await this.drive().files.create({
        requestBody: {
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: parentId ? [parentId] : undefined,
        },
        fields: 'id, modifiedTime, mimeType',
      });
      if (!res.data.id) throw new Error('Drive folder create returned no id');
      return {
        id: res.data.id,
        modifiedTime: res.data.modifiedTime ?? null,
        mimeType: res.data.mimeType ?? null,
      };
    } catch (error) {
      mapGoogleError(error);
    }
  }

  async createFile(name: string, content: string, parentId: string): Promise<DriveFileRef> {
    try {
      const res = await this.drive().files.create({
        requestBody: { name, parents: [parentId] },
        media: { mimeType: 'text/markdown', body: content },
        fields: 'id, modifiedTime, mimeType',
      });
      if (!res.data.id) throw new Error('Drive file create returned no id');
      return {
        id: res.data.id,
        modifiedTime: res.data.modifiedTime ?? null,
        mimeType: res.data.mimeType ?? 'text/markdown',
      };
    } catch (error) {
      mapGoogleError(error);
    }
  }

  async updateFileContent(fileId: string, content: string): Promise<DriveFileRef> {
    try {
      const res = await this.drive().files.update({
        fileId,
        media: { mimeType: 'text/markdown', body: content },
        fields: 'id, modifiedTime, mimeType',
      });
      if (!res.data.id) throw new Error('Drive file update returned no id');
      return {
        id: res.data.id,
        modifiedTime: res.data.modifiedTime ?? null,
        mimeType: res.data.mimeType ?? null,
      };
    } catch (error) {
      mapGoogleError(error);
    }
  }

  async createGoogleDoc(
    name: string,
    content: string,
    parentId: string,
  ): Promise<DriveFileRef> {
    try {
      const res = await this.drive().files.create({
        requestBody: {
          name,
          mimeType: GOOGLE_DOC_MIME_TYPE,
          parents: [parentId],
        },
        media: { mimeType: 'text/markdown', body: content },
        fields: 'id, modifiedTime, mimeType',
      });
      if (!res.data.id) throw new Error('Drive Google Doc create returned no id');
      return {
        id: res.data.id,
        modifiedTime: res.data.modifiedTime ?? null,
        mimeType: res.data.mimeType ?? GOOGLE_DOC_MIME_TYPE,
      };
    } catch (error) {
      mapGoogleError(error);
    }
  }

  async updateGoogleDocContent(fileId: string, content: string): Promise<DriveFileRef> {
    try {
      const docs = this.docs();
      const doc = await docs.documents.get({ documentId: fileId });
      const endIndex =
        doc.data.body?.content?.[doc.data.body.content.length - 1]?.endIndex ?? 1;

      const requests: Record<string, unknown>[] = [];
      if (endIndex > 2) {
        requests.push({
          deleteContentRange: {
            range: { startIndex: 1, endIndex: endIndex - 1 },
          },
        });
      }
      if (content.length > 0) {
        requests.push({
          insertText: {
            location: { index: 1 },
            text: content,
          },
        });
      }

      if (requests.length > 0) {
        await docs.documents.batchUpdate({
          documentId: fileId,
          requestBody: { requests },
        });
      }

      const meta = await this.getFileMetadata(fileId);
      return (
        meta ?? {
          id: fileId,
          modifiedTime: new Date().toISOString(),
          mimeType: GOOGLE_DOC_MIME_TYPE,
        }
      );
    } catch (error) {
      mapGoogleError(error);
    }
  }

  async getFileMetadata(fileId: string): Promise<DriveFileRef | null> {
    try {
      const res = await this.drive().files.get({
        fileId,
        fields: 'id, modifiedTime, mimeType',
      });
      if (!res.data.id) return null;
      return {
        id: res.data.id,
        modifiedTime: res.data.modifiedTime ?? null,
        mimeType: res.data.mimeType ?? null,
      };
    } catch (error) {
      mapGoogleError(error);
    }
  }
}
