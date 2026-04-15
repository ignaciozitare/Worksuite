/**
 * AI Rules — business rules applied by the MCP server when Claude
 * Desktop / Claude Code invokes a Vector Logic tool. They are written
 * in natural language by the user in the AI Rules view and attached
 * to every MCP tool call as context.
 */
export interface AIRule {
  id: string;
  userId: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
