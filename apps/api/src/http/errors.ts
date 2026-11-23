import type { ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';
import { Prisma } from '../generated/prisma/client.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function isTransactionConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034') return true;
  if (error.code !== 'P2010') return false;
  const adapter = error.meta?.driverAdapterError as
    { cause?: { originalCode?: unknown } } | undefined;
  const sqlState = adapter?.cause?.originalCode ?? error.meta?.code;
  return sqlState === '40001' || sqlState === '40P01';
}

function publicError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (isTransactionConflict(error)) {
    return new HttpError(
      409,
      'CONCURRENT_CHANGE',
      'Hubo un cambio al mismo tiempo. Actualiza e inténtalo otra vez.',
    );
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return new HttpError(409, 'DUPLICATE_RECORD', 'Ya existe un registro con esos datos.');
      case 'P2003':
      case 'P2025':
        return new HttpError(
          409,
          'RELATED_RECORD',
          'Revisa los registros relacionados antes de guardar.',
        );
    }
  }
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
