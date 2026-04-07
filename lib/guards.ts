// ─── Destructive operation guards ────────────────────────────────────────────
//
// Defence-in-depth — the DB user already lacks these privileges, but we
// also block at the application layer so nothing destructive is even
// attempted or discussed.

// ─── Patterns ────────────────────────────────────────────────────────────────

/**
 * SQL keywords that indicate a destructive or mutating operation.
 * Checked against raw user input AND against any string value that
 * is about to be interpolated into a query.
 */
const DESTRUCTIVE_SQL_PATTERN = /\b(drop|delete|truncate|update|insert|alter|create|replace|rename|grant|revoke|exec|execute|call|load\s+data|into\s+outfile)\b/i;

/**
 * Classic SQL injection probe characters / sequences.
 */
const SQL_INJECTION_PATTERN = /('|--|;|\/\*|\*\/|xp_|@@|char\s*\(|0x[0-9a-f]+)/i;

// ─── User message check ───────────────────────────────────────────────────────

export interface GuardResult {
  blocked: boolean;
  reason?: string;
}

/**
 * Call this on every raw user message before sending it to Claude.
 * Returns { blocked: true, reason } if the message looks destructive.
 */
export function checkUserMessage(message: string): GuardResult {
  if (DESTRUCTIVE_SQL_PATTERN.test(message) && SQL_INJECTION_PATTERN.test(message)) {
    return {
      blocked: true,
      reason: 'Your message contains patterns that look like database commands. This tool is read-only — please ask about leads or traffic data instead.',
    };
  }

  // Standalone destructive keywords with no analytics context
  const lowerMsg = message.toLowerCase();
  const destructiveKeywords = ['drop table', 'drop database', 'delete from', 'truncate table', 'alter table', 'update set'];
  const found = destructiveKeywords.find((kw) => lowerMsg.includes(kw));
  if (found) {
    return {
      blocked: true,
      reason: `This tool is read-only and cannot perform database operations like "${found}". Please ask about leads or traffic data instead.`,
    };
  }

  return { blocked: false };
}

// ─── Tool input value check ───────────────────────────────────────────────────

/**
 * Call this on any free-text value before using it in a query
 * (e.g. search_value, client_name).
 * Returns { blocked: true, reason } if the value looks like an injection attempt.
 */
export function checkQueryValue(value: string, fieldLabel: string): GuardResult {
  if (DESTRUCTIVE_SQL_PATTERN.test(value)) {
    return {
      blocked: true,
      reason: `The ${fieldLabel} value contains a reserved SQL keyword and cannot be processed.`,
    };
  }

  if (SQL_INJECTION_PATTERN.test(value)) {
    return {
      blocked: true,
      reason: `The ${fieldLabel} value contains characters that are not allowed.`,
    };
  }

  return { blocked: false };
}
