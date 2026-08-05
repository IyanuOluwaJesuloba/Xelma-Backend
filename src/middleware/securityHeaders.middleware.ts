import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';

/**
 * Shared security headers middleware used by both the main (full) app and the
 * hackathon entrypoint.
 *
 * Wraps helmet with a consistent configuration so every response carries the
 * same core security headers regardless of which server entrypoint started the
 * process.  The middleware is deliberately registered before routes so headers
 * are added even on error responses.
 *
 * Headers set (via helmet):
 *   - Content-Security-Policy:      default-src 'self'
 *   - Cross-Origin-Opener-Policy:   same-origin
 *   - Cross-Origin-Resource-Policy: same-origin
 *   - Origin-Agent-Cluster:         ?1
 *   - Referrer-Policy:              strict-origin-when-cross-origin
 *   - Strict-Transport-Security:    max-age=15552000; includeSubDomains
 *   - X-Content-Type-Options:       nosniff
 *   - X-DNS-Prefetch-Control:       off
 *   - X-Download-Options:           noopen
 *   - X-Frame-Options:              DENY
 *   - X-Permitted-Cross-Domain-Policies: none
 *
 * Headers set manually (not handled by helmet):
 *   - X-XSS-Protection:             1; mode=block
 *   - Permissions-Policy:           geolocation=(), camera=(), microphone=()
 */
export function securityHeadersMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Apply helmet's standard security headers with config that matches our
  // existing security expectations.
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
      },
    },
    // Override SAMEORIGIN → DENY so iframes are fully blocked.
    frameguard: { action: 'deny' },
    // Match existing strict-origin-when-cross-origin policy.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // Helmet's default X-XSS-Protection value is '0' (deprecated header).
    // We disable helmet's handling and set the legacy value ourselves so
    // existing tests (and older browser support) continue to work.
    xXssProtection: false,
  })(_req, res, () => {
    // Set legacy X-XSS-Protection the way older consumers expect.
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Permissions-Policy is not handled by helmet; add it manually.
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), camera=(), microphone=()',
    );

    next();
  });
}
