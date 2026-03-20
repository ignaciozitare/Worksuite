// Entry point para desarrollo local — no se usa en Vercel
import { buildApp } from './app.js';

const PORT = parseInt(process.env['PORT'] ?? '3001');

const app = await buildApp();

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`WorkSuite API running on port ${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
