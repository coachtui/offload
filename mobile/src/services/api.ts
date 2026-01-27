import * as SecureStore from 'expo-secure-store';
import {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  VoiceSession,
  AtomicObject,
} from '../types';

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

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

class ApiService {
  private accessToken: string | null = null;

  async init(): Promise<void> {
    this.accessToken = await SecureStore.getItemAsync('accessToken');
  }

  private async getHeaders(): Promise<HeadersInit> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = await this.getHeaders();

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
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
    category?: string[];
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}): Promise<ObjectsListResponse> {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());
    if (options.category) {
      options.category.forEach(c => params.append('category', c));
    }
    if (options.search) params.append('search', options.search);
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

  // Geofence methods
  async getGeofences(): Promise<{ geofences: any[] }> {
    return this.request('/api/v1/geofences');
  }

  async createGeofence(data: any): Promise<{ geofence: any }> {
    return this.request('/api/v1/geofences', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateGeofence(id: string, data: any): Promise<{ geofence: any }> {
    return this.request(`/api/v1/geofences/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteGeofence(id: string): Promise<void> {
    await this.request(`/api/v1/geofences/${id}`, {
      method: 'DELETE',
    });
  }

  // Search methods
  async searchSemantic(query: string, options?: {
    limit?: number;
    category?: string[];
    dateFrom?: string;
    dateTo?: string;
    urgency?: string;
  }): Promise<{ query: string; results: any[]; count: number }> {
    return this.request('/api/v1/search/semantic', {
      method: 'POST',
      body: JSON.stringify({ query, ...options }),
    });
  }

  async findSimilar(objectId: string, limit?: number): Promise<{
    objectId: string; results: any[]; count: number
  }> {
    return this.request(`/api/v1/search/similar/${objectId}`, {
      method: 'POST',
      body: JSON.stringify({ limit }),
    });
  }

  // AI methods
  async aiQuery(query: string, options?: {
    contextLimit?: number;
    category?: string[];
    conversationHistory?: any[];
  }): Promise<any> {
    return this.request('/api/v1/ai/query', {
      method: 'POST',
      body: JSON.stringify({ query, ...options }),
    });
  }

  async checkContradictions(statement: string): Promise<any> {
    return this.request('/api/v1/ai/check-contradictions', {
      method: 'POST',
      body: JSON.stringify({ statement }),
    });
  }
}

export const apiService = new ApiService();
