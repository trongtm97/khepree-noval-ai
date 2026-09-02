/** Build export path under project/global export dir → Data/ subfolder. */
export async function buildDataExportOutputPath(input: {
  projectId: string;
  editionId?: string | null;
  fileName: string;
}): Promise<{ ok: true; outputPath: string } | { ok: false; reason: 'missing' | 'inaccessible' }> {
  const resolved = await window.khepreeNovelAI.portability.resolveExportDirectory({
    projectId: input.projectId,
    editionId: input.editionId,
  });
  if (resolved.status === 'ok') {
    const sep = resolved.directory.includes('\\') ? '\\' : '/';
    const base = resolved.directory.replace(/[/\\]+$/, '');
    return { ok: true, outputPath: `${base}${sep}Data${sep}${input.fileName}` };
  }
  if (resolved.status === 'missing') {
    return { ok: false, reason: 'missing' };
  }
  return { ok: false, reason: 'inaccessible' };
}

export function defaultExportFileName(sectionId: string, projectId: string, format: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${sectionId}-${projectId.slice(0, 8)}-${stamp}.${format}`;
}
