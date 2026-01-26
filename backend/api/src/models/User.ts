/**
 * User model
 */

import { query, queryOne, queryMany } from '../db/queries';
import bcrypt from 'bcrypt';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

export interface UserCreateInput {
  email: string;
  password: string;
}

export class User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(row: UserRow) {
    this.id = row.id;
    this.email = row.email;
    this.passwordHash = row.password_hash;
    this.createdAt = row.created_at;
    this.updatedAt = row.updated_at;
  }

  /**
   * Find user by ID
   */
  static async findById(id: string): Promise<User | null> {
    const row = await queryOne<UserRow>(
      'SELECT * FROM hub.users WHERE id = $1',
      [id]
    );
    return row ? new User(row) : null;
  }

  /**
   * Find user by email
   */
  static async findByEmail(email: string): Promise<User | null> {
    const row = await queryOne<UserRow>(
      'SELECT * FROM hub.users WHERE email = $1',
      [email]
    );
    return row ? new User(row) : null;
  }

  /**
   * Create a new user
   */
  static async create(input: UserCreateInput): Promise<User> {
    const passwordHash = await bcrypt.hash(input.password, 10);
    const row = await queryOne<UserRow>(
      `INSERT INTO hub.users (email, password_hash)
       VALUES ($1, $2)
       RETURNING *`,
      [input.email, passwordHash]
    );
    if (!row) {
      throw new Error('Failed to create user');
    }
    return new User(row);
  }

  /**
   * Verify password
   */
  async verifyPassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.passwordHash);
  }

  /**
   * Update user
   */
  async update(updates: Partial<{ email: string; password: string }>): Promise<User> {
    const updatesList: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.email) {
      updatesList.push(`email = $${paramIndex++}`);
      values.push(updates.email);
    }

    if (updates.password) {
      const passwordHash = await bcrypt.hash(updates.password, 10);
      updatesList.push(`password_hash = $${paramIndex++}`);
      values.push(passwordHash);
    }

    if (updatesList.length === 0) {
      return this;
    }

    values.push(this.id);
    const row = await queryOne<UserRow>(
      `UPDATE hub.users
       SET ${updatesList.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (!row) {
      throw new Error('Failed to update user');
    }

    return new User(row);
  }

  /**
   * Delete user
   */
  async delete(): Promise<void> {
    await query('DELETE FROM hub.users WHERE id = $1', [this.id]);
  }

  /**
   * Convert to JSON (without password hash)
   */
  toJSON(): { id: string; email: string; createdAt: Date; updatedAt: Date } {
    return {
      id: this.id,
      email: this.email,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
