# API Documentation

## Base URL

- **Development**: `http://localhost:3000`
- **Production**: `https://api.thehub.app`

## Authentication

Most endpoints require authentication via JWT token:

```
Authorization: Bearer <token>
```

## API Versioning

All endpoints are versioned: `/api/v1/...`

## Endpoints

### Health Check

```
GET /health
```

Returns service status.

**Response:**
```json
{
  "status": "ok",
  "service": "thehub-api",
  "timestamp": "2026-01-23T10:00:00Z"
}
```

### Voice Intake

#### Start Recording Session

```
POST /api/v1/voice/start
```

**Request:**
```json
{
  "deviceId": "device-uuid",
  "location": {
    "latitude": 37.7749,
    "longitude": -122.4194
  },
  "metadata": {}
}
```

**Response:**
```json
{
  "sessionId": "session-uuid",
  "uploadUrl": "https://..."
}
```

#### Upload Audio Chunk

```
POST /api/v1/voice/upload
```

**Request:** Multipart form data
- `sessionId`: string
- `audioChunk`: File (audio/wav, audio/mp3, etc.)

**Response:**
```json
{
  "transcript": "Partial transcript...",
  "partial": true
}
```

#### Complete Recording

```
POST /api/v1/voice/complete
```

**Request:**
```json
{
  "sessionId": "session-uuid"
}
```

**Response:**
```json
{
  "atomicObjects": [
    {
      "id": "object-uuid",
      "content": "...",
      "category": ["business", "fitness"],
      ...
    }
  ]
}
```

### Atomic Objects

#### List Objects

```
GET /api/v1/objects
```

**Query Parameters:**
- `category`: Filter by category
- `dateFrom`: ISO date string
- `dateTo`: ISO date string
- `location`: GeoPoint (lat,lon,radius)
- `search`: Text search query
- `limit`: Number of results (default: 25)
- `offset`: Pagination offset

**Response:**
```json
{
  "objects": [...],
  "total": 100,
  "limit": 25,
  "offset": 0
}
```

#### Get Object

```
GET /api/v1/objects/:id
```

**Response:**
```json
{
  "object": {...},
  "related": [...]
}
```

#### Create Object

```
POST /api/v1/objects
```

**Request:**
```json
{
  "content": "Text content...",
  "category": ["business"],
  "source": {
    "type": "text",
    "location": {...}
  }
}
```

#### Update Object

```
PUT /api/v1/objects/:id
```

#### Delete Object

```
DELETE /api/v1/objects/:id
```

### Geofencing

#### List Geofences

```
GET /api/v1/geofences
```

#### Create Geofence

```
POST /api/v1/geofences
```

**Request:**
```json
{
  "name": "Gold's Gym",
  "center": {
    "latitude": 37.7749,
    "longitude": -122.4194
  },
  "radius": 100,
  "type": "gym"
}
```

#### Check Location

```
POST /api/v1/geofences/check
```

**Request:**
```json
{
  "location": {
    "latitude": 37.7749,
    "longitude": -122.4194
  }
}
```

**Response:**
```json
{
  "activeGeofences": [...],
  "relevantObjects": [...]
}
```

### AI / RAG

#### Query

```
POST /api/v1/ai/query
```

**Request:**
```json
{
  "query": "What did I say about my gym routine?",
  "context": {
    "location": {...},
    "time": "2026-01-23T10:00:00Z"
  }
}
```

**Response:**
```json
{
  "answer": "...",
  "sources": [...],
  "confidence": 0.95
}
```

#### Validate Object

```
POST /api/v1/ai/validate
```

**Request:**
```json
{
  "objectId": "object-uuid"
}
```

**Response:**
```json
{
  "contradictions": [...],
  "suggestions": [...]
}
```

## WebSocket API

### Connection

```
wss://api.thehub.app/v1/ws
```

### Authentication

Send auth message after connection:
```json
{
  "type": "auth",
  "token": "jwt-token"
}
```

### Events

#### Location Update
```json
{
  "type": "location_update",
  "payload": {
    "location": {...},
    "activeGeofences": [...]
  }
}
```

#### Geofence Entered
```json
{
  "type": "geofence_entered",
  "payload": {
    "geofence": {...},
    "relevantObjects": [...]
  }
}
```

#### Transcription Update
```json
{
  "type": "transcription_update",
  "payload": {
    "sessionId": "...",
    "transcript": "...",
    "partial": true
  }
}
```

## Error Responses

All errors follow this format:

```json
{
  "error": "Error code",
  "message": "Human-readable message",
  "details": {}
}
```

### Status Codes

- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Internal Server Error
- `501`: Not Implemented

## Rate Limiting

- **Default**: 100 requests/minute per user
- **Voice Upload**: 10 requests/minute
- **AI Queries**: 20 requests/minute

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Pagination

List endpoints support pagination:

```
GET /api/v1/objects?limit=25&offset=0
```

Response includes:
```json
{
  "objects": [...],
  "total": 100,
  "limit": 25,
  "offset": 0,
  "hasMore": true
}
```

## Filtering & Search

### Text Search
```
GET /api/v1/objects?search= gym routine
```

### Category Filter
```
GET /api/v1/objects?category=business&category=fitness
```

### Date Range
```
GET /api/v1/objects?dateFrom=2026-01-01&dateTo=2026-01-31
```

### Location Proximity
```
GET /api/v1/objects?location=37.7749,-122.4194,1000
```
(Format: lat,lon,radius_in_meters)

## Examples

See [examples/](./examples/) directory for code examples in various languages.
