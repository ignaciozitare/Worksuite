import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../src/app.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await buildApp();
  await app.ready();
  app.server.emit('request', req, res);
}
