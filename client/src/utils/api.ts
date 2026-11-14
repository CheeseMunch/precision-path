/**
 * Resolves the server base URL:
 * - In local development (Vite dev server on :5173), points to http://localhost:4000
 * - In production (Coolify / Docker single-origin deployment), uses relative origin ('')
 * - Can also be overridden via VITE_API_URL environment variable
 */
export const SERVER_URL: string =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '');
