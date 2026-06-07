export function isPlexUnauthorizedMessage(message?: string): boolean {
  if (!message) return false;
  return /\b401\b|unauthorized|unauthorised|invalid token/i.test(message);
}
