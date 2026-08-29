import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

/**
 * Services throw `InternalServerErrorException(error.message)` carrying the
 * raw PostgREST message, and Nest serialises that straight into the response
 * body — which put table, column and constraint names ("violates foreign key
 * constraint user_plants_plant_species_id_fkey") into user-facing alert
 * dialogs in the app.
 *
 * 4xx bodies are deliberate and meant to be read by the user ("Invalid claim
 * code", ValidationPipe messages), so they pass through untouched. Anything
 * 5xx is logged in full server-side and replaced with a generic message plus
 * a reference id the logs can be searched by.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status < 500) {
        const body = exception.getResponse();
        const payload =
          typeof body === 'string'
            ? { statusCode: status, message: body }
            : body;
        res.status(status).json(payload);
        return;
      }
    }

    const reference = randomUUID();
    this.logger.error(
      `[${reference}] ${req.method} ${req.originalUrl}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Something went wrong on our end. Please try again.',
      reference,
    });
  }
}
