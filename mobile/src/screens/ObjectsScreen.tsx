import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  FlatList,
  SectionList,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useRoute } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { useObjects } from '../hooks/useObjects';
import { useSearch, ObjectDomain, ObjectType } from '../hooks/useSearch';
import { AtomicObject } from '../types';
import type { RagSearchResult, DashboardMetrics } from '../services/api';
import { apiService } from '../services/api';
import { AppScreen, AppHeader, AppSearchBar, Colors, Spacing, Radius } from '../components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

type PrimaryFilter = 'all' | 'todo' | 'reminders' | 'ideas' | 'saved';
type NoteStatus = 'open' | 'active' | 'resolved' | 'archived';

type ObjectsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Objects'>;

interface Props {
  navigation: ObjectsScreenNavigationProp;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOMAINS = ['work', 'personal', 'health', 'family', 'finance', 'project', 'misc'];
const OBJECT_TYPES = ['task', 'idea', 'reminder', 'decision', 'question', 'observation'];

const PRIMARY_FILTERS: Array<{ key: PrimaryFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'todo', label: 'To Do' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'ideas', label: 'Ideas' },
  { key: 'saved', label: 'Saved' },
];

const DOMAIN_COLORS: Record<string, string> = {
  work: '#3b82f6',
  personal: '#8b5cf6',
  health: '#22c55e',
  family: '#f59e0b',
  finance: '#06b6d4',
  project: '#ec4899',
  misc: '#6b7280',
};

const DOMAIN_LABELS: Record<string, string> = {
  work: 'Work',
  personal: 'Personal',
  health: 'Health',
  family: 'Family',
  finance: 'Finance',
  project: 'Project',
  misc: 'Other',
};

const TYPE_LABELS: Record<string, string> = {
  task: 'To Do',
  reminder: 'Reminder',
  idea: 'Idea',
  decision: 'Decision',
  question: 'Question',
  observation: 'Note',
  journal: 'Journal',
  reference: 'Reference',
};

const STATUS_LABELS: Record<NoteStatus, string> = {
  open: 'Open',
  active: 'In Progress',
  resolved: 'Done',
  archived: 'Archived',
};

const STATUS_COLORS: Record<string, string> = {
  open: '#6b7280',
  active: '#3b82f6',
  resolved: '#22c55e',
  archived: '#9ca3af',
};

const URGENCY_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeDate(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    return 'Today';
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatFullDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

function getFriendlyType(objectType?: string | null): string {
  if (!objectType) return 'Note';
  return TYPE_LABELS[objectType] || objectType;
}

function getFriendlyDomain(domain?: string | null): string {
  if (!domain || domain === 'misc' || domain === 'unknown') return '';
  return DOMAIN_LABELS[domain] || domain;
}

function buildCardSubtitle(objectType?: string | null, domain?: string | null): string {
  const type = getFriendlyType(objectType);
  const domainLabel = getFriendlyDomain(domain);
  if (domainLabel) return `${domainLabel} ${type.toLowerCase()}`;
  return type;
}

function primaryFilterToObjectTypes(filter: PrimaryFilter): string[] | undefined {
  switch (filter) {
    case 'todo': return ['task'];
    case 'reminders': return ['reminder'];
    case 'ideas': return ['idea'];
    case 'saved': return ['reference', 'observation', 'decision', 'question', 'journal'];
    default: return undefined;
  }
}

// ─── Date grouping ────────────────────────────────────────────────────────────

type DateBucket = 'Today' | 'Yesterday' | 'This Week' | 'Earlier';

interface NoteSection {
  title: DateBucket;
  data: AtomicObject[];
}

function getDateBucket(date: Date | string): DateBucket {
  const d = new Date(date);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This Week';
  return 'Earlier';
}

function groupNotesByDate(items: AtomicObject[]): NoteSection[] {
  const buckets: Record<DateBucket, AtomicObject[]> = {
    Today: [], Yesterday: [], 'This Week': [], Earlier: [],
  };
  for (const item of items) {
    buckets[getDateBucket(item.createdAt)].push(item);
  }
  const order: DateBucket[] = ['Today', 'Yesterday', 'This Week', 'Earlier'];
  return order.filter((b) => buckets[b].length > 0).map((b) => ({ title: b, data: buckets[b] }));
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ObjectsScreen({ navigation }: Props) {
  const route = useRoute<RouteProp<RootStackParamList, 'Objects'>>();
  const geofenceId = route.params?.geofenceId;
  const initialObjectId = route.params?.objectId;

  const {
    objects, isLoading, isRefreshing, error, hasMore,
    object: selectedObject, isLoadingDetail, isUpdating, updateError,
    refresh, loadMore, setFilters, fetchObjectDetail, updateObject, clearDetail,
  } = useObjects();

  const { results: searchResults, loading: searchLoading, search, clearResults } = useSearch();

  // UI state
  const [modalVisible, setModalVisible] = useState(false);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [aiDetailsExpanded, setAiDetailsExpanded] = useState(false);
  const [updatingState, setUpdatingState] = useState(false);

  // Filter state
  const [primaryFilter, setPrimaryFilter] = useState<PrimaryFilter>('all');
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  // Pending filter state (inside sheet before Apply)
  const [pendingDomains, setPendingDomains] = useState<string[]>([]);
  const [pendingTypes, setPendingTypes] = useState<string[]>([]);

  const isSearchMode = searchText.trim().length > 0;
  const hasActiveFilters = selectedDomains.length > 0 || selectedTypes.length > 0;

  // Context data
  const [staleObjects, setStaleObjects] = useState<AtomicObject[]>([]);
  const [staleExpanded, setStaleExpanded] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardMetrics | null>(null);
  const [dashboardExpanded, setDashboardExpanded] = useState(false);
  const [geofenceObjects, setGeofenceObjects] = useState<AtomicObject[]>([]);

  useEffect(() => {
    apiService.getStaleActionables()
      .then(({ objects: items }) => setStaleObjects(items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiService.getDashboard()
      .then((metrics) => setDashboard(metrics))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!initialObjectId) return;
    setModalVisible(true);
    fetchObjectDetail(initialObjectId);
  }, [initialObjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!geofenceId) return;
    apiService.getGeofenceObjects(geofenceId)
      .then(({ objects: items }) => setGeofenceObjects(items))
      .catch(() => {});
  }, [geofenceId]);

  // ─── Filter logic ─────────────────────────────────────────────────────────

  const triggerSearch = useCallback((text: string, domains: string[], types: string[]) => {
    search(text, {
      domain: domains.length ? (domains as ObjectDomain[]) : undefined,
      objectType: types.length ? (types as ObjectType[]) : undefined,
    });
  }, [search]);

  const triggerBrowse = useCallback((domains: string[], types: string[]) => {
    setFilters({
      domain: domains.length ? domains : undefined,
      objectType: types.length ? types : undefined,
    });
  }, [setFilters]);

  const handleSearch = useCallback(() => {
    if (searchText.trim()) {
      triggerSearch(searchText, selectedDomains, selectedTypes);
    }
  }, [searchText, selectedDomains, selectedTypes, triggerSearch]);

  const handlePrimaryFilterPress = useCallback((filter: PrimaryFilter) => {
    setPrimaryFilter(filter);
    const types = primaryFilterToObjectTypes(filter) ?? [];
    setSelectedTypes(types);
    if (searchText.trim()) {
      triggerSearch(searchText, selectedDomains, types);
    } else {
      triggerBrowse(selectedDomains, types);
    }
  }, [searchText, selectedDomains, triggerSearch, triggerBrowse]);

  const handleOpenFilterSheet = useCallback(() => {
    setPendingDomains(selectedDomains);
    setPendingTypes(selectedTypes);
    setFilterSheetVisible(true);
  }, [selectedDomains, selectedTypes]);

  const handleApplyFilters = useCallback(() => {
    setSelectedDomains(pendingDomains);
    setSelectedTypes(pendingTypes);
    setPrimaryFilter('all');
    setFilterSheetVisible(false);
    if (searchText.trim()) {
      triggerSearch(searchText, pendingDomains, pendingTypes);
    } else {
      triggerBrowse(pendingDomains, pendingTypes);
    }
  }, [pendingDomains, pendingTypes, searchText, triggerSearch, triggerBrowse]);

  const handleClearAllFilters = useCallback(() => {
    setSearchText('');
    setSelectedDomains([]);
    setSelectedTypes([]);
    setPrimaryFilter('all');
    clearResults();
    setFilters({});
  }, [setFilters, clearResults]);

  // ─── Modal / detail actions ───────────────────────────────────────────────

  const openDetail = useCallback(async (id: string) => {
    setModalVisible(true);
    setEditMode(false);
    setAiDetailsExpanded(false);
    await fetchObjectDetail(id);
  }, [fetchObjectDetail]);

  const handleObjectPress = useCallback((item: AtomicObject) => openDetail(item.id), [openDetail]);
  const handleSearchResultPress = useCallback((item: RagSearchResult) => openDetail(item.objectId), [openDetail]);

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    setEditMode(false);
    setEditContent('');
    setAiDetailsExpanded(false);
    clearDetail();
  }, [clearDetail]);

  const handleEditPress = useCallback(() => {
    if (selectedObject) {
      setEditContent(selectedObject.content);
      setEditMode(true);
    }
  }, [selectedObject]);

  const handleCancelEdit = useCallback(() => {
    setEditMode(false);
    setEditContent('');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (selectedObject && editContent.trim()) {
      const success = await updateObject(selectedObject.id, { content: editContent.trim() });
      if (success) setEditMode(false);
    }
  }, [selectedObject, editContent, updateObject]);

  const handleStatusChange = useCallback(async (objectId: string, newState: NoteStatus) => {
    setUpdatingState(true);
    try {
      await apiService.updateObjectState(objectId, newState);
      await fetchObjectDetail(objectId);
    } catch { /* silent */ }
    finally { setUpdatingState(false); }
  }, [fetchObjectDetail]);

  const handleMarkDone = useCallback(() => {
    if (!selectedObject) return;
    const currentState = (selectedObject as any).state ?? 'open';
    if (currentState !== 'resolved') {
      handleStatusChange(selectedObject.id, 'resolved');
    }
  }, [selectedObject, handleStatusChange]);

  // ─── Renders: list screen ─────────────────────────────────────────────────

  const renderPrimaryFilters = useCallback(() => (
    <View style={styles.primaryFilterBar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.primaryFilterContent}
      >
        {PRIMARY_FILTERS.map((f) => {
          const isActive = primaryFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.primaryPill, isActive && styles.primaryPillActive]}
              onPress={() => handlePrimaryFilterPress(f.key)}
            >
              <Text style={[styles.primaryPillText, isActive && styles.primaryPillTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <TouchableOpacity
        style={[styles.filterIconBtn, hasActiveFilters && styles.filterIconBtnActive]}
        onPress={handleOpenFilterSheet}
      >
        <Ionicons
          name="options-outline"
          size={18}
          color={hasActiveFilters ? Colors.accent : Colors.textMuted}
        />
      </TouchableOpacity>
    </View>
  ), [primaryFilter, hasActiveFilters, handlePrimaryFilterPress, handleOpenFilterSheet]);

  const renderGeofenceContext = useCallback(() => {
    if (!geofenceId || geofenceObjects.length === 0) return null;
    return (
      <View style={styles.geofenceBanner}>
        <View style={styles.geofenceBannerHeader}>
          <View style={styles.geofenceDot} />
          <Text style={styles.geofenceBannerTitle}>
            At this location · {geofenceObjects.length} note{geofenceObjects.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contextCardsRow}>
          {geofenceObjects.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.contextCard, styles.geofenceCard]}
              onPress={() => handleObjectPress(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.geofenceCardLabel}>nearby</Text>
              <Text style={styles.contextCardContent} numberOfLines={2}>{item.title || item.content}</Text>
              {item.actionability?.nextAction && (
                <Text style={styles.contextCardAction} numberOfLines={1}>{item.actionability.nextAction}</Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }, [geofenceId, geofenceObjects, handleObjectPress]);

  const renderDashboardCard = useCallback(() => {
    if (!dashboard) return null;
    const loadLevel = dashboard.cognitiveLoad.level;
    const loadColor = loadLevel === 'low' ? '#22c55e' : loadLevel === 'moderate' ? '#f59e0b' : '#ef4444';
    const totalNeedsAttention = dashboard.activeCommitments + dashboard.openLoops;
    const message = totalNeedsAttention > 0
      ? `${totalNeedsAttention} item${totalNeedsAttention !== 1 ? 's' : ''} need your attention`
      : "You're all caught up";
    return (
      <View style={styles.dashboardCard}>
        <TouchableOpacity
          style={styles.dashboardHeader}
          onPress={() => setDashboardExpanded((v) => !v)}
          activeOpacity={0.7}
        >
          <View style={styles.dashboardTitleRow}>
            <View style={[styles.dashboardDot, { backgroundColor: loadColor }]} />
            <Text style={styles.dashboardTitle}>{message}</Text>
          </View>
          <Ionicons name={dashboardExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textFaint} />
        </TouchableOpacity>
        {dashboardExpanded && (
          <View style={styles.dashboardBody}>
            <View style={styles.dashboardGrid}>
              <DashStat label="In Progress" value={dashboard.activeCommitments} />
              <DashStat label="Open" value={dashboard.openLoops} />
              <DashStat label="Decisions" value={dashboard.unresolvedDecisions} />
              <DashStat label="Ideas" value={dashboard.newIdeasThisWeek} />
              <DashStat label="This Week" value={dashboard.objectsThisWeek} />
              <DashStat label="Dormant" value={dashboard.dormantIdeasCount} />
            </View>
            {dashboard.topDomainThisWeek && (
              <Text style={styles.dashboardMeta}>
                Most active: {DOMAIN_LABELS[dashboard.topDomainThisWeek] || dashboard.topDomainThisWeek}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  }, [dashboard, dashboardExpanded]);

  const renderStaleBanner = useCallback(() => {
    if (staleObjects.length === 0) return null;
    return (
      <View style={styles.staleBanner}>
        <TouchableOpacity
          style={styles.staleBannerHeader}
          onPress={() => setStaleExpanded((v) => !v)}
          activeOpacity={0.7}
        >
          <View style={styles.staleTitleRow}>
            <View style={styles.staleDot} />
            <Text style={styles.staleBannerTitle}>Don't forget ({staleObjects.length})</Text>
          </View>
          <Ionicons name={staleExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textFaint} />
        </TouchableOpacity>
        {staleExpanded && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contextCardsRow}>
            {staleObjects.map((item) => {
              const daysOld = Math.floor((Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24));
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.contextCard}
                  onPress={() => handleObjectPress(item)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.staleCardAge}>{daysOld}d ago</Text>
                  <Text style={styles.contextCardContent} numberOfLines={2}>{item.title || item.content}</Text>
                  {item.actionability?.nextAction && (
                    <Text style={styles.contextCardAction} numberOfLines={1}>{item.actionability.nextAction}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  }, [staleObjects, staleExpanded, handleObjectPress]);

  const renderNoteCard = useCallback(({ item }: { item: AtomicObject }) => {
    const title = item.title || item.content;
    const subtitle = buildCardSubtitle(item.objectType, item.domain);
    const urgency = item.metadata?.urgency;
    const showUrgency = urgency === 'high' || urgency === 'medium';
    const currentState = (item as any).state ?? 'open';
    const isDone = currentState === 'resolved' || currentState === 'archived';

    return (
      <TouchableOpacity
        style={[styles.noteRow, isDone && styles.noteRowDone]}
        onPress={() => handleObjectPress(item)}
        activeOpacity={0.7}
      >
        <Text style={[styles.noteTitle, isDone && styles.noteTitleDone]} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.noteMeta}>
          <Text style={styles.noteSubtitle}>{subtitle}</Text>
          <Text style={styles.noteDot}> · </Text>
          <Text style={styles.noteDate}>{formatRelativeDate(item.createdAt)}</Text>
          {showUrgency && (
            <>
              <Text style={styles.noteDot}> · </Text>
              <View style={[styles.urgencyDot, { backgroundColor: URGENCY_COLORS[urgency!] }]} />
              <Text style={[styles.noteUrgency, { color: URGENCY_COLORS[urgency!] }]}>
                {urgency === 'high' ? 'Urgent' : 'Medium priority'}
              </Text>
            </>
          )}
        </View>
        {item.actionability?.nextAction && !isDone && (
          <Text style={styles.noteNextAction} numberOfLines={1}>
            → {item.actionability.nextAction}
          </Text>
        )}
      </TouchableOpacity>
    );
  }, [handleObjectPress]);

  const renderSearchResultCard = useCallback(({ item }: { item: RagSearchResult }) => {
    const subtitle = buildCardSubtitle(item.type, item.domain);
    const urgency = item.temporalHints?.urgency;
    const showUrgency = urgency === 'high' || urgency === 'medium';

    return (
      <TouchableOpacity
        style={styles.noteRow}
        onPress={() => handleSearchResultPress(item)}
        activeOpacity={0.7}
      >
        {item.title && (
          <Text style={styles.noteTitle} numberOfLines={2}>{item.title}</Text>
        )}
        <Text
          style={item.title ? styles.noteBody : styles.noteTitle}
          numberOfLines={item.title ? 2 : 3}
        >
          {item.cleanedText}
        </Text>
        <View style={styles.noteMeta}>
          <Text style={styles.noteSubtitle}>{subtitle}</Text>
          <Text style={styles.noteDot}> · </Text>
          <Text style={styles.noteDate}>{formatRelativeDate(item.createdAt)}</Text>
          <Text style={styles.noteDot}> · </Text>
          <Text style={styles.matchScore}>{Math.round(item.score * 100)}% match</Text>
          {showUrgency && (
            <>
              <Text style={styles.noteDot}> · </Text>
              <View style={[styles.urgencyDot, { backgroundColor: URGENCY_COLORS[urgency!] }]} />
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [handleSearchResultPress]);

  const renderEmpty = useCallback(() => {
    if (isLoading || searchLoading) return null;
    const hasFilters = isSearchMode || selectedDomains.length > 0 || selectedTypes.length > 0;
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateIcon}>{hasFilters ? '🔍' : '📝'}</Text>
        <Text style={styles.emptyStateTitle}>{hasFilters ? 'Nothing here' : 'No notes yet'}</Text>
        <Text style={styles.emptyStateText}>
          {hasFilters
            ? 'Try a different search or clear your filters'
            : 'Your saved thoughts and ideas will appear here'}
        </Text>
        {hasFilters && (
          <TouchableOpacity style={styles.clearFiltersBtn} onPress={handleClearAllFilters}>
            <Text style={styles.clearFiltersBtnText}>Clear Filters</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [isLoading, searchLoading, isSearchMode, selectedDomains, selectedTypes, handleClearAllFilters]);

  const renderSectionHeader = useCallback(
    ({ section: { title } }: { section: NoteSection }) => (
      <View style={styles.listSectionHeader}>
        <Text style={styles.listSectionHeaderText}>{title}</Text>
      </View>
    ),
    []
  );

  const renderFooter = useCallback(() => {
    if (!hasMore || isLoading) return null;
    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }, [hasMore, isLoading]);

  // ─── Filter Sheet ─────────────────────────────────────────────────────────

  const renderFilterSheet = () => (
    <Modal
      visible={filterSheetVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setFilterSheetVisible(false)}
    >
      <SafeAreaView style={styles.sheetContainer} edges={['top']}>
        <View style={styles.sheetHeader}>
          <TouchableOpacity onPress={() => setFilterSheetVisible(false)}>
            <Text style={styles.sheetCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>Filter Notes</Text>
          <TouchableOpacity onPress={() => { setPendingDomains([]); setPendingTypes([]); }}>
            <Text style={styles.sheetReset}>Reset</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false}>
          <Text style={styles.sheetSectionLabel}>Area</Text>
          <View style={styles.sheetChipsWrap}>
            {DOMAINS.map((domain) => {
              const isSelected = pendingDomains.includes(domain);
              const color = DOMAIN_COLORS[domain] ?? '#6b7280';
              return (
                <TouchableOpacity
                  key={domain}
                  style={[styles.sheetChip, isSelected && { backgroundColor: color, borderColor: color }]}
                  onPress={() => setPendingDomains(prev =>
                    prev.includes(domain) ? prev.filter(d => d !== domain) : [...prev, domain]
                  )}
                >
                  <Text style={[styles.sheetChipText, isSelected && styles.sheetChipTextSelected]}>
                    {DOMAIN_LABELS[domain] || domain}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.sheetSectionLabel, { marginTop: 28 }]}>Type</Text>
          <View style={styles.sheetChipsWrap}>
            {OBJECT_TYPES.map((type) => {
              const isSelected = pendingTypes.includes(type);
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.sheetChip, isSelected && styles.sheetChipSelected]}
                  onPress={() => setPendingTypes(prev =>
                    prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
                  )}
                >
                  <Text style={[styles.sheetChipText, isSelected && styles.sheetChipTextSelected]}>
                    {TYPE_LABELS[type] || type}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.sheetFooter}>
          <TouchableOpacity style={styles.applyBtn} onPress={handleApplyFilters}>
            <Text style={styles.applyBtnText}>
              Apply{pendingDomains.length + pendingTypes.length > 0
                ? ` · ${pendingDomains.length + pendingTypes.length} selected`
                : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );

  // ─── Detail Modal ─────────────────────────────────────────────────────────

  const renderDetailModal = () => (
    <Modal
      visible={modalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCloseModal}
    >
      <SafeAreaView style={styles.modalContainer} edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKeyboardView}
        >
          <AppHeader
            title={editMode ? 'Edit Note' : 'Note'}
            left={
              <TouchableOpacity onPress={editMode ? handleCancelEdit : handleCloseModal}>
                <Text style={editMode ? styles.headerCancelBtn : styles.headerCloseBtn}>
                  {editMode ? 'Cancel' : 'Close'}
                </Text>
              </TouchableOpacity>
            }
            right={
              selectedObject && !editMode ? (
                <TouchableOpacity onPress={handleEditPress}>
                  <Text style={styles.headerEditBtn}>Edit</Text>
                </TouchableOpacity>
              ) : editMode ? (
                <TouchableOpacity onPress={handleSaveEdit} disabled={isUpdating}>
                  {isUpdating
                    ? <ActivityIndicator size="small" color={Colors.accent} />
                    : <Text style={styles.headerEditBtn}>Save</Text>
                  }
                </TouchableOpacity>
              ) : undefined
            }
          />

          {isLoadingDetail ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator size="large" color={Colors.accent} />
            </View>
          ) : selectedObject ? (
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>

              {/* Summary line */}
              <Text style={styles.noteSummaryLine}>
                {buildCardSubtitle(selectedObject.objectType, selectedObject.domain)}
                {' · '}
                {formatFullDate(selectedObject.createdAt)}
              </Text>

              {/* Note content */}
              {editMode ? (
                <View style={styles.editSection}>
                  <TextInput
                    style={styles.editInput}
                    value={editContent}
                    onChangeText={setEditContent}
                    multiline
                    autoFocus
                    placeholder="Edit your note..."
                    placeholderTextColor={Colors.textFaint}
                  />
                  {updateError && <Text style={styles.updateError}>{updateError}</Text>}
                </View>
              ) : (
                <Text style={styles.detailNoteContent}>{selectedObject.content}</Text>
              )}

              {!editMode && (
                <>
                  {/* Quick actions */}
                  <View style={styles.quickActionsRow}>
                    <QuickAction
                      icon="checkmark-circle-outline"
                      label="Mark Done"
                      onPress={handleMarkDone}
                      disabled={
                        (selectedObject as any).state === 'resolved' ||
                        (selectedObject as any).state === 'archived' ||
                        updatingState
                      }
                      active={(selectedObject as any).state === 'resolved'}
                    />
                    <QuickAction
                      icon="notifications-outline"
                      label="Remind Me"
                      onPress={() => Alert.alert('Coming soon', 'Reminders are coming in a future update.')}
                    />
                    <QuickAction
                      icon="bookmark-outline"
                      label="Pin"
                      onPress={() => Alert.alert('Coming soon', 'Pinning notes is coming in a future update.')}
                    />
                    <QuickAction
                      icon="pencil-outline"
                      label="Edit"
                      onPress={handleEditPress}
                    />
                  </View>

                  <View style={styles.divider} />

                  {/* Details */}
                  <Text style={styles.sectionLabel}>Details</Text>
                  <View style={styles.detailsCard}>
                    {selectedObject.objectType && (
                      <DetailRow
                        label="Type"
                        value={TYPE_LABELS[selectedObject.objectType] || selectedObject.objectType}
                      />
                    )}
                    {selectedObject.domain && selectedObject.domain !== 'misc' && (
                      <DetailRow
                        label="Area"
                        value={DOMAIN_LABELS[selectedObject.domain] || selectedObject.domain}
                      />
                    )}
                    <DetailRow
                      label="Priority"
                      value={selectedObject.metadata.urgency}
                      valueColor={URGENCY_COLORS[selectedObject.metadata.urgency]}
                      capitalize
                    />
                    <DetailRow
                      label="Status"
                      customValue={
                        <StatusPicker
                          currentState={(selectedObject as any).state ?? 'open'}
                          onChangeState={(s) => handleStatusChange(selectedObject.id, s)}
                          updating={updatingState}
                        />
                      }
                    />
                    <DetailRow
                      label="Captured"
                      value={
                        selectedObject.source.type === 'voice' ? 'Voice recording'
                          : selectedObject.source.type === 'text' ? 'Typed'
                          : 'Imported'
                      }
                    />
                    <DetailRow
                      label="Created"
                      value={formatFullDate(selectedObject.createdAt)}
                      isLast
                    />
                  </View>

                  {/* Keywords */}
                  {selectedObject.metadata.tags.length > 0 && (
                    <>
                      <Text style={[styles.sectionLabel, { marginTop: Spacing.xxl }]}>Keywords</Text>
                      <View style={styles.keywordsWrap}>
                        {selectedObject.metadata.tags.map((tag) => (
                          <View key={tag} style={styles.keywordPill}>
                            <Text style={styles.keywordText}>{tag}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}

                  {/* Advanced details (collapsed) */}
                  <TouchableOpacity
                    style={styles.advancedToggle}
                    onPress={() => setAiDetailsExpanded((v) => !v)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.advancedToggleText}>Advanced details</Text>
                    <Ionicons
                      name={aiDetailsExpanded ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={Colors.textFaint}
                    />
                  </TouchableOpacity>

                  {aiDetailsExpanded && (
                    <View style={styles.advancedCard}>
                      <DetailRow
                        label="AI confidence"
                        value={`${Math.round(selectedObject.confidence * 100)}%`}
                      />
                      <DetailRow
                        label="Sentiment"
                        value={selectedObject.metadata.sentiment}
                        capitalize
                      />
                      {selectedObject.metadata.entities.length > 0 && (
                        <View style={styles.entitiesRow}>
                          <Text style={styles.detailRowLabel}>Mentions</Text>
                          <View style={styles.entitiesList}>
                            {selectedObject.metadata.entities.map((entity, i) => (
                              <Text key={i} style={styles.entityItem}>
                                <Text style={styles.entityTypeLabel}>{entity.type}: </Text>
                                {entity.value}
                              </Text>
                            ))}
                          </View>
                        </View>
                      )}
                      <DetailRow
                        label="Source"
                        value={selectedObject.source.type}
                        capitalize
                        isLast
                      />
                    </View>
                  )}

                  <View style={{ height: 48 }} />
                </>
              )}
            </ScrollView>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <AppScreen>
      <AppHeader
        title="Notes"
        left={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        }
      />

      <View style={styles.searchContainer}>
        <AppSearchBar
          value={searchText}
          onChangeText={setSearchText}
          placeholder="What did you want to remember?"
          onSubmit={handleSearch}
          loading={searchLoading && isSearchMode}
        />
      </View>

      {renderPrimaryFilters()}
      {renderGeofenceContext()}
      {renderDashboardCard()}
      {renderStaleBanner()}

      {(isLoading || searchLoading) && (isSearchMode ? searchResults.length === 0 : objects.length === 0) ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : !isSearchMode && error && objects.length === 0 ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={refresh}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : isSearchMode ? (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.objectId}
          renderItem={renderSearchResultCard}
          contentContainerStyle={searchResults.length === 0 ? styles.listEmpty : styles.listContent}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <SectionList
          sections={groupNotesByDate(objects)}
          keyExtractor={(item) => item.id}
          renderItem={renderNoteCard}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={objects.length === 0 ? styles.listEmpty : styles.listContent}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor={Colors.accent}
              colors={[Colors.accent]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {renderDetailModal()}
      {renderFilterSheet()}
    </AppScreen>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DashStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.dashStat}>
      <Text style={styles.dashStatValue}>{value}</Text>
      <Text style={styles.dashStatLabel}>{label}</Text>
    </View>
  );
}

interface QuickActionProps {
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
}

function QuickAction({ icon, label, onPress, disabled, active }: QuickActionProps) {
  return (
    <TouchableOpacity
      style={[styles.quickAction, disabled && styles.quickActionDisabled]}
      onPress={disabled ? undefined : onPress}
      activeOpacity={disabled ? 1 : 0.7}
    >
      <Ionicons
        name={icon as any}
        size={20}
        color={active ? Colors.success : disabled ? Colors.textFaint : Colors.textSecondary}
      />
      <Text style={[
        styles.quickActionLabel,
        active && styles.quickActionLabelActive,
        disabled && styles.quickActionLabelDisabled,
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

interface DetailRowProps {
  label: string;
  value?: string;
  valueColor?: string;
  capitalize?: boolean;
  isLast?: boolean;
  customValue?: React.ReactNode;
}

function DetailRow({ label, value, valueColor, capitalize, isLast, customValue }: DetailRowProps) {
  return (
    <View style={[styles.detailRow, !isLast && styles.detailRowDivider]}>
      <Text style={styles.detailRowLabel}>{label}</Text>
      {customValue ?? (
        <Text style={[
          styles.detailRowValue,
          valueColor ? { color: valueColor } : {},
          capitalize ? styles.capitalizeText : {},
        ]}>
          {value}
        </Text>
      )}
    </View>
  );
}

interface StatusPickerProps {
  currentState: string;
  onChangeState: (state: NoteStatus) => void;
  updating: boolean;
}

function StatusPicker({ currentState, onChangeState, updating }: StatusPickerProps) {
  const statuses: NoteStatus[] = ['open', 'resolved', 'archived'];
  if (updating) {
    return <ActivityIndicator size="small" color={Colors.accent} />;
  }
  return (
    <View style={styles.statusPicker}>
      {statuses.map((s) => {
        const isActive = currentState === s;
        return (
          <TouchableOpacity
            key={s}
            style={[styles.statusPill, isActive && { backgroundColor: STATUS_COLORS[s], borderColor: STATUS_COLORS[s] }]}
            onPress={() => !isActive && onChangeState(s)}
          >
            <Text style={[styles.statusPillText, isActive && styles.statusPillTextActive]}>
              {STATUS_LABELS[s]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Search
  searchContainer: {
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.bg,
  },

  // Primary filter bar
  primaryFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  primaryFilterContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  primaryPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  primaryPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  primaryPillText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  primaryPillTextActive: {
    color: '#FFFFFF',
  },
  filterIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bgMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  filterIconBtnActive: {
    backgroundColor: Colors.accentLight,
    borderColor: Colors.accentBorder,
  },

  // Loading / Error
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 48 },
  errorText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginBottom: 16 },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.bgMuted,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  retryBtnText: { color: Colors.textSecondary, fontWeight: '500' },

  // List
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xxl,
  },
  listEmpty: { flex: 1 },
  loadingFooter: { paddingVertical: 16, alignItems: 'center' },
  listSectionHeader: {
    backgroundColor: Colors.bg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  listSectionHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Note row (card)
  noteRow: {
    backgroundColor: Colors.bg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  noteRowDone: { opacity: 0.5 },
  noteTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
    lineHeight: 22,
    marginBottom: 5,
  },
  noteTitleDone: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  noteBody: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
    marginBottom: 5,
  },
  noteMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  noteSubtitle: { fontSize: 12, color: Colors.textMuted },
  noteDot: { fontSize: 12, color: Colors.textFaint },
  noteDate: { fontSize: 12, color: Colors.textFaint },
  urgencyDot: { width: 6, height: 6, borderRadius: 3, marginRight: 3 },
  noteUrgency: { fontSize: 11, fontWeight: '500' },
  noteNextAction: { fontSize: 12, color: Colors.accent, marginTop: 5 },
  matchScore: { fontSize: 12, color: Colors.accent, fontWeight: '500' },

  // Empty State
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 48 },
  emptyStateIcon: { fontSize: 52, marginBottom: 16 },
  emptyStateTitle: { fontSize: 18, fontWeight: '600', color: Colors.text, marginBottom: 8 },
  emptyStateText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  clearFiltersBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.bgMuted,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  clearFiltersBtnText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '500' },

  // Context banners (geofence + stale)
  geofenceBanner: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: '#EFF6FF',
    paddingBottom: 12,
  },
  geofenceBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  geofenceDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3b82f6' },
  geofenceBannerTitle: { color: '#1d4ed8', fontSize: 13, fontWeight: '600' },
  geofenceCard: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  geofenceCardLabel: { color: '#3b82f6', fontSize: 10, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' },

  staleBanner: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.warningBg,
  },
  staleBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  staleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  staleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f59e0b' },
  staleBannerTitle: { color: Colors.warning, fontSize: 13, fontWeight: '600' },
  staleCardAge: { color: Colors.warning, fontSize: 10, fontWeight: '700', marginBottom: 4 },

  contextCardsRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 10, flexDirection: 'row' },
  contextCard: {
    width: 148,
    backgroundColor: Colors.bg,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
  },
  contextCardContent: { color: Colors.text, fontSize: 12, lineHeight: 16, marginBottom: 4 },
  contextCardAction: { color: Colors.textMuted, fontSize: 11, fontStyle: 'italic' },

  // Dashboard
  dashboardCard: {
    backgroundColor: Colors.bgSurface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dashboardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dashboardDot: { width: 8, height: 8, borderRadius: 4 },
  dashboardTitle: { color: Colors.text, fontSize: 13, fontWeight: '500' },
  dashboardBody: { paddingHorizontal: 16, paddingBottom: 12 },
  dashboardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  dashStat: {
    backgroundColor: Colors.bgMuted,
    borderRadius: Radius.sm,
    padding: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  dashStatValue: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  dashStatLabel: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },
  dashboardMeta: { color: Colors.textMuted, fontSize: 12 },

  // Filter sheet
  sheetContainer: { flex: 1, backgroundColor: Colors.bg },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  sheetTitle: { fontSize: 16, fontWeight: '600', color: Colors.text },
  sheetCancel: { color: Colors.textMuted, fontSize: 15 },
  sheetReset: { color: Colors.accent, fontSize: 15 },
  sheetBody: { flex: 1, padding: Spacing.xxl },
  sheetSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.md,
  },
  sheetChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  sheetChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgMuted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sheetChipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  sheetChipText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  sheetChipTextSelected: { color: '#FFFFFF' },
  sheetFooter: {
    padding: Spacing.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  applyBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },

  // Detail modal
  modalContainer: { flex: 1, backgroundColor: Colors.bg },
  modalKeyboardView: { flex: 1 },
  modalLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalScroll: { flex: 1, paddingHorizontal: Spacing.xxl },
  headerCloseBtn: { color: Colors.textMuted, fontSize: 15 },
  headerCancelBtn: { color: Colors.textMuted, fontSize: 15 },
  headerEditBtn: { color: Colors.accent, fontSize: 15, fontWeight: '600' },

  noteSummaryLine: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    textTransform: 'capitalize',
  },
  detailNoteContent: {
    fontSize: 17,
    color: Colors.text,
    lineHeight: 27,
    marginBottom: Spacing.xxl,
  },

  editSection: { marginBottom: Spacing.xxl },
  editInput: {
    backgroundColor: Colors.bgMuted,
    borderRadius: Radius.sm,
    padding: Spacing.lg,
    color: Colors.text,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 140,
    textAlignVertical: 'top',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  updateError: { color: Colors.error, fontSize: 13, marginTop: 8 },

  // Quick actions
  quickActionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    backgroundColor: Colors.bgSurface,
    borderRadius: Radius.md,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  quickActionDisabled: { opacity: 0.35 },
  quickActionLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  quickActionLabelActive: { color: Colors.success },
  quickActionLabelDisabled: { color: Colors.textFaint },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginBottom: Spacing.xxl,
  },

  // Details section
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.md,
  },
  detailsCard: {
    backgroundColor: Colors.bgSurface,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
  },
  detailRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  detailRowLabel: { fontSize: 14, color: Colors.textMuted },
  detailRowValue: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  capitalizeText: { textTransform: 'capitalize' },

  // Status picker
  statusPicker: { flexDirection: 'row', gap: 6 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgMuted,
  },
  statusPillText: { fontSize: 12, color: Colors.textMuted },
  statusPillTextActive: { color: '#fff', fontWeight: '600' },

  // Keywords
  keywordsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  keywordPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: Colors.bgMuted,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  keywordText: { fontSize: 12, color: Colors.textSecondary },

  // Advanced details
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.lg,
    marginTop: Spacing.lg,
  },
  advancedToggleText: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
  advancedCard: {
    backgroundColor: Colors.bgSurface,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  entitiesRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  entitiesList: { marginTop: 6 },
  entityItem: { fontSize: 13, color: Colors.text, lineHeight: 20 },
  entityTypeLabel: { color: Colors.textMuted, textTransform: 'capitalize' },
});
