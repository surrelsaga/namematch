// Preloaded with `--import ./instrument.mjs` so Sentry can hook modules before they load.
// @sentry/node instruments Mastra on its own (needs @mastra/observability installed),
// plus fetch, so RDAP, GitHub and model API calls show up as http.client spans.
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    environment: process.env.NODE_ENV || 'development',
    // The web app polls GET /api/sessions/:id every 1 to 5 s and Render pings GET /api/health;
    // keep those out of traces. (ignoreSpans doesn't drop http.server spans under span streaming.)
    integrations: [
      Sentry.httpIntegration({
        ignoreIncomingRequests: (path, req) => req.method === 'GET' && path.startsWith('/api/'),
      }),
    ],
  });
}
