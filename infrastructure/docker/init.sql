-- Initialize PostgreSQL database for The Hub
-- This script runs on first container start

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search

-- Create schemas
CREATE SCHEMA IF NOT EXISTS hub;
CREATE SCHEMA IF NOT EXISTS hub_audit; -- For audit logging

-- Set default schema
SET search_path TO hub, public;

-- Note: Actual table creation will be handled by migrations
-- This file is for initial setup only
