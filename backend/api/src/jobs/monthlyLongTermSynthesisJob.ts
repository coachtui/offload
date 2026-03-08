/**
 * Monthly Long-Term Synthesis Job
 * Runs on the 1st of each month.
 * Generates a cross-synthesis trend analysis persisted as a Session with type='monthly_synthesis'.
 */

import axios from 'axios';
import { pool } from '../db/connection';
import { Session } from '../models/Session';
import { AtomicObjectModel } from '../models/AtomicObject';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check hourly

const MONTHLY_SYNTHESIS_PROMPT = `You are a monthly reflection agent for a personal second brain system.

Analyze the user's notes and captured thoughts from the past 30 days and generate a structured monthly reflection.

RULES:
1. Compare to previous month where data is available
2. Identify sustained focus areas vs one-time events
3. Surface long-term patterns that a weekly view might miss
4. Be specific — reference actual content from notes
5. Write in second person ("You've been...")
6. Separate narrative paragraphs with \\n\\n

RETURN valid JSON:
{
  "narrative": "2-3 paragraph monthly reflection",
  "sustained_patterns": ["pattern that continued from last month"],
  "new_themes": ["emerging theme not seen before"],
  "resolved_threads": ["things that seem concluded"],
  "focus_shifts": ["domain or topic that gained/lost attention"],
  "cited_refs": [1, 3, 5]
}`;

async function shouldRunThisMonth(userId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT id FROM hub.sessions
     WHERE user_id = $1
       AND metadata->>'type' = 'monthly_synthesis'
       AND created_at >= date_trunc('month', NOW())
     LIMIT 1`,
    [userId]
  );
  return result.rows.length === 0;
}

async function getAllActiveUserIds(): Promise<string[]> {
  // Users who have objects in the past 30 days
  const result = await pool.query(
    `SELECT DISTINCT user_id FROM hub.atomic_objects
     WHERE deleted_at IS NULL AND created_at > NOW() - INTERVAL '30 days'`
  );
  return result.rows.map((r: { user_id: string }) => r.user_id);
}

async function callLLM(userMessage: string): Promise<string> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (anthropicKey) {
    const model = process.env.SPAR_MODEL || 'claude-sonnet-4-6';
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model,
        max_tokens: 2048,
        temperature: 0.4,
        system: MONTHLY_SYNTHESIS_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      },
      {
        headers: {
          'x-api-key': anthropicKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        timeout: 90000,
      }
    );
    return response.data.content[0].text;
  } else if (openaiKey) {
    const model = process.env.SPAR_MODEL || 'gpt-4o';
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        messages: [
          { role: 'system', content: MONTHLY_SYNTHESIS_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.4,
        response_format: { type: 'json_object' },
      },
      {
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        timeout: 90000,
      }
    );
    return response.data.choices[0].message.content;
  } else {
    throw new Error('No LLM API key configured');
  }
}

async function generateMonthlyForUser(userId: string): Promise<void> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd);
  periodStart.setDate(periodStart.getDate() - 30);

  const { objects: raw } = await AtomicObjectModel.findByUserId(userId, {
    dateFrom: periodStart,
    dateTo: periodEnd,
    limit: 200,
  });

  if (raw.length < 10) {
    console.log(`[monthlyJob] Skipping userId ${userId.slice(0, 8)}... — too few objects (${raw.length})`);
    return;
  }

  const objects = raw.map((o) => o.toAtomicObject()).slice(0, 100);

  const lines = objects.map((obj, i) => {
    const date = new Date(obj.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const text = (obj.cleanedText ?? obj.content).slice(0, 150);
    return `[${date}] ${obj.objectType ?? 'note'}/${obj.domain ?? 'unknown'} — ${text} [ref_${i + 1}]`;
  });

  const domainCounts: Record<string, number> = {};
  for (const obj of objects) {
    const d = obj.domain ?? 'unknown';
    domainCounts[d] = (domainCounts[d] ?? 0) + 1;
  }
  const domainSummary = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([d, n]) => `${d}: ${n}`)
    .join(', ');

  const userMessage = `MONTH: ${periodStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
TOTAL NOTES: ${objects.length}
DOMAIN BREAKDOWN: ${domainSummary}

NOTES:
${lines.join('\n')}

Generate a monthly synthesis.`;

  let rawResponse: string;
  try {
    rawResponse = await callLLM(userMessage);
  } catch (err) {
    console.error(`[monthlyJob] LLM call failed for user ${userId.slice(0, 8)}:`, err);
    return;
  }

  let parsed: any = {};
  try {
    let text = rawResponse.trim();
    if (text.startsWith('```json')) text = text.slice(7);
    if (text.startsWith('```')) text = text.slice(3);
    if (text.endsWith('```')) text = text.slice(0, -3);
    parsed = JSON.parse(text.trim());
  } catch {
    parsed = { narrative: rawResponse };
  }

  const monthlySynthesis = {
    type: 'monthly_synthesis',
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    objectCount: objects.length,
    domainBreakdown: domainCounts,
    narrative: parsed.narrative ?? '',
    sustainedPatterns: parsed.sustained_patterns ?? [],
    newThemes: parsed.new_themes ?? [],
    resolvedThreads: parsed.resolved_threads ?? [],
    focusShifts: parsed.focus_shifts ?? [],
    generatedAt: new Date().toISOString(),
  };

  const session = await Session.create({
    userId,
    deviceId: 'monthly-synthesis-agent',
    metadata: monthlySynthesis,
  });

  await session.update({ status: 'completed', metadata: monthlySynthesis });
  console.log(`[monthlyJob] Generated monthly synthesis for user ${userId.slice(0, 8)}... — session ${session.id}`);
}

async function runMonthlyJob(): Promise<void> {
  const now = new Date();
  // Only run on the 1st of the month (check within the current hour)
  if (now.getDate() !== 1) return;

  if (process.env.ENABLE_LONG_TERM_SYNTHESIS === 'false') return;

  console.log('[monthlyJob] Running monthly synthesis generation');

  const userIds = await getAllActiveUserIds();
  console.log(`[monthlyJob] Processing ${userIds.length} active users`);

  for (const userId of userIds) {
    const should = await shouldRunThisMonth(userId);
    if (!should) {
      console.log(`[monthlyJob] Already ran this month for user ${userId.slice(0, 8)}...`);
      continue;
    }
    try {
      await generateMonthlyForUser(userId);
    } catch (err) {
      console.error(`[monthlyJob] Failed for user ${userId.slice(0, 8)}:`, err);
    }
    // Throttle between users
    await new Promise((r) => setTimeout(r, 2000));
  }
}

export function startMonthlyLongTermSynthesisJob(): void {
  console.log('[monthlyJob] Starting — checks hourly, runs on 1st of month');
  setInterval(() => {
    runMonthlyJob().catch((err) =>
      console.error('[monthlyJob] Error:', err)
    );
  }, CHECK_INTERVAL_MS);
}

export async function runMonthlyJobOnce(): Promise<void> {
  return runMonthlyJob();
}
