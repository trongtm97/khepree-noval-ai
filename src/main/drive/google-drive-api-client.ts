import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { DriveClient, DriveFileRef } from './drive-client';
import { mapGoogleError } from './drive-client';

function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export class GoogleDriveApiClient implements DriveClient {
  constructor(private readonly auth: OAuth2Client) {}

  private drive() {
    return google.drive({ version: 'v3', auth: this.auth });
  }

  async findFolder(name: string, parentId?: string): Promise<DriveFileRef | null> {
    try {
      const parentClause = parentId ? ` and '${parentId}' in parents` : '';
      const q = `name='${escapeQuery(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`;
      const res = await this.drive().files.list({
        q,
        fields: 'files(id, modifiedTime)',
        pageSize: 1,
        spaces: 'drive',
      });
      const file = res.data.files?.[0];
      if (!file?.id) return null;
      return { id: file.id, modifiedTime: file.modifiedTime ?? null };
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
        fields: 'id, modifiedTime',
      });
      if (!res.data.id) throw new Error('Drive folder create returned no id');
      return { id: res.data.id, modifiedTime: res.data.modifiedTime ?? null };
    } catch (error) {
      mapGoogleError(error);
    }
  }

  async createFile(name: string, content: string, parentId: string): Promise<DriveFileRef> {
    try {
      const res = await this.drive().files.create({
        requestBody: { name, parents: [parentId] },
        media: { mimeType: 'text/markdown', body: content },
        fields: 'id, modifiedTime',
      });
      if (!res.data.id) throw new Error('Drive file create returned no id');
      return { id: res.data.id, modifiedTime: res.data.modifiedTime ?? null };
    } catch (error) {
      mapGoogleError(error);
    }
  }

  async updateFileContent(fileId: string, content: string): Promise<DriveFileRef> {
    try {
      const res = await this.drive().files.update({
        fileId,
        media: { mimeType: 'text/markdown', body: content },
        fields: 'id, modifiedTime',
      });
      if (!res.data.id) throw new Error('Drive file update returned no id');
      return { id: res.data.id, modifiedTime: res.data.modifiedTime ?? null };
    } catch (error) {
      mapGoogleError(error);
    }
  }
}
