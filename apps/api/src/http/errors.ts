import type { ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function publicError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof Error && 'type' in error) {
    if (error.type === 'entity.parse.failed') {
      return new HttpError(400, 'INVALID_JSON', 'El cuerpo de la solicitud debe ser JSON válido.');
    }
    if (error.type === 'entity.too.large') {
      return new HttpError(413, 'BODY_TOO_LARGE', 'La solicitud supera el tamaño permitido.');
    }
  }
  return new HttpError(500, 'INTERNAL_ERROR', 'Ocurrió un error al procesar la solicitud.');
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    const failure = publicError(error);
    const requestId: string = response.locals.requestId;

    if (failure.status === 500) {
      logger.error(
        { requestId, errorType: error instanceof Error ? error.name : typeof error },
        'Error interno en API',
      );
    }

    response.status(failure.status).json({
      error: { code: failure.code, message: failure.message, requestId },
    });
  };
}
