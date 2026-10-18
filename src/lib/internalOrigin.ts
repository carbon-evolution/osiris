/**
 * Origin for server-side calls from one API route to another in this app.
 *
 * Uses INTERNAL_ORIGIN when set, else this server on 127.0.0.1:$PORT (`next
 * dev -p`, `next start -p` and the Docker image all set PORT). Never derive it
 * from the incoming request: a forged Host header would point the fetch at
 * any host.
 */
export function internalOrigin(): string {
  return process.env.INTERNAL_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`;
}
