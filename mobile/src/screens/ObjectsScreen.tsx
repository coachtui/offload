import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
import { RouteProp, useRoute, useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { useObjects } from '../hooks/useObjects';
import { useSearch, ObjectDomain, ObjectType } from '../hooks/useSearch';
import { useCategories } from '../hooks/useCategories';
import { AtomicObject } from '../types';
import type { RagSearchResult, DashboardMetrics } from '../services/api';
import { apiService } from '../services/api';
import {
  AppScreen,
  AppHeader,
  AppSearchBar,
  AppSheet,
  ConfirmSheet,
  useToast,
  Spacing,
  Radius,
} from '../components/ui';
import { Fonts, ThemeColors, useTheme, useThemedStyles } from '../theme';

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

// Category hues harmonized with the Deep Lagoon palette
const DOMAIN_COLORS: Record<string, string> = {
  work: '#2C6E8F',
  personal: '#7A5FB0',
  health: '#1E7B54',
  family: '#A1740C',
  finance: '#0F6B5F',
  project: '#B0508A',
  misc: '#5F6B66',
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
  commitment: 'Commitment',
  preference: 'Preference',
  concern: 'Concern',
};

const STATUS_LABELS: Record<NoteStatus, string> = {
  open: 'Open',
  active: 'In Progress',
  resolved: 'Done',
  archived: 'Archived',
};

const STATUS_COLORS: Record<string, string> = {
  open: '#5F6B66',
  active: '#2C6E8F',
  resolved: '#1E6B4F',
  archived: '#9AA39E',
};

const URGENCY_COLORS: Record<string, string> = {
  high: '#C2492F',
  medium: '#A1740C',
  low: '#1E6B4F',
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
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const route = useRoute<RouteProp<RootStackParamList, 'Objects'>>();
  const geofenceId = route.params?.geofenceId;
  const initialObjectId = route.params?.objectId;

  const {
    objects, isLoading, isRefreshing, error, hasMore,
    object: selectedObject, isLoadingDetail, isUpdating, updateError,
    filters, refresh, loadMore, setFilters, fetchObjectDetail, updateObject, clearDetail, deleteObject, bulkDeleteObjects, bulkMoveObjects,
  } = useObjects();

  const { categories, refresh: refreshCategories } = useCategories();

  const { results: searchResults, loading: searchLoading, search, clearResults } = useSearch();

  // UI state
  const [modalVisible, setModalVisible] = useState(false);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [updatingState, setUpdatingState] = useState(false);

  // Filter state
  const [primaryFilter, setPrimaryFilter] = useState<PrimaryFilter>('all');
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  // Pending filter state (inside sheet before Apply)
  const [pendingDomains, setPendingDomains] = useState<string[]>([]);
  const [pendingTypes, setPendingTypes] = useState<string[]>([]);

  // Selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Confirmation / move sheets (replace Alert.alert)
  const toast = useToast();
  const [confirmBulkVisible, setConfirmBulkVisible] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [moveSheetVisible, setMoveSheetVisible] = useState(false);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const ok = await bulkDeleteObjects(ids);
    if (ok) {
      exitSelection();
      toast.show({
        message: `Deleted ${ids.length} note${ids.length === 1 ? '' : 's'}`,
        tone: 'success',
      });
    } else {
      toast.show({ message: "Couldn't delete", description: 'Please try again.', tone: 'error' });
    }
  }, [selectedIds, bulkDeleteObjects, exitSelection, toast]);

  const isSearchMode = searchText.trim().length > 0;
  const hasActiveFilters = selectedDomains.length > 0 || selectedTypes.length > 0;

  // Context data
  const [staleObjects, setStaleObjects] = useState<AtomicObject[]>([]);
  const [staleExpanded, setStaleExpanded] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardMetrics | null>(null);
  const [dashboardExpanded, setDashboardExpanded] = useState(false);
  const [geofenceObjects, setGeofenceObjects] = useState<AtomicObject[]>([]);

  useFocusEffect(
    useCallback(() => { refreshCategories(); }, [refreshCategories])
  );

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

  const renderCategoryChips = useCallback(() => {
    if (categories.length === 0) return null;
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterChipsRow}
        contentContainerStyle={styles.filterChipsContent}
      >
        <TouchableOpacity
          style={[styles.filterChip, !filters.categoryId && styles.filterChipActive]}
          onPress={() => { if (filters.categoryId) setFilters({ ...filters, categoryId: undefined }); }}
          accessibilityRole="button"
          accessibilityState={{ selected: !filters.categoryId }}
        >
          <Text style={[styles.filterChipText, !filters.categoryId && styles.filterChipTextActive]}>All</Text>
        </TouchableOpacity>
        {categories.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.filterChip, filters.categoryId === c.id && styles.filterChipActive]}
            onPress={() => setFilters({ ...filters, categoryId: c.id })}
            accessibilityRole="button"
            accessibilityState={{ selected: filters.categoryId === c.id }}
          >
            <View style={[styles.swatchSm, { backgroundColor: c.color }]} />
            <Text style={[styles.filterChipText, filters.categoryId === c.id && styles.filterChipTextActive]}>{c.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }, [categories, filters, setFilters, styles]);

  // ─── Modal / detail actions ───────────────────────────────────────────────

  const openDetail = useCallback(async (id: string) => {
    setModalVisible(true);
    setEditMode(false);
    setDetailsExpanded(false);
    await fetchObjectDetail(id);
  }, [fetchObjectDetail]);

  const handleObjectPress = useCallback((item: AtomicObject) => openDetail(item.id), [openDetail]);
  const handleSearchResultPress = useCallback((item: RagSearchResult) => openDetail(item.objectId), [openDetail]);

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    setEditMode(false);
    setEditContent('');
    setDetailsExpanded(false);
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

  const handleDeleteNote = useCallback((objectId: string) => {
    setConfirmDeleteId(objectId);
  }, []);

  const performDeleteNote = useCallback(async () => {
    if (!confirmDeleteId) return;
    const ok = await deleteObject(confirmDeleteId);
    if (ok) {
      handleCloseModal();
      toast.show({ message: 'Note deleted', tone: 'success' });
    } else {
      toast.show({ message: "Couldn't delete", description: 'Please try again.', tone: 'error' });
    }
  }, [confirmDeleteId, deleteObject, handleCloseModal, toast]);

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
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
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
        accessibilityRole="button"
        accessibilityLabel="Filter notes"
        accessibilityState={{ selected: hasActiveFilters }}
      >
        <Ionicons
          name="options-outline"
          size={18}
          color={hasActiveFilters ? colors.accent : colors.textMuted}
        />
      </TouchableOpacity>
    </View>
  ), [primaryFilter, hasActiveFilters, handlePrimaryFilterPress, handleOpenFilterSheet, styles, colors]);

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
  }, [geofenceId, geofenceObjects, handleObjectPress, styles]);

  const renderDashboardCard = useCallback(() => {
    if (!dashboard) return null;
    const loadLevel = dashboard.cognitiveLoad.level;
    const loadColor =
      loadLevel === 'low' ? colors.success : loadLevel === 'moderate' ? colors.warning : colors.error;
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
          <Ionicons name={dashboardExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textFaint} />
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
  }, [dashboard, dashboardExpanded, styles, colors]);

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
          <Ionicons name={staleExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textFaint} />
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
  }, [staleObjects, staleExpanded, handleObjectPress, styles, colors]);

  const renderNoteCard = useCallback(({ item }: { item: AtomicObject }) => {
    const title = item.title || item.content;
    const subtitle = buildCardSubtitle(item.objectType, item.domain);
    const urgency = item.metadata?.urgency;
    const showUrgency = urgency === 'high' || urgency === 'medium';
    const currentState = (item as any).state ?? 'open';
    const isDone = currentState === 'resolved' || currentState === 'archived';
    const isSelected = selectedIds.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.noteRow, isDone && styles.noteRowDone, selectionMode && styles.noteRowSelecting]}
        onPress={() => selectionMode ? toggleSelected(item.id) : handleObjectPress(item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={selectionMode ? { selected: isSelected } : undefined}
      >
        {selectionMode && (
          <Ionicons
            name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={isSelected ? colors.accent : colors.textFaint}
            style={styles.noteCheckbox}
          />
        )}
        <View style={selectionMode ? styles.noteRowBody : undefined}>
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
          {item.whyItMatters ? (
            <Text style={styles.noteWhy} numberOfLines={2}>Why: {item.whyItMatters}</Text>
          ) : null}
          {item.actionability?.nextAction && !isDone && (
            <Text style={styles.noteNextAction} numberOfLines={1}>
              → {item.actionability.nextAction}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [selectionMode, selectedIds, toggleSelected, handleObjectPress, styles, colors]);

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
  }, [handleSearchResultPress, styles]);

  const renderEmpty = useCallback(() => {
    if (isLoading || searchLoading) return null;
    const hasFilters = isSearchMode || selectedDomains.length > 0 || selectedTypes.length > 0;
    return (
      <View style={styles.emptyState}>
        <Ionicons
          name={hasFilters ? 'search-outline' : 'document-text-outline'}
          size={48}
          color={colors.borderStrong}
          style={styles.emptyStateIcon}
        />
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
  }, [isLoading, searchLoading, isSearchMode, selectedDomains, selectedTypes, handleClearAllFilters, styles, colors]);

  const renderSectionHeader = useCallback(
    ({ section: { title } }: { section: NoteSection }) => (
      <View style={styles.listSectionHeader}>
        <Text style={styles.listSectionHeaderText}>{title}</Text>
      </View>
    ),
    [styles]
  );

  const renderFooter = useCallback(() => {
    if (!hasMore || isLoading) return null;
    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }, [hasMore, isLoading, styles, colors]);

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
              const color = DOMAIN_COLORS[domain] ?? colors.textMuted;
              return (
                <TouchableOpacity
                  key={domain}
                  style={[styles.sheetChip, isSelected && { backgroundColor: color, borderColor: color }]}
                  onPress={() => setPendingDomains(prev =>
                    prev.includes(domain) ? prev.filter(d => d !== domain) : [...prev, domain]
                  )}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
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
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
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
                    ? <ActivityIndicator size="small" color={colors.accent} />
                    : <Text style={styles.headerEditBtn}>Save</Text>
                  }
                </TouchableOpacity>
              ) : undefined
            }
          />

          {isLoadingDetail ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator size="large" color={colors.accent} />
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
                    placeholderTextColor={colors.textFaint}
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
                      onPress={() => toast.show({ message: 'Coming soon', description: 'Reminders are on the way.' })}
                    />
                    <QuickAction
                      icon="bookmark-outline"
                      label="Pin"
                      onPress={() => toast.show({ message: 'Coming soon', description: 'Pinning notes is on the way.' })}
                    />
                    <QuickAction
                      icon="pencil-outline"
                      label="Edit"
                      onPress={handleEditPress}
                    />
                    <TouchableOpacity
                      style={styles.quickAction}
                      onPress={() => selectedObject && handleDeleteNote(selectedObject.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={20} color={colors.error} />
                      <Text style={[styles.quickActionLabel, { color: colors.error }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>

                  {/* ··· Details toggle */}
                  <TouchableOpacity
                    style={styles.dotsToggle}
                    onPress={() => setDetailsExpanded((v) => !v)}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={detailsExpanded ? 'Hide details' : 'Show details'}
                    accessibilityState={{ expanded: detailsExpanded }}
                  >
                    <Ionicons
                      name={detailsExpanded ? 'chevron-up' : 'ellipsis-horizontal'}
                      size={18}
                      color={colors.textFaint}
                    />
                  </TouchableOpacity>

                  {detailsExpanded && (
                    <>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.categoryPickerRow}
                        style={{ marginBottom: Spacing.lg }}
                      >
                        <TouchableOpacity
                          style={[styles.categoryChip, !selectedObject?.categoryId && styles.categoryChipActive]}
                          onPress={() => selectedObject && updateObject(selectedObject.id, { categoryId: null } as any)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: !selectedObject?.categoryId }}
                        >
                          <Text style={[styles.categoryChipText, !selectedObject?.categoryId && styles.categoryChipTextActive]}>None</Text>
                        </TouchableOpacity>
                        {categories.map((c) => (
                          <TouchableOpacity
                            key={c.id}
                            style={[styles.categoryChip, selectedObject?.categoryId === c.id && styles.categoryChipActive, { borderColor: c.color }]}
                            onPress={() => selectedObject && updateObject(selectedObject.id, { categoryId: c.id } as any)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: selectedObject?.categoryId === c.id }}
                          >
                            <View style={[styles.swatchSm, { backgroundColor: c.color }]} />
                            <Text style={[styles.categoryChipText, selectedObject?.categoryId === c.id && styles.categoryChipTextActive]}>{c.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>

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
                          label="AI confidence"
                          value={`${Math.round(selectedObject.confidence * 100)}%`}
                        />
                        {selectedObject.metadata.tags.length > 0 && (
                          <DetailRow
                            label="Keywords"
                            value={selectedObject.metadata.tags.join(', ')}
                          />
                        )}
                        <DetailRow
                          label="Created"
                          value={formatFullDate(selectedObject.createdAt)}
                          isLast
                        />
                      </View>
                    </>
                  )}

                  <View style={{ height: 48 }} />
                </>
              )}
            </ScrollView>
          ) : null}
        </KeyboardAvoidingView>

        {/* Rendered inside the modal subtree so it stacks above the pageSheet */}
        <ConfirmSheet
          visible={confirmDeleteId != null}
          onClose={() => setConfirmDeleteId(null)}
          onConfirm={performDeleteNote}
          title="Delete note?"
          message="This note will be removed. You can't undo this from the app."
          confirmLabel="Delete"
          destructive
        />
      </SafeAreaView>
    </Modal>
  );

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <AppScreen>
      <AppHeader
        title="Notes"
        left={
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        }
        right={
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={() => navigation.navigate('Categories')}
              accessibilityRole="button"
              accessibilityLabel="Manage categories"
            >
              <Ionicons name="pricetags-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => selectionMode ? exitSelection() : setSelectionMode(true)}>
              <Text style={styles.headerActionText}>{selectionMode ? 'Cancel' : 'Select'}</Text>
            </TouchableOpacity>
          </View>
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
      {renderCategoryChips()}
      {renderGeofenceContext()}
      {renderDashboardCard()}
      {renderStaleBanner()}

      {(isLoading || searchLoading) && (isSearchMode ? searchResults.length === 0 : objects.length === 0) ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
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
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {selectionMode && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionCount}>{selectedIds.size} selected</Text>
          <View style={styles.selectionActions}>
            <TouchableOpacity
              style={[styles.selectionMoveBtn, selectedIds.size === 0 && { opacity: 0.5 }]}
              disabled={selectedIds.size === 0}
              onPress={() => setMoveSheetVisible(true)}
            >
              <Ionicons name="pricetag-outline" size={20} color={colors.accent} />
              <Text style={styles.selectionMoveText}>Move</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectionDeleteBtn, selectedIds.size === 0 && { opacity: 0.5 }]}
              disabled={selectedIds.size === 0}
              onPress={() => setConfirmBulkVisible(true)}
            >
              <Ionicons name="trash-outline" size={20} color="#fff" />
              <Text style={styles.selectionDeleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {renderDetailModal()}
      {renderFilterSheet()}

      <ConfirmSheet
        visible={confirmBulkVisible}
        onClose={() => setConfirmBulkVisible(false)}
        onConfirm={handleBulkDelete}
        title={`Delete ${selectedIds.size} note${selectedIds.size === 1 ? '' : 's'}?`}
        message="This can't be undone from the app."
        confirmLabel="Delete"
        destructive
      />

      <AppSheet
        visible={moveSheetVisible}
        onClose={() => setMoveSheetVisible(false)}
        title="Move to category"
      >
        <ScrollView style={styles.moveSheetList}>
          <TouchableOpacity
            style={styles.moveSheetRow}
            onPress={async () => {
              setMoveSheetVisible(false);
              if (await bulkMoveObjects(Array.from(selectedIds), null)) exitSelection();
            }}
          >
            <Ionicons name="remove-circle-outline" size={18} color={colors.textMuted} />
            <Text style={styles.moveSheetRowText}>None (uncategorize)</Text>
          </TouchableOpacity>
          {categories.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={styles.moveSheetRow}
              onPress={async () => {
                setMoveSheetVisible(false);
                if (await bulkMoveObjects(Array.from(selectedIds), c.id)) exitSelection();
              }}
            >
              <View style={[styles.swatchSm, { backgroundColor: c.color }]} />
              <Text style={styles.moveSheetRowText}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </AppSheet>
    </AppScreen>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DashStat({ label, value }: { label: string; value: number }) {
  const styles = useThemedStyles(createStyles);
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
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <TouchableOpacity
      style={[styles.quickAction, disabled && styles.quickActionDisabled]}
      onPress={disabled ? undefined : onPress}
      activeOpacity={disabled ? 1 : 0.7}
    >
      <Ionicons
        name={icon as any}
        size={20}
        color={active ? colors.success : disabled ? colors.textFaint : colors.textSecondary}
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
  const styles = useThemedStyles(createStyles);
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
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const statuses: NoteStatus[] = ['open', 'resolved', 'archived'];
  if (updating) {
    return <ActivityIndicator size="small" color={colors.accent} />;
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
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
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

const createStyles = (c: ThemeColors) => StyleSheet.create({
  // Search
  searchContainer: {
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    backgroundColor: c.bg,
  },

  // Primary filter bar
  primaryFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
    backgroundColor: c.bg,
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
    backgroundColor: c.bgMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  primaryPillActive: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  primaryPillText: {
    color: c.textMuted,
    fontSize: 13,
    fontFamily: Fonts.medium,
  },
  primaryPillTextActive: {
    color: '#FFFFFF',
  },
  filterIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.bgMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  filterIconBtnActive: {
    backgroundColor: c.accentLight,
    borderColor: c.accentBorder,
  },

  // Loading / Error
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 48 },
  errorText: { fontSize: 14, color: c.textMuted, textAlign: 'center', marginBottom: 16 },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: c.bgMuted,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  retryBtnText: { color: c.textSecondary, fontFamily: Fonts.medium },

  // List
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xxl,
  },
  listEmpty: { flex: 1 },
  loadingFooter: { paddingVertical: 16, alignItems: 'center' },
  listSectionHeader: {
    backgroundColor: c.bg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  listSectionHeaderText: {
    fontSize: 12,
    fontFamily: Fonts.semibold,
    color: c.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Note row (card)
  noteRow: {
    backgroundColor: c.bgSurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  noteRowDone: { opacity: 0.5 },
  noteTitle: {
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: c.text,
    lineHeight: 22,
    marginBottom: 5,
  },
  noteTitleDone: {
    textDecorationLine: 'line-through',
    color: c.textMuted,
  },
  noteBody: {
    fontSize: 13,
    color: c.textSecondary,
    lineHeight: 19,
    marginBottom: 5,
  },
  noteMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  noteSubtitle: { fontSize: 12, color: c.textMuted },
  noteDot: { fontSize: 12, color: c.textFaint },
  noteDate: { fontSize: 12, color: c.textFaint },
  urgencyDot: { width: 6, height: 6, borderRadius: 3, marginRight: 3 },
  noteUrgency: { fontSize: 11, fontFamily: Fonts.medium },
  noteWhy: { color: c.textMuted, fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  noteNextAction: { fontSize: 12, color: c.accent, marginTop: 5 },
  matchScore: { fontSize: 12, color: c.accent, fontFamily: Fonts.medium },

  // Empty State
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 48 },
  emptyStateIcon: { marginBottom: 16 },
  emptyStateTitle: { fontSize: 18, fontFamily: Fonts.semibold, color: c.text, marginBottom: 8 },
  emptyStateText: { fontSize: 14, color: c.textMuted, textAlign: 'center', lineHeight: 20 },
  clearFiltersBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: c.bgMuted,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  clearFiltersBtnText: { color: c.textSecondary, fontSize: 14, fontFamily: Fonts.medium },

  // Context banners (geofence + stale)
  geofenceBanner: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
    backgroundColor: c.accentLight,
    paddingBottom: 12,
  },
  geofenceBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  geofenceDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent },
  geofenceBannerTitle: { color: c.accent, fontSize: 13, fontFamily: Fonts.semibold },
  geofenceCard: { backgroundColor: c.bgSurface, borderColor: c.accentBorder },
  geofenceCardLabel: { color: c.accent, fontSize: 10, fontFamily: Fonts.bold, marginBottom: 4, textTransform: 'uppercase' },

  staleBanner: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
    backgroundColor: c.warningBg,
  },
  staleBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  staleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  staleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.warning },
  staleBannerTitle: { color: c.warning, fontSize: 13, fontFamily: Fonts.semibold },
  staleCardAge: { color: c.warning, fontSize: 10, fontFamily: Fonts.bold, marginBottom: 4 },

  contextCardsRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 10, flexDirection: 'row' },
  contextCard: {
    width: 148,
    backgroundColor: c.bgSurface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: c.warningBorder,
  },
  contextCardContent: { color: c.text, fontSize: 12, lineHeight: 16, marginBottom: 4 },
  contextCardAction: { color: c.textMuted, fontSize: 11, fontStyle: 'italic' },

  // Dashboard
  dashboardCard: {
    backgroundColor: c.bgSurface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
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
  dashboardTitle: { color: c.text, fontSize: 13, fontFamily: Fonts.medium },
  dashboardBody: { paddingHorizontal: 16, paddingBottom: 12 },
  dashboardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  dashStat: {
    backgroundColor: c.bgMuted,
    borderRadius: Radius.sm,
    padding: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  dashStatValue: { color: c.text, fontSize: 18, fontFamily: Fonts.bold },
  dashStatLabel: { color: c.textMuted, fontSize: 10, marginTop: 2 },
  dashboardMeta: { color: c.textMuted, fontSize: 12 },

  // Filter sheet
  sheetContainer: { flex: 1, backgroundColor: c.bg },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  sheetTitle: { fontSize: 16, fontFamily: Fonts.semibold, color: c.text },
  sheetCancel: { color: c.textMuted, fontSize: 15 },
  sheetReset: { color: c.accent, fontSize: 15 },
  sheetBody: { flex: 1, padding: Spacing.xxl },
  sheetSectionLabel: {
    fontSize: 12,
    fontFamily: Fonts.semibold,
    color: c.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.md,
  },
  sheetChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  sheetChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: c.bgMuted,
    borderWidth: 1,
    borderColor: c.border,
  },
  sheetChipSelected: { backgroundColor: c.primary, borderColor: c.primary },
  sheetChipText: { fontSize: 13, color: c.textSecondary, fontFamily: Fonts.medium },
  sheetChipTextSelected: { color: '#FFFFFF' },
  sheetFooter: {
    padding: Spacing.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  applyBtn: {
    backgroundColor: c.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyBtnText: { color: '#fff', fontFamily: Fonts.semibold, fontSize: 16 },

  // Detail modal
  modalContainer: { flex: 1, backgroundColor: c.bg },
  modalKeyboardView: { flex: 1 },
  modalLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalScroll: { flex: 1, paddingHorizontal: Spacing.xxl },
  headerCloseBtn: { color: c.textMuted, fontSize: 15 },
  headerCancelBtn: { color: c.textMuted, fontSize: 15 },
  headerEditBtn: { color: c.accent, fontSize: 15, fontFamily: Fonts.semibold },

  noteSummaryLine: {
    fontSize: 13,
    color: c.textMuted,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    textTransform: 'capitalize',
  },
  detailNoteContent: {
    fontSize: 17,
    color: c.text,
    lineHeight: 27,
    marginBottom: Spacing.xxl,
  },

  editSection: { marginBottom: Spacing.xxl },
  editInput: {
    backgroundColor: c.bgMuted,
    borderRadius: Radius.sm,
    padding: Spacing.lg,
    color: c.text,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 140,
    textAlignVertical: 'top',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  updateError: { color: c.error, fontSize: 13, marginTop: 8 },

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
    backgroundColor: c.bgSurface,
    borderRadius: Radius.md,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  quickActionDisabled: { opacity: 0.35 },
  quickActionLabel: { fontSize: 11, color: c.textSecondary, fontFamily: Fonts.medium },
  quickActionLabelActive: { color: c.success },
  quickActionLabelDisabled: { color: c.textFaint },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.border,
    marginBottom: Spacing.xxl,
  },
  dotsToggle: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },

  // Details section
  sectionLabel: {
    fontSize: 12,
    fontFamily: Fonts.semibold,
    color: c.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.md,
  },
  detailsCard: {
    backgroundColor: c.bgSurface,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
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
    borderBottomColor: c.border,
  },
  detailRowLabel: { fontSize: 14, color: c.textMuted },
  detailRowValue: {
    fontSize: 14,
    color: c.text,
    fontFamily: Fonts.medium,
    flex: 1,
    textAlign: 'right',
  },
  capitalizeText: { textTransform: 'capitalize' },

  // Header action (Select / Cancel toggle + Categories icon)
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerActionText: { color: c.accent, fontSize: 15, fontFamily: Fonts.semibold },

  // Selection mode card layout
  noteRowSelecting: { flexDirection: 'row', alignItems: 'flex-start' },
  noteCheckbox: { marginRight: Spacing.sm, marginTop: 2 },
  noteRowBody: { flex: 1 },

  // Selection action bar
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    backgroundColor: c.bgSurface,
  },
  selectionCount: { fontSize: 15, color: c.textSecondary, fontFamily: Fonts.semibold },
  selectionActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectionMoveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.bgSurface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    gap: 6,
    borderWidth: 1,
    borderColor: c.accentBorder,
  },
  selectionMoveText: { color: c.accent, fontFamily: Fonts.semibold },
  selectionDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.error,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    gap: 6,
  },
  selectionDeleteText: { color: '#FFFFFF', fontFamily: Fonts.semibold },

  // Move-to-category sheet
  moveSheetList: { maxHeight: 360 },
  moveSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  moveSheetRowText: { fontSize: 15, color: c.text, fontFamily: Fonts.medium },

  // Category filter chips (list screen)
  filterChipsRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
    backgroundColor: c.bg,
  },
  filterChipsContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: c.bgMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    gap: 5,
  },
  filterChipActive: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  filterChipText: {
    fontSize: 13,
    color: c.textSecondary,
    fontFamily: Fonts.medium,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  // Category picker (in detail modal)
  categoryPickerRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 0 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: c.bgMuted,
    borderWidth: 1,
    borderColor: c.border,
    gap: 5,
  },
  categoryChipActive: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  categoryChipText: { fontSize: 13, color: c.textSecondary, fontFamily: Fonts.medium },
  categoryChipTextActive: { color: '#FFFFFF' },
  swatchSm: { width: 10, height: 10, borderRadius: 5 },

  // Status picker
  statusPicker: { flexDirection: 'row', gap: 6 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.bgMuted,
  },
  statusPillText: { fontSize: 12, color: c.textMuted },
  statusPillTextActive: { color: '#fff', fontFamily: Fonts.semibold },

  // Keywords
  keywordsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  keywordPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: c.bgMuted,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  keywordText: { fontSize: 12, color: c.textSecondary },

  // Advanced details
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.lg,
    marginTop: Spacing.lg,
  },
  advancedToggleText: { fontSize: 13, color: c.textMuted, fontFamily: Fonts.medium },
  advancedCard: {
    backgroundColor: c.bgSurface,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  entitiesRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  entitiesList: { marginTop: 6 },
  entityItem: { fontSize: 13, color: c.text, lineHeight: 20 },
  entityTypeLabel: { color: c.textMuted, textTransform: 'capitalize' },
});
