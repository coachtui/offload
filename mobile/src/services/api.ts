import * as SecureStore from 'expo-secure-store';
import { emitPaywallRequired } from './paywallBus';

/**
 * Auth tokens must be readable while the device is LOCKED.
 *
 * The geofence background task authenticates its arrival lookup with these
 * tokens, and an arrival almost always happens with the phone locked in a
 * pocket. SecureStore's default accessibility (WHEN_UNLOCKED) made both token
 * reads fail in that state, so the task gave up before making any request —
 * the arrival reminder, the product's core promise, silently never fired.
 * AFTER_FIRST_UNLOCK keeps them readable from first unlock after boot onward.
 */
const TOKEN_KEYCHAIN_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

/** Single write path for auth tokens so the accessibility option can't be forgotten. */
async function storeAuthTokens(accessToken: string, refreshToken?: string): Promise<void> {
  await SecureStore.setItemAsync('accessToken', accessToken, TOKEN_KEYCHAIN_OPTS);
  if (refreshToken) {
    await SecureStore.setItemAsync('refreshToken', refreshToken, TOKEN_KEYCHAIN_OPTS);
  }
}
import {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  VoiceSession,
  AtomicObject,
  UserCategory,
} from '../types';

// Synthesis types
export interface SynthesisRef {
  id: string;
  title: string;
  objectType: string;
  domain: string;
}

export interface WeeklySynthesis {
  sessionId: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  objectCount: number;
  domainBreakdown: Record<string, number>;
  accomplished?: string[];
  accomplishedCount?: number;
  narrative: string;           // paragraphs separated by \n\n
  patterns: string[];
  openThreads: string[];
  contradictions: string[];
  actionableInsights: string[];
  citedIds: string[];
  citedObjects?: SynthesisRef[]; // human-friendly cited notes
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
  mentionCount?: number;
}

export interface SparResponse {
  answer: string;
  citedIds: string[];
  themes: string[];
  hasContradictions: boolean;
  gaps: string | null;
  contextPack: any;
}

// ─── Saved Ask Offload threads ────────────────────────────────────────────────
// A thread is a standing query, not a chat log: it stores the opening question
// and the objects its answers stood on, and re-derives what changed on resume.

export type ConversationRole = 'user' | 'assistant' | 'delta';

export interface Conversation {
  id: string;
  title: string;
  openingQuery: string;
  citedIds: string[];
  lastCheckedAt: string;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationListItem extends Conversation {
  messageCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: ConversationRole;
  content: string;
  citedIds: string[];
  themes: string[];
  gaps: string | null;
  hasContradictions: boolean;
  createdAt: string;
}

export interface DeltaObject {
  objectId: string;
  title: string;
  type: string;
  state: string;
  createdAt: string;
  stateUpdatedAt: string | null;
  nextAction: string | null;
  people: string[];
}

export interface ThreadDelta {
  hasChanges: boolean;
  resolved: DeltaObject[];
  stillOpen: DeltaObject[];
  gone: string[];
  newlyMentioned: DeltaObject[];
  daysSince: number;
  checkedAt: string;
}

export interface Place {
  id: string;
  userId: string;
  rawName: string;
  normalizedName: string;
  providerPlaceId: string | null;
  lat: number;
  lng: number;
  radiusMeters: number;
  category: string | null;
  confidence: number;
  userConfirmed: boolean;
  createdBy: 'manual' | 'inferred';
  createdAt: string;
}

export interface PlaceNotifyResponse {
  cooldown: boolean;
  objects: AtomicObject[];
  placeName: string | null;
}

export interface DashboardMetrics {
  cognitiveLoad: { score: number; level: 'low' | 'moderate' | 'high' | 'overloaded' };
  activeCommitments: number;
  openLoops: number;
  unresolvedDecisions: number;
  newIdeasThisWeek: number;
  staleActionables: number;
  dormantIdeasCount: number;
  domainDistribution: Record<string, number>;
  topDomainThisWeek: string | null;
  lastSynthesisDate: string | null;
  objectsThisWeek: number;
}

export interface DormantIdea {
  id: string;
  title: string | null;
  cleanedText: string;
  importanceScore: number;
  mentionCount: number;
  daysDormant: number;
  domain: string;
  createdAt: string;
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

export interface PlaceOverviewItem {
  kind: 'geofence' | 'place' | 'pending';
  id: string;
  name: string;
  openCount: number;
  labeled: boolean;
  enabled: boolean;
  /** kind 'pending' only: the spoken name that could not be silently resolved. */
  query?: string;
  /** kind 'pending' only: candidate locations for the confirm sheet. */
  candidates?: PendingPlaceCandidate[];
}

export interface PendingPlaceCandidate {
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  category: string | null;
  /** Distance from where the note was recorded, when known. */
  distanceKm?: number | null;
}

/** A place name waiting on the user to say where it is. */
export interface PendingPlaceLookup {
  id: string;
  query: string;
  objectId: string;
  notePreview: string | null;
  provider: string | null;
  createdAt: string;
  candidates: PendingPlaceCandidate[];
}

export type PendingResolveChoice =
  | { candidateIndex: number }
  | { lat: number; lng: number; radius?: number }
  | { geofenceId: string };

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

/**
 * Thrown for any other non-OK response, carrying the status and the server's
 * machine-readable `error` code so callers can branch on the specific failure
 * instead of matching against display copy.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Exchange the stored refresh token for a fresh access token.
 * Standalone (not a class method) so the geofence background task can reuse it
 * without the ApiService singleton. Returns the new access token, or null if
 * there is no refresh token or the refresh failed (caller should then re-auth).
 * Uses a raw fetch so it never recurses through ApiService's 401 handling.
 */
export async function refreshAuthToken(): Promise<string | null> {
  const refreshToken = await SecureStore.getItemAsync('refreshToken');
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      console.warn(`[ApiService] token refresh failed (${res.status})`);
      return null;
    }
    const data = await res.json();
    if (!data?.accessToken) return null;

    await storeAuthTokens(data.accessToken, data.refreshToken);
    console.log('[ApiService] token refreshed');
    return data.accessToken as string;
  } catch (err) {
    console.warn('[ApiService] token refresh threw:', err);
    return null;
  }
}

class ApiService {
  private accessToken: string | null = null;
  // Single-flight guard so concurrent 401s trigger only one refresh.
  private refreshPromise: Promise<string | null> | null = null;

  async init(): Promise<void> {
    this.accessToken = await SecureStore.getItemAsync('accessToken');
    console.log('[ApiService] init — token present:', !!this.accessToken);
    // Existing installs wrote tokens under the WHEN_UNLOCKED default. Re-save
    // them with AFTER_FIRST_UNLOCK (setItemAsync deletes + re-adds, carrying the
    // new attribute) so the background task can authenticate on a locked phone.
    // Fire-and-forget: launch must not wait on two keychain writes, and init
    // always runs unlocked so the reads here can't hit the locked-keychain case.
    void this.migrateTokenAccessibility();
  }

  private async migrateTokenAccessibility(): Promise<void> {
    try {
      const refreshToken = (await SecureStore.getItemAsync('refreshToken')) ?? undefined;
      if (this.accessToken) {
        await storeAuthTokens(this.accessToken, refreshToken);
        console.log('[ApiService] token keychain accessibility migrated (AFTER_FIRST_UNLOCK)');
      }
    } catch (err) {
      // Non-fatal: worst case the tokens keep the old attribute until next login.
      console.warn('[ApiService] token accessibility migration failed:', err);
    }
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
  /**
   * Coalesces concurrent refresh attempts into a single in-flight request.
   */
  private refreshOnce(): Promise<string | null> {
    if (!this.refreshPromise) {
      this.refreshPromise = refreshAuthToken().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs = 30000,
    isRetry = false
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
      // The auth endpoints themselves return 401 for their own reasons (wrong
      // password with attempts-remaining, expired refresh token) — refreshing
      // there is pointless and would swallow those messages. Skip them.
      const isAuthEndpoint =
        endpoint.includes('/auth/login') ||
        endpoint.includes('/auth/register') ||
        endpoint.includes('/auth/refresh');

      // Otherwise try a one-time silent refresh before giving up. Only on the
      // first attempt — a 401 on the retry means refresh didn't help.
      if (!isRetry && !isAuthEndpoint) {
        const newToken = await this.refreshOnce();
        if (newToken) {
          this.accessToken = newToken;
          console.log(`[ApiService] 401 on ${endpoint} — refreshed, retrying`);
          return this.request<T>(endpoint, options, timeoutMs, true);
        }
      }
      // Refresh unavailable, failed, or an auth endpoint — surface the server's
      // message (e.g. "3 attempts remaining") and signal AuthError for logout.
      console.warn(`[ApiService] 401 on ${endpoint}`);
      if (!isAuthEndpoint) {
        await this.clearToken();
      }
      const body = await response.json().catch(() => ({}));
      throw new AuthError(body.message || 'Session expired. Please log in again.');
    }

    if (!response.ok) {
      // Accept either { message } or { error } as the human-readable string.
      // Fall back to the raw text if the body isn't JSON, then to a generic label.
      let errorMessage = `HTTP ${response.status}`;
      let errorCode: string | undefined;
      try {
        const body = await response.json();
        errorMessage = body.message || body.error || errorMessage;
        if (typeof body.error === 'string') errorCode = body.error;
      } catch {
        const text = await response.text().catch(() => '');
        if (text) errorMessage = text.slice(0, 200);
      }
      console.error(`[ApiService] ${response.status} on ${endpoint}:`, errorMessage);
      // The paywall signal, raised centrally so no screen needs a 403 branch.
      // The request still throws below — callers treat it as a normal failure
      // while the navigator presents the paywall over whatever they rendered.
      if (response.status === 403 && errorCode === 'ENTITLEMENT_REQUIRED') {
        emitPaywallRequired();
      }
      throw new ApiError(errorMessage, response.status, errorCode);
    }

    // DELETE routes reply 204 No Content — an empty body isn't JSON, and
    // parsing it throws, making successful deletes look like failures.
    if (response.status === 204) {
      return undefined as T;
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
    await storeAuthTokens(response.accessToken, response.refreshToken);
    console.log('[ApiService] login — token stored, length:', response.accessToken.length);

    return response;
  }

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    this.accessToken = response.accessToken;
    await storeAuthTokens(response.accessToken, response.refreshToken);

    return response;
  }

  async getMe(): Promise<{ user: AuthResponse['user'] }> {
    return this.request<{ user: AuthResponse['user'] }>('/api/v1/auth/me');
  }

  async logout(): Promise<void> {
    await this.clearToken();
  }

  /**
   * Permanently delete the signed-in account and all of its data.
   *
   * Throws an ApiError with code 'INVALID_PASSWORD' (403) if the password is
   * wrong — the session stays valid in that case, so the caller should show the
   * error rather than sign the user out.
   */
  async deleteAccount(password: string): Promise<void> {
    await this.request<void>('/api/v1/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
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
    categoryId?: string;
    /** Scope to the notes one recording produced. */
    sessionId?: string;
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
    if (options.categoryId) params.append('categoryId', options.categoryId);
    if (options.sessionId) params.append('sessionId', options.sessionId);
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);

    const queryString = params.toString();
    return this.request<ObjectsListResponse>(
      `/api/v1/objects${queryString ? `?${queryString}` : ''}`
    );
  }

  /** Reminders the device should schedule as local notifications. */
  async getPendingReminders(): Promise<{
    reminders: Array<{ objectId: string; body: string; remindAt: string }>;
  }> {
    return this.request('/api/v1/objects/pending-reminders');
  }

  /**
   * Tell the server which reminders this device will fire locally so it stops
   * pushing them. The list is the whole set — omitting one hands it back.
   */
  async claimLocalReminders(objectIds: string[]): Promise<{ claimed: number; changed: number }> {
    return this.request('/api/v1/objects/pending-reminders/claim', {
      method: 'POST',
      body: JSON.stringify({ objectIds }),
    });
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

  async bulkDeleteObjects(ids: string[]): Promise<{ deleted: number }> {
    return this.request<{ deleted: number }>(`/api/v1/objects/bulk`, {
      method: 'POST',
      body: JSON.stringify({ ids, action: 'delete' }),
    });
  }

  async bulkMoveObjects(ids: string[], categoryId: string | null): Promise<{ moved: number }> {
    return this.request<{ moved: number }>(`/api/v1/objects/bulk`, {
      method: 'POST',
      body: JSON.stringify({ ids, action: 'move', categoryId }),
    });
  }

  async getCategories(): Promise<{ categories: UserCategory[] }> {
    return this.request<{ categories: UserCategory[] }>(`/api/v1/categories`);
  }

  async createCategory(input: {
    name: string; color?: string; icon?: string | null; keywords?: string[];
  }): Promise<{ category: UserCategory }> {
    return this.request<{ category: UserCategory }>(`/api/v1/categories`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateCategory(id: string, updates: Partial<{
    name: string; color: string; icon: string | null; keywords: string[]; sortOrder: number;
  }>): Promise<{ category: UserCategory }> {
    return this.request<{ category: UserCategory }>(`/api/v1/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteCategory(id: string): Promise<void> {
    await this.request<void>(`/api/v1/categories/${id}`, { method: 'DELETE' });
  }

  async applyCategory(id: string): Promise<{ filed: number }> {
    return this.request<{ filed: number }>(`/api/v1/categories/${id}/apply`, { method: 'POST' });
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

  async getGeofenceObjects(geofenceId: string, openOnly = false): Promise<{ objects: AtomicObject[] }> {
    const qs = openOnly ? '?openOnly=true' : '';
    return this.request<{ objects: AtomicObject[] }>(`/api/v1/geofences/${geofenceId}/objects${qs}`);
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
    minScore?: number;
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

  // ─── Saved threads ──────────────────────────────────────────────────────────

  async listConversations(limit = 50): Promise<{ conversations: ConversationListItem[]; total: number }> {
    return this.request(`/api/v1/conversations?limit=${limit}`);
  }

  /** Open a new thread and answer its first question. */
  async startConversation(query: string, options?: { topK?: number; title?: string }): Promise<{
    conversation: Conversation;
    messages: ConversationMessage[];
  }> {
    return this.request('/api/v1/conversations', {
      method: 'POST',
      body: JSON.stringify({ query, ...options }),
    }, 90000);
  }

  /** Thread + messages. Side-effect free — does NOT advance the delta watermark. */
  async getConversation(id: string): Promise<{
    conversation: Conversation;
    messages: ConversationMessage[];
  }> {
    return this.request(`/api/v1/conversations/${id}`);
  }

  /**
   * Reopen a thread: diff live object state against what it last saw.
   * `force` skips the "too soon to be interesting" window (pull-to-refresh).
   */
  async resumeConversation(id: string, force = false): Promise<{
    delta: ThreadDelta;
    message: ConversationMessage | null;
  }> {
    return this.request(`/api/v1/conversations/${id}/resume`, {
      method: 'POST',
      body: JSON.stringify({ force }),
    }, 90000);
  }

  async sendConversationMessage(id: string, query: string, options?: { topK?: number }): Promise<{
    conversation: Conversation;
    messages: ConversationMessage[];
  }> {
    return this.request(`/api/v1/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ query, ...options }),
    }, 90000);
  }

  async renameConversation(id: string, title: string): Promise<{ id: string; title: string }> {
    return this.request(`/api/v1/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  }

  async deleteConversation(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.request(`/api/v1/conversations/${id}`, { method: 'DELETE' });
  }

  // Deepgram voice methods
  async getDeepgramToken(): Promise<{ token: string; keywords: string[] }> {
    return this.request('/api/v1/voice/deepgram-token');
  }

  /**
   * Send accumulated raw-PCM audio chunks (base64) for high-accuracy transcription
   * via gpt-4o-transcribe. Returns the clean transcript that should be saved.
   * Deepgram remains the live preview; this is the final result swapped in on stop.
   */
  async transcribeAudio(
    audioChunks: string[],
    opts: { sampleRate?: number; channels?: number } = {}
  ): Promise<{ transcript: string }> {
    return this.request(
      '/api/v1/voice/transcribe-audio',
      {
        method: 'POST',
        body: JSON.stringify({
          audioChunks,
          sampleRate: opts.sampleRate ?? 16000,
          channels: opts.channels ?? 1,
        }),
      },
      // Upload + transcription can take longer than a normal request. The body is
      // base64 raw PCM, so it grows with recording length — roughly 1.3MB per
      // 30 seconds — and 60s was not enough to upload and transcribe a long note
      // on cellular. Timing out here is silent (the caller keeps the less
      // accurate Deepgram text), so a tight budget quietly degraded exactly the
      // long notes that need the accuracy most.
      120000
    );
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
  }): Promise<{
    sessionId: string;
    /** 'processing' — the transcript is stored; sorting happens in the background. */
    status?: 'processing' | 'completed';
    objectIds: string[];
    objectCount: number;
    hasGeofenceCandidates?: boolean;
    /** Place names the note mentioned — a label for prompts, not confirmed geofences. */
    placeNames?: string[];
  }> {
    return this.request('/api/v1/voice/save-transcript', {
      method: 'POST',
      // Device timezone rides in metadata so the server can derive time-based
      // reminders ("in 2 days") in the user's zone instead of a fixed default.
      body: JSON.stringify({
        ...data,
        metadata: {
          ...data.metadata,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      }),
    },
    // The server now stores the transcript and returns 202 immediately, parsing
    // in the background and pushing when it finishes. So this is a single write
    // again and its duration no longer scales with how long the user talked —
    // which is what made every previous number here wrong. The generous budget
    // is for a bad connection, not for the server's workload.
    30000);
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

  // Place Intelligence methods

  async getPlaces(): Promise<{ places: Place[] }> {
    return this.request('/api/v1/places');
  }

  async getPlacesOverview(): Promise<{ places: PlaceOverviewItem[] }> {
    return this.request<{ places: PlaceOverviewItem[] }>('/api/v1/places/overview');
  }

  // ─── Pending place lookups — names waiting on the user ────────────────────

  async getPendingPlaces(): Promise<{ pending: PendingPlaceLookup[] }> {
    return this.request('/api/v1/places/pending');
  }

  /**
   * Answer a pending lookup. All three shapes land on a manual geofence
   * server-side, so this word is taught once and never asked about again.
   */
  async resolvePendingPlace(
    lookupId: string,
    choice: PendingResolveChoice
  ): Promise<{ geofence: any }> {
    return this.request(`/api/v1/places/pending/${lookupId}/resolve`, {
      method: 'POST',
      body: JSON.stringify(choice),
    });
  }

  /** "Not a place" — dismiss and stop asking about this word. */
  async dismissPendingPlace(lookupId: string): Promise<{ ok: boolean }> {
    return this.request(`/api/v1/places/pending/${lookupId}/dismiss`, {
      method: 'POST',
    });
  }

  async getPlaceObjects(placeId: string): Promise<{ objects: AtomicObject[] }> {
    return this.request(`/api/v1/places/${placeId}/objects`);
  }

  /** Called on geofence entry to check cooldown and get active objects. Returns null if cooling down. */
  async triggerPlaceNotify(placeId: string): Promise<PlaceNotifyResponse> {
    return this.request(`/api/v1/places/${placeId}/notify`, { method: 'POST' });
  }

  async markPlaceObjectDone(placeId: string, objectId: string): Promise<void> {
    await this.request(`/api/v1/places/${placeId}/objects/${objectId}/done`, { method: 'POST' });
  }

  async dismissPlaceObject(placeId: string, objectId: string): Promise<void> {
    await this.request(`/api/v1/places/${placeId}/objects/${objectId}/dismiss`, { method: 'POST' });
  }

  async snoozePlaceObject(placeId: string, objectId: string, until: Date): Promise<void> {
    await this.request(`/api/v1/places/${placeId}/objects/${objectId}/snooze`, {
      method: 'POST',
      body: JSON.stringify({ until: until.toISOString() }),
    });
  }

  async unlinkPlaceObject(placeId: string, objectId: string): Promise<void> {
    await this.request(`/api/v1/places/${placeId}/objects/${objectId}`, { method: 'DELETE' });
  }

  async getDashboard(): Promise<DashboardMetrics> {
    return this.request<DashboardMetrics>('/api/v1/dashboard');
  }

  async getDormantIdeas(options?: { limit?: number; minImportance?: number; dormantDays?: number }): Promise<{ ideas: DormantIdea[] }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.minImportance) params.set('minImportance', String(options.minImportance));
    if (options?.dormantDays) params.set('dormantDays', String(options.dormantDays));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/v1/ideas/dormant${qs}`);
  }

  async updateObjectState(objectId: string, state: 'open' | 'active' | 'resolved' | 'archived', evolvedFromId?: string): Promise<{ object: any }> {
    return this.request(`/api/v1/objects/${objectId}/state`, {
      method: 'POST',
      body: JSON.stringify({ state, evolvedFromId }),
    });
  }

  async reviewDecision(objectId: string, actualOutcome: string, outcomeAccuracy?: number): Promise<{ object: any }> {
    return this.request(`/api/v1/objects/${objectId}/review`, {
      method: 'POST',
      body: JSON.stringify({ actualOutcome, outcomeAccuracy }),
    });
  }

  async getSynthesisTrends(months?: number): Promise<any> {
    const qs = months ? `?months=${months}` : '';
    return this.request(`/api/v1/synthesis/trends${qs}`);
  }

  async promotePlace(placeId: string): Promise<{ geofence: any }> {
    const res = await this.request<{ geofence: any }>(`/api/v1/places/${placeId}/promote`, {
      method: 'POST',
    });
    return { geofence: this.toMobileGeofence(res.geofence) };
  }

  /**
   * Toggle notification_enabled on a geofence without touching onEnter/onExit.
   * Bypasses toBackendGeofence intentionally: that helper defaults onEnter=true
   * and onExit=false whenever those fields are absent, which would clobber the
   * user's existing enter/exit settings when we only want to flip `enabled`.
   * Sending a minimal { notificationSettings: { enabled } } body lets the
   * backend partial-update only notification_enabled at the model layer.
   */
  async setGeofenceEnabled(geofenceId: string, enabled: boolean): Promise<{ geofence: any }> {
    const res = await this.request<{ geofence: any }>(`/api/v1/geofences/${geofenceId}`, {
      method: 'PUT',
      body: JSON.stringify({ notificationSettings: { enabled } }),
    });
    return { geofence: this.toMobileGeofence(res.geofence) };
  }

  // Push notification methods
  async registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
    await this.request<void>('/api/v1/push/register', {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    });
  }
}

export const apiService = new ApiService();
