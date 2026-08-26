import fs from 'node:fs';
import JSZip from 'jszip';
import { XMLParser } from './xml-lite';

/**
 * Minimal EPUB text extraction via ZIP + OPF spine order.
 * Does not depend on browser epub.js.
 */
export async function parseEpubFile(filePath: string): Promise<{ text: string }> {
  const buffer = await fs.promises.readFile(filePath);
  return parseEpubBuffer(buffer);
}

export async function parseEpubBuffer(buffer: Buffer): Promise<{ text: string }> {
  const zip = await JSZip.loadAsync(buffer);
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) {
    throw new Error('Invalid EPUB: missing META-INF/container.xml');
  }

  const rootPath = extractAttribute(containerXml, 'rootfile', 'full-path');
  if (!rootPath) {
    throw new Error('Invalid EPUB: missing rootfile');
  }

  const opfXml = await zip.file(rootPath)?.async('string');
  if (!opfXml) {
    throw new Error(`Invalid EPUB: missing OPF ${rootPath}`);
  }

  const opfDir = rootPath.includes('/') ? rootPath.slice(0, rootPath.lastIndexOf('/') + 1) : '';
  const manifest = parseManifest(opfXml);
  const spineIds = parseSpine(opfXml);

  const parts: string[] = [];
  for (const id of spineIds) {
    const href = manifest.get(id);
    if (!href) continue;
    const full = opfDir + href;
    const entry = zip.file(full) ?? zip.file(decodeURIComponent(full));
    if (!entry) continue;
    const html = await entry.async('string');
    const text = htmlToText(html);
    if (text.trim()) {
      parts.push(text.trim());
    }
  }

  return { text: parts.join('\n\n') };
}

function parseManifest(opf: string): Map<string, string> {
  const map = new Map<string, string>();
  const itemRe = /<item\b([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(opf))) {
    const attrs = m[1];
    const id = /id=["']([^"']+)["']/i.exec(attrs)?.[1];
    const href = /href=["']([^"']+)["']/i.exec(attrs)?.[1];
    if (id && href) {
      map.set(id, href);
    }
  }
  return map;
}

function parseSpine(opf: string): string[] {
  const ids: string[] = [];
  const itemRefRe = /<itemref\b([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRefRe.exec(opf))) {
    const idref = /idref=["']([^"']+)["']/i.exec(m[1])?.[1];
    if (idref) ids.push(idref);
  }
  return ids;
}

function extractAttribute(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}\\b([^>]+)>`, 'i');
  const m = re.exec(xml);
  if (!m) return null;
  const attrRe = new RegExp(`${attr}=["']([^"']+)["']`, 'i');
  return attrRe.exec(m[1])?.[1] ?? null;
}

function htmlToText(html: string): string {
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = XMLParser.decodeEntities(s);
  return s;
}
