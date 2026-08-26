import { BrowserSession } from '../browser-session';
import {
  parseAutomationCommand,
  type RunnerOutboundMessage,
} from '../protocol';
import path from 'node:path';
import os from 'node:os';

/**
 * Child-process entry for browser automation.
 * Speaks JSON lines on stdin/stdout. No Gemini logic.
 */
function main(): void {
  const diagnosticsDir =
    process.env.NOVELTRANS_AUTOMATION_DIAGNOSTICS_DIR ??
    path.join(os.tmpdir(), 'noveltrans-automation');

  const session = new BrowserSession({ diagnosticsDir });

  const send = (message: RunnerOutboundMessage): void => {
    process.stdout.write(`${JSON.stringify(message)}\n`);
  };

  send({
    kind: 'event',
    event: 'runner_ready',
    payload: { pid: process.pid },
  });

  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
      if (!line) continue;
      void handleLine(line, session, send);
    }
  });

  process.stdin.on('end', () => {
    void session.execute({ id: 'stdin-end', type: 'CLOSE' }).finally(() => {
      process.exit(0);
    });
  });
}

async function handleLine(
  line: string,
  session: BrowserSession,
  send: (message: RunnerOutboundMessage) => void,
): Promise<void> {
  try {
    const command = parseAutomationCommand(JSON.parse(line) as unknown);
    const result = await session.execute(command);
    send({ kind: 'result', result });
  } catch (error) {
    send({
      kind: 'log',
      level: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
    send({
      kind: 'result',
      result: {
        id: 'unknown',
        ok: false,
        state: 'ERROR',
        errorCode: 'UNKNOWN_UI',
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

main();
