/**
 * Security headers applied to every Worker response. Import in app/src/server.ts
 * and wrap the final response: `return applySecurityHeaders(response)`.
 */
export function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  // Framing: the Supercomputer Design-mode inspector + preview render this app
  // inside an iframe served from the editor origins listed in `frame-ancestors`
  // below (higgsfield.ai + the editor dev workers.dev hosts), cross-origin to
  // the app's own .app subdomain. `X-Frame-Options` has no cross-origin
  // allowlist, so SAMEORIGIN/DENY would blank the preview — we deliberately DO
  // NOT set it and control framing via the CSP `frame-ancestors` allowlist.
  headers.set(
    'Content-Security-Policy',
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data: https:; media-src 'self' https:; " +
      "connect-src 'self' https:; " +
      "frame-ancestors 'self' https://*.higgsfield.app https://higgsfield.app " +
      "https://*.higgsfield.ai https://fnf-dev.anwar-695.workers.dev " +
      "https://feat-apps-marketplace-tools-fnf-dev.anwar-695.workers.dev; " +
      "base-uri 'self'; form-action 'self'",
  );
  headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('X-XSS-Protection', '0');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
