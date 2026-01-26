const { Client } = require('pg');
require('dotenv').config();

async function runMigration() {
  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'thehub_dev',
    user: process.env.POSTGRES_USER || 'hub_user',
    password: String(process.env.POSTGRES_PASSWORD || 'hub_dev_password'),
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Check if users table exists
    const checkTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'hub'
        AND table_name = 'users'
      );
    `);

    if (checkTable.rows[0].exists) {
      console.log('Tables already exist');
      await client.end();
      return;
    }

    console.log('Creating schemas...');
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
    await client.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm";`);
    await client.query(`CREATE SCHEMA IF NOT EXISTS hub;`);
    await client.query(`CREATE SCHEMA IF NOT EXISTS hub_audit;`);

    console.log('Creating users table...');
    await client.query(`
      CREATE TABLE hub.users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
        updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
      );
    `);

    await client.query(`CREATE UNIQUE INDEX idx_users_email ON hub.users(email);`);

    console.log('Creating sessions table...');
    await client.query(`
      CREATE TABLE hub.sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
        device_id VARCHAR(255) NOT NULL,
        location_latitude DECIMAL(10,8),
        location_longitude DECIMAL(11,8),
        location_accuracy DECIMAL(10,2),
        location_altitude DECIMAL(10,2),
        metadata JSONB DEFAULT '{}',
        status VARCHAR(20) NOT NULL DEFAULT 'recording' CHECK (status IN ('recording', 'processing', 'completed', 'failed')),
        created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
        updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
      );
    `);

    await client.query(`CREATE INDEX idx_sessions_user_id ON hub.sessions(user_id);`);
    await client.query(`CREATE INDEX idx_sessions_status ON hub.sessions(status);`);
    await client.query(`CREATE INDEX idx_sessions_created_at ON hub.sessions(created_at);`);

    console.log('Creating atomic_objects table...');
    await client.query(`
      CREATE TABLE hub.atomic_objects (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        category TEXT[] NOT NULL DEFAULT '{}',
        confidence DECIMAL(3,2) NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
        source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('voice', 'text', 'import')),
        source_recording_id UUID REFERENCES hub.sessions(id),
        source_timestamp TIMESTAMP NOT NULL DEFAULT current_timestamp,
        source_location_latitude DECIMAL(10,8),
        source_location_longitude DECIMAL(11,8),
        source_location_accuracy DECIMAL(10,2),
        source_location_altitude DECIMAL(10,2),
        metadata_entities JSONB DEFAULT '[]',
        metadata_sentiment VARCHAR(10) CHECK (metadata_sentiment IN ('positive', 'neutral', 'negative')),
        metadata_urgency VARCHAR(10) CHECK (metadata_urgency IN ('low', 'medium', 'high')),
        metadata_tags TEXT[] DEFAULT '{}',
        relationships_related_objects UUID[] DEFAULT '{}',
        relationships_contradictions UUID[] DEFAULT '{}',
        relationships_references UUID[] DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
        updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
      );
    `);

    await client.query(`CREATE INDEX idx_atomic_objects_user_id ON hub.atomic_objects(user_id);`);
    await client.query(`CREATE INDEX idx_atomic_objects_created_at ON hub.atomic_objects(created_at);`);
    await client.query(`CREATE INDEX idx_atomic_objects_category ON hub.atomic_objects USING gin(category);`);
    await client.query(`CREATE INDEX idx_atomic_objects_tags ON hub.atomic_objects USING gin(metadata_tags);`);
    await client.query(`CREATE INDEX idx_atomic_objects_content ON hub.atomic_objects USING gin(content gin_trgm_ops);`);

    console.log('Creating geofences table...');
    await client.query(`
      CREATE TABLE hub.geofences (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES hub.users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        center_latitude DECIMAL(10,8) NOT NULL,
        center_longitude DECIMAL(11,8) NOT NULL,
        center_accuracy DECIMAL(10,2),
        center_altitude DECIMAL(10,2),
        radius INTEGER NOT NULL,
        type VARCHAR(20) NOT NULL CHECK (type IN ('home', 'work', 'gym', 'custom')),
        associated_objects UUID[] DEFAULT '{}',
        notification_enabled BOOLEAN NOT NULL DEFAULT false,
        notification_on_enter BOOLEAN NOT NULL DEFAULT false,
        notification_on_exit BOOLEAN NOT NULL DEFAULT false,
        notification_quiet_hours_start TIME,
        notification_quiet_hours_end TIME,
        created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
        updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp
      );
    `);

    await client.query(`CREATE INDEX idx_geofences_user_id ON hub.geofences(user_id);`);
    await client.query(`CREATE INDEX idx_geofences_type ON hub.geofences(type);`);

    console.log('Creating audit_log table...');
    await client.query(`
      CREATE TABLE hub_audit.audit_log (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES hub.users(id) ON DELETE SET NULL,
        action VARCHAR(50) NOT NULL,
        resource_type VARCHAR(50) NOT NULL,
        resource_id UUID,
        details JSONB DEFAULT '{}',
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT current_timestamp
      );
    `);

    await client.query(`CREATE INDEX idx_audit_log_user_id ON hub_audit.audit_log(user_id);`);
    await client.query(`CREATE INDEX idx_audit_log_action ON hub_audit.audit_log(action);`);
    await client.query(`CREATE INDEX idx_audit_log_resource_type ON hub_audit.audit_log(resource_type);`);
    await client.query(`CREATE INDEX idx_audit_log_created_at ON hub_audit.audit_log(created_at);`);

    console.log('Creating triggers...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = current_timestamp;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await client.query(`CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON hub.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`);
    await client.query(`CREATE TRIGGER update_atomic_objects_updated_at BEFORE UPDATE ON hub.atomic_objects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`);
    await client.query(`CREATE TRIGGER update_geofences_updated_at BEFORE UPDATE ON hub.geofences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`);
    await client.query(`CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON hub.sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`);

    console.log('Migration completed successfully!');
    await client.end();
  } catch (error) {
    console.error('Migration failed:', error);
    await client.end();
    process.exit(1);
  }
}

runMigration();
