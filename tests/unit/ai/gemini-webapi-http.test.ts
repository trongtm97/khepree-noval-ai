import http from 'node:http';
import { describe, expect, it, afterEach } from 'vitest';
import { mapWorkerStatus } from '@main/ai/error-map';

/**
 * Lightweight integration: mock HTTP worker ↔ chat response mapping.
 * Full Electron+Python spawn covered manually / e2e later.
 */
describe('Gemini Web API mock worker HTTP', () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    const active = server;
    if (!active) return;
    await new Promise<void>((resolve) => {
      active.close(() => {
        resolve();
      });
    });
    server = null;
  });

  it('maps SUCCESS chat payload', async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/gemini/chat' && req.method === 'POST') {
        let body = '';
        req.on('data', (c: Buffer | string) => {
          body += typeof c === 'string' ? c : c.toString('utf8');
        });
        req.on('end', () => {
          const parsed = JSON.parse(body) as { request_id: string };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              request_id: parsed.request_id,
              status: 'SUCCESS',
              text: '<TRANSLATION>ok</TRANSLATION>',
              error: null,
            }),
          );
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const active = server;
    await new Promise<void>((resolve) => {
      active.listen(0, '127.0.0.1', () => {
        resolve();
      });
    });
    const addr = active.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');

    const res = await fetch(`http://127.0.0.1:${addr.port}/gemini/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: 'r1',
        account_id: 'a1',
        prompt: 'hi',
      }),
    });
    const data = (await res.json()) as { status: string; text: string };
    expect(mapWorkerStatus(data.status)).toBe('SUCCESS');
    expect(data.text).toContain('TRANSLATION');
  });

  it('maps SESSION_EXPIRED', async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          request_id: 'r2',
          status: 'SESSION_EXPIRED',
          text: '',
          error: 'cookie expired',
        }),
      );
    });
    const active = server;
    await new Promise<void>((resolve) => {
      active.listen(0, '127.0.0.1', () => {
        resolve();
      });
    });
    const addr = active.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    const res = await fetch(`http://127.0.0.1:${addr.port}/x`, { method: 'POST' });
    const data = (await res.json()) as { status: string };
    expect(mapWorkerStatus(data.status)).toBe('SESSION_EXPIRED');
  });
});
