/**
 * Error for a failed API call. Thrown by the live client and by the offline stand-in,
 * so a caller cannot tell the two paths apart by the error type.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    public path: string,
  ) {
    super(`API ${path} failed: ${status} ${body}`);
    this.name = 'ApiError';
  }
}
