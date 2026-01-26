/**
 * node-pg-migrate configuration
 */

const path = require('path');

// Load .env from backend/api directory
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

module.exports = {
  databaseUrl: process.env.DATABASE_URL || `postgresql://${process.env.POSTGRES_USER || 'hub_user'}:${process.env.POSTGRES_PASSWORD || 'hub_dev_password'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'thehub_dev'}`,
  migrationsTable: 'pgmigrations',
  migrationsDirectory: './migrations',
  typescript: true,
};
