import { ZodError } from 'zod';
export class AppError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
export function publicError(error: unknown, operation: string): { message: string; status: number } {
  if (error instanceof AppError) return { message: error.message, status: error.status };
  if (error instanceof ZodError) return { message: 'Please check the input format and length.', status: 400 };
  console.error(JSON.stringify({ operation, category: error instanceof Error ? error.name : 'UnknownError' }));
  return { message: 'This request could not be completed. Please try again.', status: 503 };
}
