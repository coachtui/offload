// backend/api/migrations/005_user_categories.ts
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    { schema: 'hub', name: 'user_categories' },
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('uuid_generate_v4()'),
      },
      user_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'hub', name: 'users', column: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: 'text', notNull: true },
      color: { type: 'text', notNull: true, default: '#6b7280' },
      icon: { type: 'text', notNull: false, default: null },
      keywords: { type: 'text[]', notNull: true, default: '{}' },
      sort_order: { type: 'integer', notNull: true, default: 0 },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    }
  );

  pgm.createIndex({ schema: 'hub', name: 'user_categories' }, 'user_id');

  pgm.addColumns(
    { schema: 'hub', name: 'atomic_objects' },
    {
      category_id: {
        type: 'uuid',
        notNull: false,
        default: null,
        references: { schema: 'hub', name: 'user_categories', column: 'id' },
        onDelete: 'SET NULL',
      },
      category_locked: { type: 'boolean', notNull: true, default: false },
    }
  );

  pgm.createIndex({ schema: 'hub', name: 'atomic_objects' }, 'category_id', {
    where: 'category_id IS NOT NULL',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns({ schema: 'hub', name: 'atomic_objects' }, ['category_id', 'category_locked']);
  pgm.dropTable({ schema: 'hub', name: 'user_categories' });
}
