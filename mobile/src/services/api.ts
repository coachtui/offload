import * as SecureStore from 'expo-secure-store';
import {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  VoiceSession,
  AtomicObject,
} from '../types';

// Synthesis type
export interface WeeklySynthesis {
  sessionId: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  objectCount: number;
  domainBreakdown: Record<string, number>;
  narrative: string;
  patterns: string[];
  openThreads: string[];
  contradictions: string[];
  actionableInsights: string[];
  citedIds: string[];
}

// Backend response types
interface SessionsListResponse {
  sessions: VoiceSession[];
  total: number;
  limit: number;
  offset: number;
}

interface SessionDetailResponse {
  session: VoiceSession;
  isActive: boolean;
  currentTranscript?: string;
  chunkCount?: number;
  duration?: number;
}

interface AudioUrlResponse {
  audioUrl: string;
  expiresIn: number;
}

interface ObjectsListResponse {
  objects: AtomicObject[];
  total: number;
  limit: number;
  offset: number;
}

export interface RagSearchResult {
  score: number;
  objectId: string;
  title: string | null;
  cleanedText: string;
  type: string;
  domain: string;
  tags: string[];
  isActionable: boolean;
  nextAction: string | null;
  temporalHints?: { hasDate: boolean; dateText: string | null; urgency: string | null };
  createdAt: string;
  sourceTranscriptId: string | null;
}

export interface SparResponse {
  answer: string;
  citedIds: string[];
  themes: string[];
  hasContradictions: boolean;
  gaps: string[];
  contextPack: any;
}

export interface ConflictItem {
  objectId: string;
  description: string;
  confidence: number;
}

export interface ContradictionResult {
  hasConflict: boolean;
  conflicts: ConflictItem[];
  explanation: string | null;
}

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Thrown when the server returns 401.
 * Callers (especially AuthContext) can catch this specifically to force logout.
 */
export class AuthError extends Error {
  readonly status = 401;
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

class ApiService {
  private accessToken: string | null = null;

  async init(): Promise<void> {
    this.accessToken = await SecureStore.getItemAsync('accessToken');
    console.log('[ApiService] init — token present:', !!this.accessToken);
  }

  /**
   * Returns the current token.
   * Falls back to SecureStore if in-memory token is null (e.g. after hot-reload).
   */
  private async resolveToken(): Promise<string | null> {
    if (this.accessToken) return this.accessToken;
    const stored = await SecureStore.getItemAsync('accessToken');
    if (stored) {
      this.accessToken = stored; // re-hydrate memory
    }
    return stored;
  }

  private async getHeaders(): Promise<HeadersInit> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    const token = await this.resolveToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Core request helper.
   * On 401: clears stored token and throws AuthError so callers can trigger logout.
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs = 30000
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = await this.getHeaders();

    console.log(`[ApiService] ${options.method || 'GET'} ${endpoint} — auth: ${!!headers['Authorization']}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...options.headers,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401) {
      // Token is invalid or expired — clear it and signal AuthError
      console.warn(`[ApiService] 401 on ${endpoint} — clearing stored token`);
      await this.clearToken();
      const body = await response.json().catch(() => ({}));
      throw new AuthError(body.message || 'Session expired. Please log in again.');
    }

    if (!response.ok) {
      // Accept either { message } or { error } as the human-readable string.
      // Fall back to the raw text if the body isn't JSON, then to a generic label.
      let errorMessage = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        errorMessage = body.message || body.error || errorMessage;
      } catch {
        const text = await response.text().catch(() => '');
        if (text) errorMessage = text.slice(0, 200);
      }
      console.error(`[ApiService] ${response.status} on ${endpoint}:`, errorMessage);
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // Auth methods
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    this.accessToken = response.accessToken;
    await SecureStore.setItemAsync('accessToken', response.accessToken);
    if (response.refreshToken) {
      await SecureStore.setItemAsync('refreshToken', response.refreshToken);
    }
    console.log('[ApiService] login — token stored, length:', response.accessToken.length);

    return response;
  }

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    this.accessToken = response.accessToken;
    await SecureStore.setItemAsync('accessToken', response.accessToken);
    if (response.refreshToken) {
      await SecureStore.setItemAsync('refreshToken', response.refreshToken);
    }

    return response;
  }

  async logout(): Promise<void> {
    await this.clearToken();
  }

  async clearToken(): Promise<void> {
    this.accessToken = null;
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
  }

  async getStoredToken(): Promise<string | null> {
    return SecureStore.getItemAsync('accessToken');
  }

  setToken(token: string): void {
    this.accessToken = token;
  }

  // Voice Session methods
  async getSessions(limit = 20, offset = 0, status?: string): Promise<SessionsListResponse> {
    let url = `/api/v1/voice/sessions?limit=${limit}&offset=${offset}`;
    if (status) {
      url += `&status=${status}`;
    }
    return this.request<SessionsListResponse>(url);
  }

  async getSession(sessionId: string): Promise<SessionDetailResponse> {
    return this.request<SessionDetailResponse>(`/api/v1/voice/sessions/${sessionId}`);
  }

  async getSessionAudioUrl(sessionId: string): Promise<AudioUrlResponse> {
    return this.request<AudioUrlResponse>(`/api/v1/voice/sessions/${sessionId}/audio`);
  }

  // Atomic Objects methods
  async getObjects(options: {
    limit?: number;
    offset?: number;
    domain?: string[];
    objectType?: string[];
    dateFrom?: string;
    dateTo?: string;
  } = {}): Promise<ObjectsListResponse> {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());
    if (options.domain) {
      options.domain.forEach(d => params.append('domain', d));
    }
    if (options.objectType) {
      options.objectType.forEach(t => params.append('objectType', t));
    }
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);

    const queryString = params.toString();
    return this.request<ObjectsListResponse>(
      `/api/v1/objects${queryString ? `?${queryString}` : ''}`
    );
  }

  async getObject(objectId: string): Promise<{ object: AtomicObject }> {
    return this.request<{ object: AtomicObject }>(`/api/v1/objects/${objectId}`);
  }

  async updateObject(objectId: string, data: Partial<AtomicObject>): Promise<{ object: AtomicObject }> {
    return this.request<{ object: AtomicObject }>(`/api/v1/objects/${objectId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteObject(objectId: string): Promise<void> {
    await this.request<void>(`/api/v1/objects/${objectId}`, {
      method: 'DELETE',
    });
  }

  async getStaleActionables(): Promise<{ objects: AtomicObject[] }> {
    return this.request<{ objects: AtomicObject[] }>('/api/v1/objects/stale-actionables');
  }

  // Geofence methods

  /** Map backend geofence shape → mobile hook shape */
  private toMobileGeofence(g: any): any {
    return {
      ...g,
      location: g.center ?? g.location,
      enabled: g.notificationSettings?.enabled ?? false,
      notifyOnEnter: g.notificationSettings?.onEnter ?? false,
      notifyOnExit: g.notificationSettings?.onExit ?? false,
      quietHoursStart: g.notificationSettings?.quietHours?.start,
      quietHoursEnd: g.notificationSettings?.quietHours?.end,
    };
  }

  /** Map mobile hook shape → backend body shape */
  private toBackendGeofence(data: any): any {
    const { location, notifyOnEnter, notifyOnExit, quietHoursStart, quietHoursEnd, enabled, ...rest } = data;
    const result = {
      ...rest,
      ...(location ? { center: location } : {}),
      notificationSettings: {
        enabled: enabled !== undefined ? enabled : true,
        onEnter: notifyOnEnter !== undefined ? notifyOnEnter : true,
        onExit: notifyOnExit !== undefined ? notifyOnExit : false,
        ...(quietHoursStart && quietHoursEnd
          ? { quietHours: { start: quietHoursStart, end: quietHoursEnd } }
          : {}),
      },
    };
    console.log('[apiService] toBackendGeofence input:', JSON.stringify(data));
    console.log('[apiService] toBackendGeofence output:', JSON.stringify(result));
    return result;
  }

  async getGeofences(): Promise<{ geofences: any[] }> {
    const res = await this.request<{ geofences: any[] }>('/api/v1/geofences');
    return { geofences: res.geofences.map((g) => this.toMobileGeofence(g)) };
  }

  async getGeofenceObjects(geofenceId: string): Promise<{ objects: AtomicObject[] }> {
    return this.request<{ objects: AtomicObject[] }>(`/api/v1/geofences/${geofenceId}/objects`);
  }

  async createGeofence(data: any): Promise<{ geofence: any }> {
    const res = await this.request<{ geofence: any }>('/api/v1/geofences', {
      method: 'POST',
      body: JSON.stringify(this.toBackendGeofence(data)),
    });
    return { geofence: this.toMobileGeofence(res.geofence) };
  }

  async updateGeofence(id: string, data: any): Promise<{ geofence: any }> {
    const res = await this.request<{ geofence: any }>(`/api/v1/geofences/${id}`, {
      method: 'PUT',
      body: JSON.stringify(this.toBackendGeofence(data)),
    });
    return { geofence: this.toMobileGeofence(res.geofence) };
  }

  async deleteGeofence(id: string): Promise<void> {
    await this.request(`/api/v1/geofences/${id}`, {
      method: 'DELETE',
    });
  }

  /** Replace the full set of linked objects for a geofence */
  async setGeofenceObjects(geofenceId: string, objectIds: string[]): Promise<void> {
    await this.request(`/api/v1/geofences/${geofenceId}/objects`, {
      method: 'PUT',
      body: JSON.stringify({ objectIds }),
    });
  }

  /** Add a single object link to a geofence (idempotent) */
  async addGeofenceObject(geofenceId: string, objectId: string): Promise<void> {
    await this.request(`/api/v1/geofences/${geofenceId}/objects`, {
      method: 'POST',
      body: JSON.stringify({ objectId }),
    });
  }

  /** Remove a single object link from a geofence */
  async removeGeofenceObject(geofenceId: string, objectId: string): Promise<void> {
    await this.request(`/api/v1/geofences/${geofenceId}/objects/${objectId}`, {
      method: 'DELETE',
    });
  }

  // RAG methods
  async ragSearch(query: string, options?: {
    topK?: number;
    filters?: {
      objectType?: string[];
      domain?: string[];
      isActionable?: boolean;
      urgency?: 'low' | 'medium' | 'high';
      dateFrom?: string;
      dateTo?: string;
    };
  }): Promise<{ query: string; results: RagSearchResult[]; total: number }> {
    return this.request('/api/v1/rag/search', {
      method: 'POST',
      body: JSON.stringify({ query, ...options }),
    });
  }

  async ragCheckContradictions(statement: string, excludeIds?: string[]): Promise<ContradictionResult> {
    return this.request('/api/v1/rag/contradictions', {
      method: 'POST',
      body: JSON.stringify({ statement, excludeIds: excludeIds ?? [] }),
    });
  }

  async ragSpar(query: string, options?: {
    topK?: number;
    filters?: {
      objectType?: string[];
      domain?: string[];
      isActionable?: boolean;
      dateFrom?: string;
      dateTo?: string;
    };
  }): Promise<SparResponse> {
    return this.request('/api/v1/rag/spar', {
      method: 'POST',
      body: JSON.stringify({ query, ...options }),
    }, 90000); // 90s — LLM calls can be slow
  }

  // Deepgram voice methods
  async getDeepgramToken(): Promise<{ token: string }> {
    return this.request('/api/v1/voice/deepgram-token');
  }

  async saveTranscript(data: {
    transcript: string;
    duration?: number;
    location?: {
      latitude: number;
      longitude: number;
      accuracy?: number;
      altitude?: number;
    };
    metadata?: Record<string, any>;
  }): Promise<{ sessionId: string; objectIds: string[]; objectCount: number }> {
    return this.request('/api/v1/voice/save-transcript', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Synthesis methods
  async triggerWeeklySynthesis(options?: {
    days?: number;
    force?: boolean;
  }): Promise<{ synthesis: WeeklySynthesis }> {
    const params = new URLSearchParams();
    if (options?.days) params.set('days', String(options.days));
    if (options?.force) params.set('force', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/v1/synthesis/weekly${qs}`, { method: 'POST' });
  }

  async getSyntheses(): Promise<{ syntheses: WeeklySynthesis[] }> {
    return this.request('/api/v1/synthesis');
  }
}

export const apiService = new ApiService();
