import type { ApiErrorDto } from '@doner-game/shared';

export class ApiError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
  }
}

export function errorResponse(code: string, message: string): ApiErrorDto {
  return { error: { code, message } };
}
