/**
 * One stderr JSON line per unexpected failure, so 500s and internal tool errors leave a trace.
 * Only the error's name and a redacted message are written: never the error object, the stack,
 * request headers or a token.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, '[redacted-token]')
    .replace(/eyJ[\w-]*\.[\w-]*\.[\w-]*/g, '[redacted-jwt]')
    .replace(/eyJ[\w-]+/g, '[redacted-jwt]');
}

export function logError(correlationId: string, where: string, err: unknown): void {
  const name = err instanceof Error ? err.name : typeof err;
  const raw = err instanceof Error ? err.message : String(err);
  const message = redactSecrets(raw).slice(0, 500);
  try {
    process.stderr.write(JSON.stringify({ event: 'error', correlationId, where, name, message }) + '\n');
  } catch {
    // Logging must never turn into a second failure.
  }
}
