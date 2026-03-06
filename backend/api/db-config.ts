import { ClientConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const config: ClientConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'thehub_dev',
  user: process.env.POSTGRES_USER || 'hub_user',
  password: process.env.POSTGRES_PASSWORD || 'hub_dev_password',
};

export default config;
