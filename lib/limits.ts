// ─── App-wide limits ──────────────────────────────────────────────────────────
//
// All caps and defaults are defined here so they can be changed in one place.

// Maximum rows returned in an Excel export (bypasses chat cap but still bounded)
// Override via MAX_EXPORT_ROWS env var
export const MAX_EXPORT_ROWS = Number(process.env.MAX_EXPORT_ROWS ?? 500);

// Maximum rows returned for any list of individual records
// (leads, search results, clients, or any future record-type tool).
// The true total is always fetched and reported — this only caps what's returned.
export const MAX_RECORDS_RETURNED = 25;

// Maximum breakdown rows returned by query_leads (source / medium / campaign / form_name)
export const MAX_BREAKDOWN_ROWS = 25;

// Maximum rows returned by query_analytics_breakdown (top_pages / top_events)
export const MAX_ANALYTICS_BREAKDOWN_ROWS = 10;

// Number of past messages (user + assistant) sent to Claude as context.
// Each pair = 1 user message + 1 assistant reply.
export const MAX_CONVERSATION_HISTORY = 6;

// Max tokens Claude can use in a single response
export const MAX_RESPONSE_TOKENS = 1024;
