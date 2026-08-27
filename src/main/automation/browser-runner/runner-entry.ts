import { BrowserSession } from '../browser-session';
import {
  parseRunnerRequestMessage,
  type RunnerChildToHostMessage,
} from '../protocol';
import path from 'node:path';
import os from 'node:os';

interface ParentPort {
  postMessage: (message: unknown) => void;
  on: (event: 'message', listener: (event: { data: unknown }) => void) => void;
}

/**
 * Utility-process entry for browser automation.
 * Speaks typed parentPort messages (requestId / command / result / error).
 * Must be started via Electron utilityProcess.fork() — not ELECTRON_RUN_AS_NODE.
 */
function main(): void {
  const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;
  if (!parentPort) {
    process.stderr.write(
      'runner-entry must be launched via Electron utilityProcess.fork() (no parentPort)\n',
    );
    process.exit(1);
  }

  const diagnosticsDir =
    process.env.NOVELTRANS_AUTOMATION_DIAGNOSTICS_DIR ??
    path.join(os.tmpdir(), 'noveltrans-automation');

  const session = new BrowserSession({ diagnosticsDir });

  const send = (message: RunnerChildToHostMessage): void => {
    parentPort.postMessage(message);
  };

  send({
    type: 'event',
    event: 'runner_ready',
    payload: { pid: process.pid },
  });

  parentPort.on('message', (event) => {
    void handleMessage(event.data, session, send);
  });

  process.on('disconnect', () => {
    void session.execute({ id: 'disconnect', type: 'CLOSE' }).finally(() => {
      process.exit(0);
    });
  });
}

async function handleMessage(
  raw: unknown,
  session: BrowserSession,
  send: (message: RunnerChildToHostMessage) => void,
): Promise<void> {
  let requestId = 'unknown';
  try {
    const message = parseRunnerRequestMessage(raw);
    requestId = message.requestId;
    const result = await session.execute(message.command);
    send({
      type: 'response',
      requestId,
      result: { ...result, id: requestId },
    });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    send({
      type: 'log',
      level: 'error',
      message: errMessage,
    });
    send({
      type: 'response',
      requestId,
      error: {
        message: errMessage,
        code: 'UNKNOWN_UI',
      },
      result: {
        id: requestId,
        ok: false,
        state: 'ERROR',
        errorCode: 'UNKNOWN_UI',
        errorMessage: errMessage,
      },
    });
  }
}

main();
