/**
 * MinIO Storage Service for audio file management
 */

import * as Minio from 'minio';
import { Readable } from 'stream';

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000', 10);
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'minioadmin';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'minioadmin123';
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true';
const AUDIO_BUCKET = process.env.MINIO_BUCKET || 'hub-audio';

let minioClient: Minio.Client | null = null;

/**
 * Get or create MinIO client
 */
function getClient(): Minio.Client {
  if (!minioClient) {
    minioClient = new Minio.Client({
      endPoint: MINIO_ENDPOINT,
      port: MINIO_PORT,
      useSSL: MINIO_USE_SSL,
      accessKey: MINIO_ACCESS_KEY,
      secretKey: MINIO_SECRET_KEY,
    });
  }
  return minioClient;
}

/**
 * Initialize storage bucket
 */
export async function initializeStorage(): Promise<boolean> {
  try {
    const client = getClient();
    const bucketExists = await client.bucketExists(AUDIO_BUCKET);

    if (!bucketExists) {
      await client.makeBucket(AUDIO_BUCKET);
      console.log(`✅ Created MinIO bucket: ${AUDIO_BUCKET}`);
    } else {
      console.log(`✅ MinIO bucket exists: ${AUDIO_BUCKET}`);
    }

    return true;
  } catch (error) {
    console.error('❌ Failed to initialize MinIO storage:', error);
    return false;
  }
}

/**
 * Test MinIO connection
 */
export async function testStorageConnection(): Promise<boolean> {
  try {
    const client = getClient();
    await client.listBuckets();
    return true;
  } catch (error) {
    console.error('MinIO connection failed:', error);
    return false;
  }
}

/**
 * Upload audio file
 */
export async function uploadAudio(
  sessionId: string,
  audioData: Buffer,
  contentType: string = 'audio/webm'
): Promise<string> {
  const client = getClient();
  const objectName = `sessions/${sessionId}/audio.webm`;

  const metadata = {
    'Content-Type': contentType,
    'X-Session-Id': sessionId,
    'X-Upload-Time': new Date().toISOString(),
  };

  await client.putObject(AUDIO_BUCKET, objectName, audioData, audioData.length, metadata);

  return objectName;
}

/**
 * Upload audio chunk (for streaming uploads)
 */
export async function uploadAudioChunk(
  sessionId: string,
  chunkIndex: number,
  audioData: Buffer,
  contentType: string = 'audio/webm'
): Promise<string> {
  const client = getClient();
  const objectName = `sessions/${sessionId}/chunks/chunk_${chunkIndex.toString().padStart(5, '0')}.webm`;

  const metadata = {
    'Content-Type': contentType,
    'X-Session-Id': sessionId,
    'X-Chunk-Index': chunkIndex.toString(),
    'X-Upload-Time': new Date().toISOString(),
  };

  await client.putObject(AUDIO_BUCKET, objectName, audioData, audioData.length, metadata);

  return objectName;
}

/**
 * Get audio file as buffer
 */
export async function getAudio(objectName: string): Promise<Buffer> {
  const client = getClient();
  const stream = await client.getObject(AUDIO_BUCKET, objectName);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/**
 * Get audio file as stream
 */
export async function getAudioStream(objectName: string): Promise<Readable> {
  const client = getClient();
  return client.getObject(AUDIO_BUCKET, objectName);
}

/**
 * Generate presigned URL for audio playback
 */
export async function getAudioUrl(
  sessionId: string,
  expirySeconds: number = 3600
): Promise<string> {
  const client = getClient();
  const objectName = `sessions/${sessionId}/audio.webm`;

  return client.presignedGetObject(AUDIO_BUCKET, objectName, expirySeconds);
}

/**
 * List audio chunks for a session
 */
export async function listAudioChunks(sessionId: string): Promise<string[]> {
  const client = getClient();
  const prefix = `sessions/${sessionId}/chunks/`;
  const chunks: string[] = [];

  return new Promise((resolve, reject) => {
    const stream = client.listObjects(AUDIO_BUCKET, prefix, true);
    stream.on('data', (obj) => {
      if (obj.name) {
        chunks.push(obj.name);
      }
    });
    stream.on('end', () => resolve(chunks.sort()));
    stream.on('error', reject);
  });
}

/**
 * Merge audio chunks into final file
 */
export async function mergeAudioChunks(sessionId: string): Promise<string> {
  const chunks = await listAudioChunks(sessionId);

  if (chunks.length === 0) {
    throw new Error('No audio chunks found for session');
  }

  // Fetch all chunks
  const chunkBuffers: Buffer[] = [];
  for (const chunkName of chunks) {
    const buffer = await getAudio(chunkName);
    chunkBuffers.push(buffer);
  }

  // Merge and upload
  const mergedAudio = Buffer.concat(chunkBuffers);
  const finalPath = await uploadAudio(sessionId, mergedAudio);

  return finalPath;
}

/**
 * Delete audio files for a session
 */
export async function deleteSessionAudio(sessionId: string): Promise<void> {
  const client = getClient();
  const prefix = `sessions/${sessionId}/`;

  const objectsToDelete: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const stream = client.listObjects(AUDIO_BUCKET, prefix, true);
    stream.on('data', (obj) => {
      if (obj.name) {
        objectsToDelete.push(obj.name);
      }
    });
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });

  if (objectsToDelete.length > 0) {
    await client.removeObjects(AUDIO_BUCKET, objectsToDelete);
  }
}

/**
 * Get storage stats for a session
 */
export async function getSessionStorageStats(
  sessionId: string
): Promise<{ totalSize: number; chunkCount: number }> {
  const client = getClient();
  const prefix = `sessions/${sessionId}/`;

  let totalSize = 0;
  let chunkCount = 0;

  await new Promise<void>((resolve, reject) => {
    const stream = client.listObjects(AUDIO_BUCKET, prefix, true);
    stream.on('data', (obj) => {
      if (obj.size) {
        totalSize += obj.size;
        if (obj.name?.includes('/chunks/')) {
          chunkCount++;
        }
      }
    });
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });

  return { totalSize, chunkCount };
}
