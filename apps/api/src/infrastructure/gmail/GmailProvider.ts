// ─────────────────────────────────────────────────────────────────────────────
// GmailProvider — reads messages from Gmail using a user's access token.
// Scope: https://www.googleapis.com/auth/gmail.readonly
// ─────────────────────────────────────────────────────────────────────────────

export interface GmailHeader { name: string; value: string }
export interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailMessagePart[];
}
export interface GmailFullMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string; // ms since epoch, as string
  payload?: GmailMessagePart;
}

export interface ParsedEmail {
  messageId: string;
  threadId: string;
  labels: string[];
  categories: string[];   // e.g. CATEGORY_PERSONAL, CATEGORY_UPDATES
  receivedAt: string;     // ISO
  fromEmail: string;
  fromName: string | null;
  subject: string;
  bodyText: string;       // best-effort plain-text body
  snippet: string;
}

export class GmailProvider {
  /** List message ids received AFTER the given ISO date (exclusive). Returns newest first. */
  async listMessagesSince(accessToken: string, sinceIso: string | null, max = 25): Promise<string[]> {
    // Gmail `q` supports `after:<epoch-seconds>` (strict >). If no since, go back 24h.
    const since = sinceIso ? new Date(sinceIso) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const afterEpoch = Math.floor(since.getTime() / 1000);
    const q = `after:${afterEpoch} -in:chats`;
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    url.searchParams.set('q', q);
    url.searchParams.set('maxResults', String(max));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Gmail list failed (${res.status}): ${await res.text()}`);
    const json = await res.json() as { messages?: Array<{ id: string }> };
    return (json.messages ?? []).map(m => m.id);
  }

  /** Fetch a single message and parse it to a normalized shape. */
  async fetchMessage(accessToken: string, messageId: string): Promise<ParsedEmail> {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Gmail fetch failed (${res.status}): ${await res.text()}`);
    const msg = await res.json() as GmailFullMessage;
    return this.parse(msg);
  }

  private parse(msg: GmailFullMessage): ParsedEmail {
    const headers = new Map<string, string>();
    for (const h of msg.payload?.headers ?? []) {
      if (h.name) headers.set(h.name.toLowerCase(), h.value ?? '');
    }
    const subject = headers.get('subject') ?? '';
    const fromHeader = headers.get('from') ?? '';
    const { fromEmail, fromName } = this.parseAddress(fromHeader);
    const dateHeader = headers.get('date');
    const receivedAt = dateHeader ? new Date(dateHeader).toISOString()
      : msg.internalDate ? new Date(Number(msg.internalDate)).toISOString()
      : new Date().toISOString();

    const labels = msg.labelIds ?? [];
    const categories = labels.filter(l => l.startsWith('CATEGORY_'));
    const bodyText = this.extractBodyText(msg.payload) || '';

    return {
      messageId: msg.id,
      threadId: msg.threadId,
      labels,
      categories,
      receivedAt,
      fromEmail,
      fromName,
      subject,
      bodyText,
      snippet: (msg.snippet ?? '').slice(0, 500),
    };
  }

  private parseAddress(raw: string): { fromEmail: string; fromName: string | null } {
    // Handles: "Display Name <addr@domain>" or just "addr@domain"
    const m = raw.match(/^\s*"?([^"<>]*?)"?\s*<([^>]+)>\s*$/);
    if (m) return { fromName: (m[1] ?? '').trim() || null, fromEmail: (m[2] ?? '').trim() };
    return { fromName: null, fromEmail: raw.trim() };
  }

  /** Depth-first search for a text/plain part; fall back to text/html stripped of tags. */
  private extractBodyText(part: GmailMessagePart | undefined): string {
    if (!part) return '';
    const mime = part.mimeType ?? '';
    if (mime.startsWith('text/plain') && part.body?.data) {
      return this.decodeB64(part.body.data);
    }
    if (part.parts?.length) {
      // Prefer plain text in any depth
      for (const p of part.parts) {
        const t = this.extractBodyText(p);
        if (t) return t;
      }
    }
    if (mime.startsWith('text/html') && part.body?.data) {
      const html = this.decodeB64(part.body.data);
      return html.replace(/<style[\s\S]*?<\/style>/gi, '')
                 .replace(/<script[\s\S]*?<\/script>/gi, '')
                 .replace(/<[^>]+>/g, ' ')
                 .replace(/&nbsp;/g, ' ')
                 .replace(/\s+/g, ' ')
                 .trim();
    }
    return '';
  }

  private decodeB64(data: string): string {
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
    try {
      return Buffer.from(b64, 'base64').toString('utf-8');
    } catch { return ''; }
  }
}
