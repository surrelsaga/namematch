import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { app } from './app';

// Production: serve the built web app, with index.html as the fallback for client routes.
if (existsSync('web/dist/index.html')) {
  app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));
  app.use('/*', serveStatic({ root: './web/dist' }));
  app.get('*', serveStatic({ path: './web/dist/index.html' }));
}

const port = Number(process.env.PORT || 3000);
serve({ fetch: app.fetch, port }, () => console.log(`Nammit server on http://localhost:${port}`));
