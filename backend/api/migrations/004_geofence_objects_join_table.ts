import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Migration 004 — Geofence ↔ Atomic Object join table
 *
 * Replaces the legacy `hub.geofences.associated_objects uuid[]` array column
 * with a proper many-to-many join table. This enables:
 *   - Cascade deletes: removing a geofence or an object cleans up links automatically
 *   - Reverse lookup: which geofences reference a given object
 *   - Duplicate prevention via PRIMARY KEY constraint
 *   - Consistent add/remove semantics via API
 *
 * The legacy `associated_objects` column is left in place; existing data is
 * migrated to the join table. New code writes to/reads from geofence_objects only.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    { schema: 'hub', name: 'geofence_objects' },
    {
      geofence_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'hub', name: 'geofences', column: 'id' },
        onDelete: 'CASCADE',
      },
      object_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'hub', name: 'atomic_objects', column: 'id' },
        onDelete: 'CASCADE',
      },
      created_at: {
        type: 'timestamptz',
        notNull: true,
        default: pgm.func('current_timestamp'),
      },
    }
  );

  // Composite primary key prevents duplicate links
  pgm.addConstraint(
    { schema: 'hub', name: 'geofence_objects' },
    'geofence_objects_pkey',
    'PRIMARY KEY (geofence_id, object_id)'
  );

  // Index for reverse lookup: given an object_id, find all geofences that reference it
  pgm.createIndex(
    { schema: 'hub', name: 'geofence_objects' },
    'object_id',
    { name: 'idx_geofence_objects_object_id' }
  );

  // Index for forward lookup ordered by link time
  pgm.createIndex(
    { schema: 'hub', name: 'geofence_objects' },
    ['geofence_id', 'created_at'],
    { name: 'idx_geofence_objects_geofence_created' }
  );

  // Migrate existing data from the legacy `associated_objects uuid[]` column.
  // cardinality() returns 0 for empty arrays (array_length returns NULL for empty).
  pgm.sql(`
    INSERT INTO hub.geofence_objects (geofence_id, object_id)
    SELECT g.id, unnest(g.associated_objects)
    FROM hub.geofences g
    WHERE cardinality(g.associated_objects) > 0
    ON CONFLICT DO NOTHING
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable({ schema: 'hub', name: 'geofence_objects' }, { ifExists: true });
}
