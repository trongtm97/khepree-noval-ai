import type { DriveClient, DriveFileRef } from './drive-client';

interface MockNode {
  id: string;
  name: string;
  type: 'folder' | 'file';
  parentId?: string;
  content?: string;
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

  findFolder(name: string, parentId?: string): Promise<DriveFileRef | null> {
    for (const node of this.nodes.values()) {
      if (
        node.type === 'folder' &&
        node.name === name &&
        (parentId === undefined ? node.parentId === undefined : node.parentId === parentId)
      ) {
        return Promise.resolve({ id: node.id, modifiedTime: node.modifiedTime });
      }
    }
    return Promise.resolve(null);
  }

  createFolder(name: string, parentId?: string): Promise<DriveFileRef> {
    const id = `folder-${this.seq++}`;
    const modifiedTime = new Date().toISOString();
    this.nodes.set(id, { id, name, type: 'folder', parentId, modifiedTime });
    return Promise.resolve({ id, modifiedTime });
  }

  createFile(name: string, content: string, parentId: string): Promise<DriveFileRef> {
    this.createFileCalls += 1;
    const id = `file-${this.seq++}`;
    const modifiedTime = new Date().toISOString();
    this.nodes.set(id, { id, name, type: 'file', parentId, content, modifiedTime });
    return Promise.resolve({ id, modifiedTime });
  }

  updateFileContent(fileId: string, content: string): Promise<DriveFileRef> {
    this.updateCalls += 1;
    const node = this.nodes.get(fileId);
    if (node?.type !== 'file') {
      return Promise.reject(new Error(`Mock file not found: ${fileId}`));
    }
    node.content = content;
    node.modifiedTime = new Date().toISOString();
    return Promise.resolve({ id: node.id, modifiedTime: node.modifiedTime });
  }
}
