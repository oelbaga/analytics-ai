# Analytics AI — Project Context

Internal AI chatbot for **New World Group** employees. Ask natural-language questions about client leads (MySQL) and GA4 traffic data. Claude answers by calling structured tools; no SQL is ever written or exposed to the user.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Styles | SCSS Modules |
| AI | Anthropic Claude API (`claude-opus-4-5` default, overridable) |
| Leads DB | MySQL / MariaDB — existing `newworld_connect` database |
| App DB | Neon serverless Postgres — conversations, messages, users, request_log |
| Analytics | Google Analytics 4 Data API (service account) |
| Auth | JWT in httpOnly cookie (`jose` + `bcryptjs`) |
| Hosting | Vercel |

---

## How the app works

1. User logs in at `/login` with username + password.
2. A JWT is signed and stored in a `nwg_session` httpOnly cookie (8 h expiry).
3. `proxy.ts` (Next.js 16's replacement for `middleware.ts`) guards every route — unauthenticated page requests redirect to `/login`, API requests return 401.
4. On the main page, the user types a question into the chat.
5. `POST /api/chat` receives the message, checks rate limits, runs an input guard, then calls Claude with the message history.
6. Claude decides which tool(s) to call. The server executes the tool, returns results to Claude, and Claude produces a final natural-language answer.
7. The conversation (user + assistant messages) is persisted to Neon so multi-turn context works across the session.

---

## Claude tools

All tool definitions live in `lib/tools.ts`. Execution logic is in `lib/tool-executor.ts`.

| Tool | What it does |
|---|---|
| `query_leads` | Lead / form submission counts from MySQL, with optional breakdown by source / medium / campaign / form_name |
| `get_recent_leads` | Returns individual lead records (name, email, phone, date, source) — defaults to last 10, max 50 |
| `search_leads` | Finds leads matching a specific value in a specific field (email, phone, name, zip, source, etc.) |
| `query_analytics` | GA4 totals — sessions, active users, pageviews for a date range |
| `query_analytics_breakdown` | GA4 breakdowns — top pages by pageviews (`top_pages`) or top events by count (`top_events`) |

Claude is given today's date in the system prompt and resolves natural-language dates (e.g. "this week", "last month") to `YYYY-MM-DD` before calling tools.

---

## MySQL database structure (`newworld_connect`)

- **`lists`** — client directory. Each row is one form/website. Columns: `id`, `list_name`, `domain`, `analytics_id` (GA4 property ID, nullable).
- **`list_{id}`** — one table per list entry, holds the actual lead rows. Key columns: `name`, `email`, `phone`, `dt` (datetime), `source`, `medium`, `campaign`, `form_name`, `assigned`, `zip`, `address`, `broker`.

Client lookup is always done with `LIKE` on `list_name` or `domain`, so partial names work. Emails matching `@newworldgroup.com` are excluded from all lead queries to filter out internal test submissions.

Phone search normalises both sides to digits only via `REGEXP_REPLACE` so any formatting in the DB matches any formatting the user types.

---

## Neon Postgres schema

```
users
  id            UUID PK
  username      VARCHAR(100) UNIQUE
  display_name  VARCHAR(100) nullable
  password_hash VARCHAR(255)
  created_at    TIMESTAMPTZ
  last_login    TIMESTAMPTZ

conversations
  id            UUID PK
  created_at    TIMESTAMPTZ

messages
  id              UUID PK
  conversation_id UUID FK → conversations.id (CASCADE DELETE)
  role            VARCHAR(20)  CHECK IN ('user','assistant')
  content         TEXT
  created_at      TIMESTAMPTZ

request_log
  id            UUID PK
  user_id       UUID FK → users.id (nullable)
  ip            VARCHAR(45)
  input_tokens  INT
  output_tokens INT
  created_at    TIMESTAMPTZ
```

---

## Security layers

1. **`proxy.ts`** — JWT check on every request before it reaches any route handler.
2. **`lib/guards.ts` — input guard** — `checkUserMessage()` blocks destructive SQL keywords in raw user input before it reaches Claude. `checkQueryValue()` blocks injection attempts in any value passed to a query.
3. **Claude system prompt** — Claude is instructed it is strictly read-only and must never discuss or attempt mutating operations.
4. **`lib/tool-executor.ts` — parameterised queries** — all MySQL queries use `pool.execute()` with `?` placeholders. Field names used in queries (e.g. `search_field`) are validated against a strict whitelist before use.
5. **MySQL user** — the `analyticsai` DB user has read-only privileges (`SELECT` only).

---

## Auth flow

- **`lib/auth.ts`** — `signToken`, `verifyToken`, cookie helpers. Session payload contains `{ userId, username, displayName }`.
- **`proxy.ts`** — reads the session via `getSessionFromRequest(req)` (Edge-compatible, reads the cookie directly from the `NextRequest`).
- **`app/api/auth/login/route.ts`** — bcrypt compare → sign JWT → set httpOnly cookie. Uses a valid 60-char dummy bcrypt hash for timing-attack protection when no user is found.
- **`app/api/auth/logout/route.ts`** — clears the session cookie.
- The header shows `display_name` if set, falling back to `username`.

---

## Rate limiting

Implemented in `lib/rate-limit.ts` using the Neon `request_log` table.

- **Per-IP per hour** — default 10 (env: `RATE_LIMIT_PER_IP_PER_HOUR`)
- **Daily total across all users** — default 20 (env: `RATE_LIMIT_DAILY_TOTAL`)

`logRequest()` is called non-blocking (`.catch(console.error)`) after each successful chat response and records IP, user_id, and token counts. Token counts are used to estimate Claude API cost.

---

## GA4 integration

Service account JSON is stored as a single-line JSON string in `GOOGLE_SERVICE_ACCOUNT_JSON`. The `BetaAnalyticsDataClient` is instantiated on demand in `lib/ga4.ts`.

GA4 errors are classified into three types and surfaced to the user with actionable messages:
- `permission_denied` — service account not added to that GA4 property
- `unauthenticated` — bad/expired credentials
- `not_found` — property ID no longer exists

When GA4 fails, Claude always offers to pull lead data instead.

---

## File structure

```
app/
  page.tsx                  # Server component — reads session, passes displayName down
  HomeClient.tsx            # Client wrapper for Header + Chat
  globals.scss              # Global CSS variables (--accent, --surface, --border, etc.)
  layout.tsx
  login/
    page.tsx                # Login page (server)
    LoginForm.tsx           # Client form wrapped in <Suspense> (useSearchParams)
  api/
    auth/login/route.ts     # POST — bcrypt verify, sign JWT, set cookie
    auth/logout/route.ts    # POST — clear cookie
    chat/route.ts           # POST — main chat endpoint (rate limit → guard → Claude loop)
    clients/recent/route.ts # GET  — latest 6 client names from MySQL (for suggestion chips)
    conversations/route.ts  # GET  — list conversations
    usage/route.ts          # GET  — usage stats from request_log

components/
  Header/                   # Logo (nwg_icon.svg), New Chat button, display name + logout
  Chat/                     # Textarea, send button, message list, suggestion chips
  Message/                  # Renders a single chat bubble (markdown via react-markdown + remark-gfm)
  Suggestions/              # Intro screen with 6 dynamic question chips (fetched from /api/clients/recent)

lib/
  auth.ts                   # JWT sign/verify, cookie helpers, SessionPayload type
  ga4.ts                    # getTrafficData, getTopPages, getTopEvents
  guards.ts                 # checkUserMessage, checkQueryValue
  mysql.ts                  # Singleton mysql2 connection pool
  neon.ts                   # createConversation, saveMessage, getMessages
  neon-sql.ts               # Lazy singleton Neon client (avoids module-level instantiation)
  rate-limit.ts             # checkRateLimit, logRequest, getUsageStats
  tool-executor.ts          # executeLeadsQuery, executeRecentLeads, executeLeadSearch,
                            #   executeAnalyticsQuery, executeAnalyticsBreakdown
  tools.ts                  # Claude tool definitions (input_schema for all 5 tools)

scripts/
  init-db.mjs               # Creates/migrates all Neon tables — safe to re-run
  seed-user.mjs             # Creates/updates the default user from .env.local
  reset-data.mjs            # Truncates chat/log data, preserves specified user accounts

proxy.ts                    # Next.js 16 middleware (named export 'proxy', not 'middleware')
types/index.ts              # All shared TypeScript types
public/nwg_icon.svg         # NWG logo (red SVG, used in header)
.env.local.example          # Template for all required environment variables
```

---

## Scripts

```bash
node scripts/init-db.mjs    # Run once (or after schema changes) — creates/migrates Neon tables
node scripts/seed-user.mjs  # Creates or updates the default user (reads DEFAULT_* from .env.local)
node scripts/reset-data.mjs # Wipes conversations/messages/request_log, keeps specified users
```

---

## Environment variables

See `.env.local.example` for the full template. Key variables:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key |
| `ANTHROPIC_MODEL` | Optional model override (default: `claude-opus-4-5`) |
| `MYSQL_HOST/PORT/USER/PASSWORD/DATABASE` | Lead database connection |
| `DATABASE_URL` | Neon Postgres connection string |
| `JWT_SECRET` | Signs session tokens — generate with `openssl rand -base64 32` |
| `DEFAULT_USERNAME` | Seed script: login username (stored lowercased) |
| `DEFAULT_PASSWORD` | Seed script: login password |
| `DEFAULT_DISPLAY_NAME` | Seed script: name shown in the header |
| `RATE_LIMIT_PER_IP_PER_HOUR` | Default: 10 |
| `RATE_LIMIT_DAILY_TOTAL` | Default: 20 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full service account JSON as a single-line string |

---

## Next.js 16 notes

- Middleware must be exported as `proxy` (not `middleware`) from `proxy.ts` (not `middleware.ts`).
- `cookies()` is async — must be awaited.
- Client components using `useSearchParams` must be wrapped in `<Suspense>`.
- Neon client must not be instantiated at module level — use the lazy singleton in `lib/neon-sql.ts`.
