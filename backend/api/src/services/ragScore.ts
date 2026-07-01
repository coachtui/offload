/**
 * Filter ranked RAG rows by a minimum similarity score (0-1, higher = closer).
 * Default 0.4 preserves the prior /rag/search behavior; proactive callers pass
 * a stricter value (e.g. 0.6) so only genuinely-related notes qualify.
 */
export function applyMinScore<T extends { score: number }>(rows: T[], minScore = 0.4): T[] {
  return rows.filter((r) => r.score >= minScore);
}
