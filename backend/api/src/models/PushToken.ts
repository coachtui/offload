/**
 * PushToken model — hub.push_tokens (Expo push tokens) and hub.job_state
 * (generic scheduled-job dedup markers).
 */
import { query, queryOne, queryMany } from '../db/queries';

export class PushTokenModel {
  static async upsert(userId: string, token: string, platform: 'ios' | 'android'): Promise<void> {
    await query(
      `INSERT INTO hub.push_tokens (user_id, token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             platform = EXCLUDED.platform,
             updated_at = now()`,
      [userId, token, platform]
    );
  }

  static async findTokensByUser(userId: string): Promise<string[]> {
    const rows = await queryMany<{ token: string }>(
      `SELECT token FROM hub.push_tokens WHERE user_id = $1`,
      [userId]
    );
    return rows.map((r) => r.token);
  }

  static async deleteToken(token: string): Promise<void> {
    await query(`DELETE FROM hub.push_tokens WHERE token = $1`, [token]);
  }
}

export class JobStateModel {
  static async getLastRun(jobName: string): Promise<Date | null> {
    const row = await queryOne<{ last_run_at: Date | null }>(
      `SELECT last_run_at FROM hub.job_state WHERE job_name = $1`,
      [jobName]
    );
    return row?.last_run_at ?? null;
  }

  static async setLastRun(jobName: string, when: Date): Promise<void> {
    await query(
      `INSERT INTO hub.job_state (job_name, last_run_at)
       VALUES ($1, $2)
       ON CONFLICT (job_name) DO UPDATE SET last_run_at = EXCLUDED.last_run_at`,
      [jobName, when]
    );
  }
}
