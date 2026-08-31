import type { IpcMainInvokeEvent } from 'electron';
import type { ZodType } from 'zod';
import { sanitizeIpcErrorMessage } from '../security/log-sanitize';

export class IpcValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IpcValidationError';
  }
}

export function createIpcHandler<TRequest, TResponse>(
  requestSchema: ZodType<TRequest> | undefined,
  handler: (request: TRequest) => TResponse | Promise<TResponse>,
  responseSchema?: ZodType<TResponse>,
): (_event: IpcMainInvokeEvent, rawRequest?: unknown) => Promise<TResponse> {
  return async (_event, rawRequest?: unknown) => {
    let request: TRequest;
    try {
      request = requestSchema
        ? requestSchema.parse(rawRequest ?? {})
        : (rawRequest as TRequest);
    } catch (error) {
      throw new IpcValidationError(
        sanitizeIpcErrorMessage(
          error instanceof Error ? error.message : 'Invalid IPC request',
        ),
      );
    }

    const response = await handler(request);
    if (responseSchema) {
      return responseSchema.parse(response);
    }
    return response;
  };
}

export function createIpcHandlerNoArg<TResponse>(
  handler: () => TResponse | Promise<TResponse>,
  responseSchema?: ZodType<TResponse>,
): (_event: IpcMainInvokeEvent) => Promise<TResponse> {
  return async () => {
    const response = await handler();
    if (responseSchema) {
      return responseSchema.parse(response);
    }
    return response;
  };
}
