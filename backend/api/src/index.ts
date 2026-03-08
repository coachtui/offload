/**
 * The Hub API Service
 * Main entry point for the Node.js API server
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { testConnection, closePool } from './db/connection';
import {
  testWeaviateConnection,
  initializeWeaviateSchema,
} from './db/weaviate';
import { initializeStorage, testStorageConnection } from './services/storageService';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server
const server = createServer(app);

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', async (req, res) => {
  const dbConnected = await testConnection();
  const weaviateConnected = await testWeaviateConnection();
  const storageConnected = await testStorageConnection();
  const deepgramConfigured = !!process.env.DEEPGRAM_API_KEY;

  const allConnected = dbConnected && weaviateConnected && storageConnected;
  const someConnected = dbConnected || weaviateConnected || storageConnected;

  const status = allConnected ? 'ok' : someConnected ? 'degraded' : 'error';

  res.json({
    status,
    service: 'thehub-api',
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'disconnected',
    vectorDb: weaviateConnected ? 'connected' : 'disconnected',
    storage: storageConnected ? 'connected' : 'disconnected',
    deepgram: deepgramConfigured ? 'configured' : 'not configured',
  });
});

// Jobs
import { startEmbeddingRetryJob } from './jobs/embeddingRetry';
import { startRetentionJob } from './jobs/retentionJob';

// API routes
import authRoutes from './routes/auth';
import objectRoutes from './routes/objects';
import geofenceRoutes from './routes/geofences';
import voiceRoutes from './routes/voice';
import ragRoutes from './routes/rag';
import synthesisRoutes from './routes/synthesis';
import placesRoutes from './routes/places';

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/objects', objectRoutes);
app.use('/api/v1/geofences', geofenceRoutes);
app.use('/api/v1/voice', voiceRoutes);
app.use('/api/v1/rag', ragRoutes);
app.use('/api/v1/synthesis', synthesisRoutes);
app.use('/api/v1/places', placesRoutes);

app.get('/api/v1', (req, res) => {
  res.json({
    message: 'The Hub API v1',
    version: '0.4.0',
    endpoints: {
      health: '/health',
      auth: '/api/v1/auth',
      objects: '/api/v1/objects',
      geofences: '/api/v1/geofences',
      voice: '/api/v1/voice',
      rag: '/api/v1/rag',
      places: '/api/v1/places',
    },
  });
});

// Error handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error('Error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message:
        process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
async function gracefulShutdown() {
  console.log('Shutting down gracefully...');

  // Close database connections
  await closePool();

  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
server.listen(PORT, async () => {
  console.log(`🚀 The Hub API server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);

  // Test database connection
  await testConnection();

  // Test Weaviate connection and initialize schema
  const weaviateConnected = await testWeaviateConnection();
  if (weaviateConnected) {
    try {
      await initializeWeaviateSchema();
    } catch (error) {
      console.error('⚠️  Failed to initialize Weaviate schema:', error);
    }
  } else {
    console.warn('⚠️  Weaviate not available - semantic search will be disabled');
  }

  // Initialize MinIO storage
  const storageConnected = await testStorageConnection();
  if (storageConnected) {
    try {
      await initializeStorage();
    } catch (error) {
      console.error('⚠️  Failed to initialize MinIO storage:', error);
    }
  } else {
    console.warn('⚠️  MinIO not available - audio storage will be disabled');
  }

  // Check Deepgram API key
  if (process.env.DEEPGRAM_API_KEY) {
    console.log('✅ Deepgram API configured');
  } else {
    console.warn('⚠️  DEEPGRAM_API_KEY not set - voice transcription will not work');
  }

  // Start background jobs
  startEmbeddingRetryJob();
  startRetentionJob();
});
