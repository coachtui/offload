import { query, queryOne, queryMany } from '../db/queries';

export interface UserCategoryRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string | null;
  keywords: string[];
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface UserCategory {
  id: string;
  userId: string;
  name: string;
  color: string;
  icon: string | null;
  keywords: string[];
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export class UserCategoryModel {
  constructor(private row: UserCategoryRow) {}

  get id() { return this.row.id; }
  get userId() { return this.row.user_id; }
  get keywords() { return this.row.keywords ?? []; }

  toUserCategory(): UserCategory {
    return {
      id: this.row.id,
      userId: this.row.user_id,
      name: this.row.name,
      color: this.row.color,
      icon: this.row.icon ?? null,
      keywords: this.row.keywords ?? [],
      sortOrder: this.row.sort_order,
      createdAt: this.row.created_at,
      updatedAt: this.row.updated_at,
    };
  }

  static async findByUserId(userId: string): Promise<UserCategoryModel[]> {
    const rows = await queryMany<UserCategoryRow>(
      `SELECT * FROM hub.user_categories
       WHERE user_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [userId]
    );
    return rows.map((r) => new UserCategoryModel(r));
  }

  static async findById(id: string): Promise<UserCategoryModel | null> {
    const row = await queryOne<UserCategoryRow>(
      `SELECT * FROM hub.user_categories WHERE id = $1`,
      [id]
    );
    return row ? new UserCategoryModel(row) : null;
  }

  static async create(
    userId: string,
    input: { name: string; color?: string; icon?: string | null; keywords?: string[]; sortOrder?: number }
  ): Promise<UserCategoryModel> {
    const row = await queryOne<UserCategoryRow>(
      `INSERT INTO hub.user_categories (user_id, name, color, icon, keywords, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        userId,
        input.name,
        input.color ?? '#6b7280',
        input.icon ?? null,
        input.keywords ?? [],
        input.sortOrder ?? 0,
      ]
    );
    if (!row) throw new Error('Failed to create category');
    return new UserCategoryModel(row);
  }

  static async update(
    id: string,
    updates: Partial<{ name: string; color: string; icon: string | null; keywords: string[]; sortOrder: number }>
  ): Promise<UserCategoryModel> {
    const sets: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (updates.name !== undefined) { sets.push(`name = $${i++}`); values.push(updates.name); }
    if (updates.color !== undefined) { sets.push(`color = $${i++}`); values.push(updates.color); }
    if (updates.icon !== undefined) { sets.push(`icon = $${i++}`); values.push(updates.icon); }
    if (updates.keywords !== undefined) { sets.push(`keywords = $${i++}`); values.push(updates.keywords); }
    if (updates.sortOrder !== undefined) { sets.push(`sort_order = $${i++}`); values.push(updates.sortOrder); }
    sets.push(`updated_at = NOW()`);
    values.push(id);
    const row = await queryOne<UserCategoryRow>(
      `UPDATE hub.user_categories SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!row) throw new Error('Failed to update category');
    return new UserCategoryModel(row);
  }

  static async delete(id: string): Promise<void> {
    await query(`DELETE FROM hub.user_categories WHERE id = $1`, [id]);
  }
}
