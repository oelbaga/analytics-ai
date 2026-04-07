import { BetaAnalyticsDataClient } from '@google-analytics/data';

function getClient(): BetaAnalyticsDataClient {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env variable is not set.');
  }

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }

  return new BetaAnalyticsDataClient({ credentials });
}

export interface GA4TrafficData {
  sessions: number;
  activeUsers: number;
  pageviews: number;
}

export interface GA4PageRow {
  page: string;
  pageviews: number;
  sessions: number;
  avgEngagementTimeSec: number;
}

export interface GA4EventRow {
  eventName: string;
  count: number;
}

/**
 * Fetches sessions, active users, and pageviews for a GA4 property
 * over a given date range.
 *
 * @param propertyId  Numeric GA4 property ID (e.g. "528802054")
 * @param startDate   "YYYY-MM-DD"
 * @param endDate     "YYYY-MM-DD"
 */
export async function getTrafficData(
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<GA4TrafficData> {
  const client = getClient();

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'screenPageViews' },
    ],
  });

  const row = response.rows?.[0];

  return {
    sessions: Number(row?.metricValues?.[0]?.value ?? 0),
    activeUsers: Number(row?.metricValues?.[1]?.value ?? 0),
    pageviews: Number(row?.metricValues?.[2]?.value ?? 0),
  };
}

/**
 * Returns the top N pages by pageviews, with session count and avg engagement time.
 */
export async function getTopPages(
  propertyId: string,
  startDate: string,
  endDate: string,
  limit = 10
): Promise<GA4PageRow[]> {
  const client = getClient();

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'sessions' },
      { name: 'averageSessionDuration' },
    ],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit,
  });

  return (response.rows ?? []).map((row) => ({
    page: row.dimensionValues?.[0]?.value ?? '/',
    pageviews: Number(row.metricValues?.[0]?.value ?? 0),
    sessions: Number(row.metricValues?.[1]?.value ?? 0),
    avgEngagementTimeSec: Math.round(Number(row.metricValues?.[2]?.value ?? 0)),
  }));
}

/**
 * Returns the top N events by event count.
 * Excludes noisy auto-collected events like session_start, first_visit, user_engagement.
 */
export async function getTopEvents(
  propertyId: string,
  startDate: string,
  endDate: string,
  limit = 15
): Promise<GA4EventRow[]> {
  const client = getClient();

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      notExpression: {
        filter: {
          fieldName: 'eventName',
          inListFilter: {
            values: ['session_start', 'first_visit', 'user_engagement'],
          },
        },
      },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit,
  });

  return (response.rows ?? []).map((row) => ({
    eventName: row.dimensionValues?.[0]?.value ?? '',
    count: Number(row.metricValues?.[0]?.value ?? 0),
  }));
}
