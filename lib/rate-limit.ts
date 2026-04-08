import { getSQL } from './neon-sql';

// ─── Config (override via environment variables) ──────────────────────────────

// Max requests per IP per hour
const LIMIT_PER_IP_PER_HOUR = Number(process.env.RATE_LIMIT_PER_IP_PER_HOUR ?? 10);

// Max total requests across all users per day
const LIMIT_DAILY_TOTAL = Number(process.env.RATE_LIMIT_DAILY_TOTAL ?? 10);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
}

export interface UserUsage {
  userId: string;
  username: string;
  displayName: string | null;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
}

export interface UsageStats {
  today: {
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCostUsd: number;
  };
  allTime: {
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCostUsd: number;
  };
  byUser: UserUsage[];
  thisHour: {
    requestsByIp: number;
    ip: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Rough cost estimate based on claude-haiku-4-5 pricing.
 * Update INPUT_COST_PER_TOKEN / OUTPUT_COST_PER_TOKEN if you switch models.
 * Actual pricing: https://www.anthropic.com/pricing
 */
const INPUT_COST_PER_TOKEN  = 0.80 / 1_000_000; // $0.80 per million input tokens
const OUTPUT_COST_PER_TOKEN = 4.00 / 1_000_000; // $4.00 per million output tokens

export function estimateCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * INPUT_COST_PER_TOKEN) + (outputTokens * OUTPUT_COST_PER_TOKEN);
}

// ─── Rate limit check ─────────────────────────────────────────────────────────

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const sql = getSQL();

  // Run both checks in parallel
  const [ipRows, dailyRows] = await Promise.all([
    // Requests from this IP in the last hour
    sql`
      SELECT COUNT(*) AS count
      FROM request_log
      WHERE ip = ${ip}
        AND created_at >= NOW() - INTERVAL '1 hour'
    `,
    // Total requests today (UTC)
    sql`
      SELECT COUNT(*) AS count
      FROM request_log
      WHERE created_at >= CURRENT_DATE
    `,
  ]);

  const ipCount    = Number(ipRows[0]?.count    ?? 0);
  const dailyCount = Number(dailyRows[0]?.count ?? 0);

  if (dailyCount >= LIMIT_DAILY_TOTAL) {
    return {
      allowed: false,
      reason: `The daily request limit of ${LIMIT_DAILY_TOTAL} has been reached. Usage resets at midnight UTC.`,
    };
  }

  if (ipCount >= LIMIT_PER_IP_PER_HOUR) {
    return {
      allowed: false,
      reason: `You've sent too many requests. The limit is ${LIMIT_PER_IP_PER_HOUR} questions per hour. Please wait a moment and try again.`,
      retryAfterSeconds: 3600,
    };
  }

  return { allowed: true };
}

// ─── Log a completed request ──────────────────────────────────────────────────

export async function logRequest(
  ip: string,
  inputTokens: number,
  outputTokens: number,
  userId?: string,
): Promise<void> {
  const sql = getSQL();
  await sql`
    INSERT INTO request_log (ip, input_tokens, output_tokens, user_id)
    VALUES (
      ${ip},
      ${inputTokens},
      ${outputTokens},
      ${userId ?? null}
    )
  `;
}

// ─── Usage stats (for the /api/usage endpoint) ────────────────────────────────

export async function getUsageStats(ip: string): Promise<UsageStats> {
  const sql = getSQL();

  const [todayRows, allTimeRows, hourRows, byUserRows] = await Promise.all([
    sql`
      SELECT
        COUNT(*)            AS total_requests,
        SUM(input_tokens)   AS total_input,
        SUM(output_tokens)  AS total_output
      FROM request_log
      WHERE created_at >= CURRENT_DATE
    `,
    sql`
      SELECT
        COUNT(*)            AS total_requests,
        SUM(input_tokens)   AS total_input,
        SUM(output_tokens)  AS total_output
      FROM request_log
    `,
    sql`
      SELECT COUNT(*) AS count
      FROM request_log
      WHERE ip = ${ip}
        AND created_at >= NOW() - INTERVAL '1 hour'
    `,
    sql`
      SELECT
        u.id              AS user_id,
        u.username,
        u.display_name,
        COUNT(r.id)       AS total_requests,
        SUM(r.input_tokens)  AS total_input,
        SUM(r.output_tokens) AS total_output
      FROM users u
      LEFT JOIN request_log r ON r.user_id = u.id
      GROUP BY u.id, u.username, u.display_name
      ORDER BY total_requests DESC NULLS LAST
    `,
  ]);

  const todayInput    = Number(todayRows[0]?.total_input   ?? 0);
  const todayOutput   = Number(todayRows[0]?.total_output  ?? 0);
  const allTimeInput  = Number(allTimeRows[0]?.total_input  ?? 0);
  const allTimeOutput = Number(allTimeRows[0]?.total_output ?? 0);

  return {
    today: {
      totalRequests:     Number(todayRows[0]?.total_requests ?? 0),
      totalInputTokens:  todayInput,
      totalOutputTokens: todayOutput,
      estimatedCostUsd:  estimateCost(todayInput, todayOutput),
    },
    allTime: {
      totalRequests:     Number(allTimeRows[0]?.total_requests ?? 0),
      totalInputTokens:  allTimeInput,
      totalOutputTokens: allTimeOutput,
      estimatedCostUsd:  estimateCost(allTimeInput, allTimeOutput),
    },
    byUser: byUserRows.map(r => {
      const input  = Number(r.total_input  ?? 0);
      const output = Number(r.total_output ?? 0);
      return {
        userId:            r.user_id as string,
        username:          r.username as string,
        displayName:       r.display_name as string | null,
        totalRequests:     Number(r.total_requests ?? 0),
        totalInputTokens:  input,
        totalOutputTokens: output,
        estimatedCostUsd:  estimateCost(input, output),
      };
    }),
    thisHour: {
      ip,
      requestsByIp: Number(hourRows[0]?.count ?? 0),
    },
  };
}
