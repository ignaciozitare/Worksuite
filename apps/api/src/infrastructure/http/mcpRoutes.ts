// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// MCP routes — exposes Vector Logic via Model Context Protocol over HTTP.
//
// Uses the StreamableHTTPServerTransport from the official MCP SDK, mounted
// under /mcp. MCP clients (Claude Desktop, Claude Code, Cursor, etc.) connect
// here using the standard MCP HTTP transport and authenticate with a Bearer
// token (the same Supabase access_token the rest of the API uses).
//
// The user's own Claude subscription handles the LLM cost — this server just
// exposes Vector Logic data and operations as tools.
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { VectorLogicMCPServer } from '../mcp/VectorLogicMCPServer.js';

interface MCPRoutesOptions extends FastifyPluginOptions {
  mcpServer: VectorLogicMCPServer;
}

export async function mcpRoutes(app: FastifyInstance, opts: MCPRoutesOptions): Promise<void> {
  const { mcpServer } = opts;

  // Auth applies to all MCP endpoints. The user must send their Supabase
  // access_token as Bearer in the Authorization header. The token decodes
  // to a `sub` (user id) which is bound to the per-request MCP server.
  app.addHook('preHandler', app.authenticate);

  // Helper: handle a single MCP request statelessly. A new transport and
  // server are created per request — no session state to manage. This is
  // simpler for serverless deployments (Vercel) and matches Claude Code's
  // expected behavior for HTTP MCP servers.
  async function handle(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (req.user as { sub: string }).sub;
    const server = mcpServer.buildServer(userId);
    // Stateless mode: omit sessionIdGenerator so each request creates a
    // fresh transport and no server-side session state is held.
    const transport = new StreamableHTTPServerTransport({});

    // Cleanup when the underlying response closes
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      // Pass the parsed body for POST requests (Fastify already parsed it)
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      app.log.error({ err: msg }, 'MCP request failed');
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        reply.raw.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal MCP error', data: msg },
          id: null,
        }));
      }
    }
  }

  // POST /mcp — incoming JSON-RPC messages from the client
  app.post('/', handle);

  // GET /mcp — SSE stream for server-to-client messages (notifications, etc.)
  app.get('/', handle);

  // DELETE /mcp — close session (no-op in stateless mode but spec-compliant)
  app.delete('/', handle);
}
