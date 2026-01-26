import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Enable required extensions
  pgm.createExtension('uuid-ossp', { ifNotExists: true });
  pgm.createExtension('pgcrypto', { ifNotExists: true });
  pgm.createExtension('pg_trgm', { ifNotExists: true });

  // Create schemas
  pgm.createSchema('hub', { ifNotExists: true });
  pgm.createSchema('hub_audit', { ifNotExists: true });

  // Users table
  pgm.createTable(
    { schema: 'hub', name: 'users' },
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('uuid_generate_v4()'),
      },
      email: {
        type: 'varchar(255)',
        notNull: true,
        unique: true,
      },
      password_hash: {
        type: 'varchar(255)',
        notNull: true,
      },
      created_at: {
        type: 'timestamp',
        notNull: true,
        default: pgm.func('current_timestamp'),
      },
      updated_at: {
        type: 'timestamp',
        notNull: true,
        default: pgm.func('current_timestamp'),
      },
    }
  );

  pgm.createIndex({ schema: 'hub', name: 'users' }, 'email', { unique: true });

  // Atomic Objects table
  pgm.createTable(
    { schema: 'hub', name: 'atomic_objects' },
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
      content: {
        type: 'text',
        notNull: true,
      },
      category: {
        type: 'text[]',
        notNull: true,
        default: '{}',
      },
      confidence: {
        type: 'decimal(3,2)',
        notNull: true,
        default: 0.5,
        check: 'confidence >= 0 AND confidence <= 1',
      },
      source_type: {
        type: 'varchar(20)',
        notNull: true,
        check: "source_type IN ('voice', 'text', 'import')",
      },
      source_recording_id: {
        type: 'uuid',
        references: { schema: 'hub', name: 'sessions', column: 'id' },
      },
      source_timestamp: {
        type: 'timestamp',
        notNull: true,
        default: pgm.func('current_timestamp'),
      },
      source_location_latitude: {
        type: 'decimal(10,8)',
      },
      source_location_longitude: {
        type: 'decimal(11,8)',
      },
      source_location_accuracy: {
        type: 'decimal(10,2)',
      },
      source_location_altitude: {
        type: 'decimal(10,2)',
      },
      metadata_entities: {
        type: 'jsonb',
        default: '[]',
      },
      metadata_sentiment: {
        type: 'varchar(10)',
        check: "metadata_sentiment IN ('positive', 'neutral', 'negative')",
      },
      metadata_urgency: {
        type: 'varchar(10)',
        check: "metadata_urgency IN ('low', 'medium', 'high')",
      },
      metadata_tags: {
        type: 'text[]',
        default: '{}',
      },
      relationships_related_objects: {
        type: 'uuid[]',
        default: '{}',
      },
      relationships_contradictions: {
        type: 'uuid[]',
        default: '{}',
      },
      relationships_references: {
        type: 'uuid[]',
        default: '{}',
      },
      created_at: {
        type: 'timestamp',
        notNull: true,
        default: pgm.func('current_timestamp'),
      },
      updated_at: {
        type: 'timestamp',
        notNull: true,
        default: pgm.func('current_timestamp'),
      },
    }
  );

  pgm.createIndex({ schema: 'hub', name: 'atomic_objects' }, 'user_id');
  pgm.createIndex({ schema: 'hub', name: 'atomic_objects' }, 'created_at');
  pgm.createIndex({ schema: 'hub', name: 'atomic_objects' }, 'category', {
    method: 'gin',
  });
  pgm.createIndex({ schema: 'hub', name: 'atomic_objects' }, 'metadata_tags', {
    method: 'gin',
  });
  pgm.createIndex(
    { schema: 'hub', name: 'atomic_objects' },
    'content',
    { method: 'gin', using: 'gin_trgm_ops' }
  );

  // Geofences table
  pgm.createTable(
    { schema: 'hub', name: 'geofences' },
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
      name: {
        type: 'varchar(255)',
        notNull: true,
      },
      center_latitude: {
        type: 'decimal(10,8)',
        notNull: true,
      },
      center_longitude: {
        type: 'decimal(11,8)',
        notNull: true,
      },
      center_accuracy: {
        type: 'decimal(10,2)',
      },
      center_altitude: {
        type: 'decimal(10,2)',
      },
      radius: {
        type: 'integer',
        notNull: true,
        comment: 'Radius in meters',
      },
      type: {
        type: 'varchar(20)',
        notNull: true,
        check: "type IN ('home', 'work', 'gym', 'custom')",
      },
      associated_objects: {
        type: 'uuid[]',
        default: '{}',
      },
      notification_enabled: {
        type: 'boolean',
        notNull: true,
        default: false,
      },
      notification_on_enter: {
        type: 'boolean',
        notNull: true,
        default: false,
      },
      notification_on_exit: {
        type: 'boolean',
        notNull: true,
        default: false,
      },
      notification_quiet_hours_start: {
        type: 'time',
      },
      notification_quiet_hours_end: {
        type: 'time',
      },
      created_at: {
        type: 'timestamp',
        notNull: true,
        default: pgm.func('current_timestamp'),
      },
      updated_at: {
        type: 'timestamp',
        notNull: true,
        default: pgm.func('current_timestamp'),
      },
    }
  );

  pgm.createIndex({ schema: 'hub', name: 'geofences' }, 'user_id');
  pgm.createIndex({ schema: 'hub', name: 'geofences' }, 'type');

  // Sessions table (for voice recording sessions)
  pgm.createTable(
    { schema: 'hub', name: 'sessions' },
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
      device_id: {
        type: 'varchar(255)',
        notNull: true,
      },
      location_latitude: {
        type: 'decimal(10,8)',
      },
      location_longitude: {
        type: 'decimal(11,8)',
      },
      location_accuracy: {
        type: 'decimal(10,2)',
      },
      location_altitude: {
        type: 'decimal(10,2)',
      },
      metadata: {
        type: 'jsonb',
        default: '{}',
      },
      status: {
        type: 'varchar(20)',
        notNull: true,
        default: 'recording',
        check: "status IN ('recording', 'processing', 'completed', 'failed')",
      },
      created_at: {
        type: 'timestamp',
        notNull: true,
        default: pgm.func('current_timestamp'),
      },
      updated_at: {
        type: 'timestamp',
        notNull: true,
        default: pgm.func('current_timestamp'),
      },
    }
  );

  pgm.createIndex({ schema: 'hub', name: 'sessions' }, 'user_id');
  pgm.createIndex({ schema: 'hub', name: 'sessions' }, 'status');
  pgm.createIndex({ schema: 'hub', name: 'sessions' }, 'created_at');

  // Audit log table
  pgm.createTable(
    { schema: 'hub_audit', name: 'audit_log' },
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('uuid_generate_v4()'),
      },
      user_id: {
        type: 'uuid',
        references: { schema: 'hub', name: 'users', column: 'id' },
        onDelete: 'SET NULL',
      },
      action: {
        type: 'varchar(50)',
        notNull: true,
      },
      resource_type: {
        type: 'varchar(50)',
        notNull: true,
      },
      resource_id: {
        type: 'uuid',
      },
      details: {
        type: 'jsonb',
        default: '{}',
      },
      ip_address: {
        type: 'inet',
      },
      user_agent: {
        type: 'text',
      },
      created_at: {
        type: 'timestamp',
        notNull: true,
        default: pgm.func('current_timestamp'),
      },
    }
  );

  pgm.createIndex({ schema: 'hub_audit', name: 'audit_log' }, 'user_id');
  pgm.createIndex({ schema: 'hub_audit', name: 'audit_log' }, 'action');
  pgm.createIndex({ schema: 'hub_audit', name: 'audit_log' }, 'resource_type');
  pgm.createIndex({ schema: 'hub_audit', name: 'audit_log' }, 'created_at');

  // Create updated_at trigger function
  pgm.createFunction(
    'update_updated_at_column',
    [],
    {
      returns: 'trigger',
      language: 'plpgsql',
      replace: true,
    },
    `
    BEGIN
      NEW.updated_at = current_timestamp;
      RETURN NEW;
    END;
    `
  );

  // Add triggers for updated_at
  pgm.createTrigger(
    { schema: 'hub', name: 'users' },
    'update_users_updated_at',
    {
      when: 'BEFORE',
      operation: 'UPDATE',
      function: 'update_updated_at_column',
      level: 'ROW',
    }
  );

  pgm.createTrigger(
    { schema: 'hub', name: 'atomic_objects' },
    'update_atomic_objects_updated_at',
    {
      when: 'BEFORE',
      operation: 'UPDATE',
      function: 'update_updated_at_column',
      level: 'ROW',
    }
  );

  pgm.createTrigger(
    { schema: 'hub', name: 'geofences' },
    'update_geofences_updated_at',
    {
      when: 'BEFORE',
      operation: 'UPDATE',
      function: 'update_updated_at_column',
      level: 'ROW',
    }
  );

  pgm.createTrigger(
    { schema: 'hub', name: 'sessions' },
    'update_sessions_updated_at',
    {
      when: 'BEFORE',
      operation: 'UPDATE',
      function: 'update_updated_at_column',
      level: 'ROW',
    }
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop triggers
  pgm.dropTrigger({ schema: 'hub', name: 'sessions' }, 'update_sessions_updated_at', {
    ifExists: true,
  });
  pgm.dropTrigger(
    { schema: 'hub', name: 'geofences' },
    'update_geofences_updated_at',
    { ifExists: true }
  );
  pgm.dropTrigger(
    { schema: 'hub', name: 'atomic_objects' },
    'update_atomic_objects_updated_at',
    { ifExists: true }
  );
  pgm.dropTrigger({ schema: 'hub', name: 'users' }, 'update_users_updated_at', {
    ifExists: true,
  });

  // Drop function
  pgm.dropFunction('update_updated_at_column', [], { ifExists: true });

  // Drop tables
  pgm.dropTable({ schema: 'hub_audit', name: 'audit_log' }, { ifExists: true });
  pgm.dropTable({ schema: 'hub', name: 'sessions' }, { ifExists: true });
  pgm.dropTable({ schema: 'hub', name: 'geofences' }, { ifExists: true });
  pgm.dropTable({ schema: 'hub', name: 'atomic_objects' }, { ifExists: true });
  pgm.dropTable({ schema: 'hub', name: 'users' }, { ifExists: true });

  // Drop schemas
  pgm.dropSchema('hub_audit', { ifExists: true });
  pgm.dropSchema('hub', { ifExists: true });

  // Drop extensions (optional - may be used by other databases)
  // pgm.dropExtension('pg_trgm', { ifExists: true });
  // pgm.dropExtension('pgcrypto', { ifExists: true });
  // pgm.dropExtension('uuid-ossp', { ifExists: true });
}
