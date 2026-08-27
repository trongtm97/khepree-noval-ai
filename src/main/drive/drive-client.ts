export interface DriveFileRef {
  id: string;
  modifiedTime: string | null;
  mimeType?: string | null;
}

export interface DriveClient {
  findFolder(name: string, parentId?: string): Promise<DriveFileRef | null>;
  createFolder(name: string, parentId?: string): Promise<DriveFileRef>;
  /** Create plain/markdown binary file (legacy / RESEARCH corpus). */
  createFile(name: string, content: string, parentId: string): Promise<DriveFileRef>;
  updateFileContent(fileId: string, content: string): Promise<DriveFileRef>;
  /** Import markdown/plain text as a Google Doc (preferred for Translation knowledge). */
  createGoogleDoc(name: string, content: string, parentId: string): Promise<DriveFileRef>;
  /** Replace Google Doc body text in place (same file id). */
  updateGoogleDocContent(fileId: string, content: string): Promise<DriveFileRef>;
  getFileMetadata(fileId: string): Promise<DriveFileRef | null>;
}

export class DriveAuthError extends Error {
  readonly code = 'DRIVE_AUTH_REQUIRED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'DriveAuthError';
  }
}

export function isDriveAuthError(error: unknown): error is DriveAuthError {
  return error instanceof DriveAuthError;
}

export function mapGoogleError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (
    lower.includes('invalid_grant') ||
    lower.includes('token has been expired or revoked') ||
    lower.includes('invalid credentials')
  ) {
    throw new DriveAuthError(message);
  }
  throw error instanceof Error ? error : new Error(message);
}
