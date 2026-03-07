import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add soft-delete column
  pgm.addColumns(
    { schema: 'hub', name: 'atomic_objects' },
    {
      deleted_at: {
        type: 'timestamptz',
        notNull: false,
        default: null,
      },
    }
  );

  // Index for efficient filtering (most queries will add WHERE deleted_at IS NULL)
  pgm.createIndex({ schema: 'hub', name: 'atomic_objects' }, 'deleted_at', {
    name: 'idx_atomic_objects_deleted_at',
    where: 'deleted_at IS NOT NULL',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex({ schema: 'hub', name: 'atomic_objects' }, 'deleted_at', {
    name: 'idx_atomic_objects_deleted_at',
  });
  pgm.dropColumns({ schema: 'hub', name: 'atomic_objects' }, ['deleted_at']);
}
