/**
 * Dashboard Service — real-time cognitive state metrics
 * All metrics derived from existing PG data — no LLM calls.
 */

import { pool } from '../db/connection';

export interface DashboardMetrics {
  cognitiveLoad: {
    score: number;  // 0-1
    level: 'low' | 'medium' | 'high';
  };
  activeCommitments: number;
  openLoops: number;
  unresolvedDecisions: number;
  newIdeasThisWeek: number;
  staleActionables: number;
  dormantIdeasCount: number;
  domainDistribution: Record<string, number>;
  topDomainThisWeek: string | null;
  lastSynthesisDate: string | null;
  objectsThisWeek: number;
}

// Simple in-memory cache — per user, 5 minutes
const cache = new Map<string, { data: DashboardMetrics; expiresAt: number }>();

export async function getDashboardMetrics(userId: string): Promise<DashboardMetrics> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const [
    activeCommitmentsRow,
    openLoopsRow,
    unresolvedDecisionsRow,
    newIdeasRow,
    staleActionablesRow,
    domainDistRow,
    dormantIdeasRow,
    objectsThisWeekRow,
    lastSynthesisRow,
  ] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) FROM hub.atomic_objects
       WHERE user_id=$1 AND deleted_at IS NULL AND is_actionable=true
         AND (linked_object_ids = '{}' OR linked_object_ids IS NULL)
         AND (state IS NULL OR state NOT IN ('resolved','archived'))`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(*) FROM hub.atomic_objects
       WHERE user_id=$1 AND deleted_at IS NULL AND object_type='question'
         AND (state IS NULL OR state='open')`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(*) FROM hub.atomic_objects
       WHERE user_id=$1 AND deleted_at IS NULL AND object_type='decision'
         AND outcome_evaluated_at IS NULL
         AND created_at < NOW() - INTERVAL '7 days'`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(*) FROM hub.atomic_objects
       WHERE user_id=$1 AND deleted_at IS NULL AND object_type='idea'
         AND created_at > NOW() - INTERVAL '7 days'`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(*) FROM hub.atomic_objects
       WHERE user_id=$1 AND deleted_at IS NULL AND is_actionable=true
         AND created_at < NOW() - INTERVAL '7 days'
         AND (linked_object_ids = '{}' OR linked_object_ids IS NULL)`,
      [userId]
    ),
    pool.query(
      `SELECT domain, COUNT(*)::int AS count FROM hub.atomic_objects
       WHERE user_id=$1 AND deleted_at IS NULL AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY domain ORDER BY count DESC`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(*) FROM hub.atomic_objects
       WHERE user_id=$1 AND deleted_at IS NULL AND object_type='idea'
         AND (state IS NULL OR state='open') AND importance_score > 0.5
         AND (last_accessed_at < NOW() - INTERVAL '14 days' OR last_accessed_at IS NULL)`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(*) FROM hub.atomic_objects
       WHERE user_id=$1 AND deleted_at IS NULL
         AND created_at > NOW() - INTERVAL '7 days'`,
      [userId]
    ),
    pool.query(
      `SELECT created_at FROM hub.sessions
       WHERE user_id=$1 AND metadata->>'type'='synthesis'
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    ),
  ]);

  const activeCommitments = parseInt(activeCommitmentsRow.rows[0].count, 10);
  const openLoops = parseInt(openLoopsRow.rows[0].count, 10);
  const unresolvedDecisions = parseInt(unresolvedDecisionsRow.rows[0].count, 10);
  const newIdeasThisWeek = parseInt(newIdeasRow.rows[0].count, 10);
  const staleActionables = parseInt(staleActionablesRow.rows[0].count, 10);
  const dormantIdeasCount = parseInt(dormantIdeasRow.rows[0].count, 10);
  const objectsThisWeek = parseInt(objectsThisWeekRow.rows[0].count, 10);
  const lastSynthesisDate = lastSynthesisRow.rows[0]?.created_at?.toISOString() ?? null;

  const domainDistribution: Record<string, number> = {};
  let topDomainThisWeek: string | null = null;
  for (const row of domainDistRow.rows) {
    if (row.domain) {
      domainDistribution[row.domain] = row.count;
      if (!topDomainThisWeek) topDomainThisWeek = row.domain;
    }
  }

  // Cognitive load score (0-1)
  const rawScore =
    (activeCommitments / 20) * 0.35 +
    (openLoops / 10) * 0.25 +
    (unresolvedDecisions / 5) * 0.25 +
    (staleActionables / 10) * 0.15;
  const score = parseFloat(Math.min(1.0, rawScore).toFixed(2));
  const level: 'low' | 'medium' | 'high' =
    score < 0.35 ? 'low' : score < 0.65 ? 'medium' : 'high';

  const metrics: DashboardMetrics = {
    cognitiveLoad: { score, level },
    activeCommitments,
    openLoops,
    unresolvedDecisions,
    newIdeasThisWeek,
    staleActionables,
    dormantIdeasCount,
    domainDistribution,
    topDomainThisWeek,
    lastSynthesisDate,
    objectsThisWeek,
  };

  cache.set(userId, { data: metrics, expiresAt: Date.now() + 5 * 60 * 1000 });
  return metrics;
}

export function invalidateDashboardCache(userId: string): void {
  cache.delete(userId);
}
