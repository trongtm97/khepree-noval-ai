import type { DriveClient, DriveFileRef } from './drive-client';
import { GOOGLE_DOC_MIME_TYPE } from '@shared/constants/notebook-source-binding';

interface MockNode {
  id: string;
  name: string;
  type: 'folder' | 'file' | 'doc';
  parentId?: string;
  content?: string;
  mimeType?: string;
  modifiedTime: string;
}

export class MockDriveClient implements DriveClient {
  private readonly nodes = new Map<string, MockNode>();
  private seq = 1;

  constructor(seed?: MockNode[]) {
    for (const node of seed ?? []) {
      this.nodes.set(node.id, node);
    }
  }

  snapshot(): MockNode[] {
    return [...this.nodes.values()];
  }

  updateCalls = 0;
  createFileCalls = 0;
  createGoogleDocCalls = 0;
  updateGoogleDocCalls = 0;

  findFolder(name: string, parentId?: string): Promise<DriveFileRef | null> {
    for (const node of this.nodes.values()) {
      if (
        node.type === 'folder' &&
        node.name === name &&
        (parentId === undefined ? node.parentId === undefined : node.parentId === parentId)
      ) {
        return Promise.resolve({
          id: node.id,
          modifiedTime: node.modifiedTime,
          mimeType: 'application/vnd.google-apps.folder',
        });
      }
    }
    return Promise.resolve(null);
  }

  createFolder(name: string, parentId?: string): Promise<DriveFileRef> {
    const id = `folder-${this.seq++}`;
    const modifiedTime = new Date().toISOString();
    this.nodes.set(id, { id, name, type: 'folder', parentId, modifiedTime });
    return Promise.resolve({
      id,
      modifiedTime,
      mimeType: 'application/vnd.google-apps.folder',
    });
  }

  createFile(name: string, content: string, parentId: string): Promise<DriveFileRef> {
    this.createFileCalls += 1;
    const id = `file-${this.seq++}`;
    const modifiedTime = new Date().toISOString();
    this.nodes.set(id, {
      id,
      name,
      type: 'file',
      parentId,
      content,
      mimeType: 'text/markdown',
      modifiedTime,
    });
    return Promise.resolve({ id, modifiedTime, mimeType: 'text/markdown' });
  }

  updateFileContent(fileId: string, content: string): Promise<DriveFileRef> {
    this.updateCalls += 1;
    const node = this.nodes.get(fileId);
    if (node?.type !== 'file') {
      return Promise.reject(new Error(`Mock file not found: ${fileId}`));
    }
    node.content = content;
    node.modifiedTime = new Date().toISOString();
    return Promise.resolve({
      id: node.id,
      modifiedTime: node.modifiedTime,
      mimeType: node.mimeType ?? 'text/markdown',
    });
  }

  createGoogleDoc(name: string, content: string, parentId: string): Promise<DriveFileRef> {
    this.createGoogleDocCalls += 1;
    const id = `doc-${this.seq++}`;
    const modifiedTime = new Date().toISOString();
    this.nodes.set(id, {
      id,
      name,
      type: 'doc',
      parentId,
      content,
      mimeType: GOOGLE_DOC_MIME_TYPE,
      modifiedTime,
    });
    return Promise.resolve({
      id,
      modifiedTime,
      mimeType: GOOGLE_DOC_MIME_TYPE,
    });
  }

  updateGoogleDocContent(fileId: string, content: string): Promise<DriveFileRef> {
    this.updateGoogleDocCalls += 1;
    const node = this.nodes.get(fileId);
    if (node?.type !== 'doc') {
      return Promise.reject(new Error(`Mock Google Doc not found: ${fileId}`));
    }
    node.content = content;
    node.modifiedTime = new Date().toISOString();
    return Promise.resolve({
      id: node.id,
      modifiedTime: node.modifiedTime,
      mimeType: GOOGLE_DOC_MIME_TYPE,
    });
  }

  getFileMetadata(fileId: string): Promise<DriveFileRef | null> {
    const node = this.nodes.get(fileId);
    if (!node) return Promise.resolve(null);
    return Promise.resolve({
      id: node.id,
      modifiedTime: node.modifiedTime,
      mimeType: node.mimeType ?? null,
    });
  }

  getContent(fileId: string): string | undefined {
    return this.nodes.get(fileId)?.content;
  }
}
