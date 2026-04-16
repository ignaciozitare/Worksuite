import type { EmailRule } from '../../domain/emailIntel/types.js';
import type { ParsedEmail } from '../../infrastructure/gmail/GmailProvider.js';

/**
 * Pure function. Given an email and a list of (active) rules sorted by
 * sort_order ascending, return the first matching rule (or null).
 *
 * Rule-match semantics: ANY filter in a rule matches → rule matches.
 * Filter types:
 *   - 'all'       → always matches (use sparingly; typically combined with actions).
 *   - 'label'     → email has a Gmail label whose name equals value (case-insensitive).
 *   - 'category'  → email has a CATEGORY_* label matching value (PRIMARY/PROMOTIONS/etc.).
 *                   We accept either "PROMOTIONS" or "CATEGORY_PROMOTIONS".
 *   - 'sender'    → fromEmail equals value (case-insensitive).
 *   - 'domain'    → fromEmail ends with @value or is *.value domain (case-insensitive).
 */
export function matchEmailAgainstRules(email: ParsedEmail, rules: EmailRule[]): EmailRule | null {
  const activeRules = rules.filter(r => r.is_active).sort((a, b) => a.sort_order - b.sort_order);
  for (const rule of activeRules) {
    if (ruleMatches(email, rule)) return rule;
  }
  return null;
}

function ruleMatches(email: ParsedEmail, rule: EmailRule): boolean {
  for (const f of rule.filters ?? []) {
    const val = (f.value ?? '').trim().toLowerCase();
    switch (f.type) {
      case 'all':
        return true;
      case 'label': {
        if (!val) continue;
        // Gmail label ids are stored as uppercase; user-created labels preserve case.
        const match = email.labels.some(l => l.toLowerCase() === val);
        if (match) return true;
        break;
      }
      case 'category': {
        if (!val) continue;
        const normalized = val.startsWith('category_') ? val : `category_${val}`;
        const match = email.categories.some(c => c.toLowerCase() === normalized);
        if (match) return true;
        break;
      }
      case 'sender': {
        if (!val) continue;
        if (email.fromEmail.toLowerCase() === val) return true;
        break;
      }
      case 'domain': {
        if (!val) continue;
        const domain = email.fromEmail.toLowerCase().split('@')[1] ?? '';
        const bare = val.startsWith('@') ? val.slice(1) : val;
        if (domain === bare || domain.endsWith(`.${bare}`)) return true;
        break;
      }
    }
  }
  return false;
}
