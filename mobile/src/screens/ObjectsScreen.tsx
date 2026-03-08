import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useRoute } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { useObjects } from '../hooks/useObjects';
import { useSearch } from '../hooks/useSearch';
import { AtomicObject } from '../types';
import type { RagSearchResult, DashboardMetrics } from '../services/api';
import { apiService } from '../services/api';

type ObjectsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Objects'>;

interface Props {
  navigation: ObjectsScreenNavigationProp;
}

const DOMAINS = ['work', 'personal', 'health', 'family', 'finance', 'project', 'misc'];
const OBJECT_TYPES = ['task', 'idea', 'reminder', 'decision', 'question', 'observation'];

const DOMAIN_COLORS: Record<string, string> = {
  work: '#3b82f6',
  personal: '#8b5cf6',
  health: '#22c55e',
  family: '#f59e0b',
  finance: '#06b6d4',
  project: '#ec4899',
  misc: '#6b7280',
};

const STATE_COLORS: Record<string, string> = {
  open: '#6b7280',
  active: '#3b82f6',
  resolved: '#22c55e',
  archived: '#9ca3af',
};

const TYPE_COLORS: Record<string, string> = {
  task: '#3b82f6',
  idea: '#f59e0b',
  reminder: '#ef4444',
  decision: '#10b981',
  question: '#a855f7',
  observation: '#6b7280',
  journal: '#ec4899',
  reference: '#6ee7b7',
};

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

function getUrgencyColor(urgency: 'low' | 'medium' | 'high'): string {
  switch (urgency) {
    case 'high':
      return '#ef4444';
    case 'medium':
      return '#f59e0b';
    case 'low':
      return '#22c55e';
    default:
      return '#666';
  }
}

export function ObjectsScreen({ navigation }: Props) {
  const route = useRoute<RouteProp<RootStackParamList, 'Objects'>>();
  const geofenceId = route.params?.geofenceId;
  const initialObjectId = route.params?.objectId;
  const {
    objects,
    isLoading,
    isRefreshing,
    error,
    hasMore,
    filters,
    object: selectedObject,
    isLoadingDetail,
    isUpdating,
    updateError,
    refresh,
    loadMore,
    setFilters,
    fetchObjectDetail,
    updateObject,
    clearDetail,
  } = useObjects();

  const { results: searchResults, loading: searchLoading, search, clearResults } = useSearch();

  const [modalVisible, setModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');

  const isSearchMode = searchText.trim().length > 0;

  // Stale actionables
  const [staleObjects, setStaleObjects] = useState<AtomicObject[]>([]);
  const [staleExpanded, setStaleExpanded] = useState(true);

  // Dashboard
  const [dashboard, setDashboard] = useState<DashboardMetrics | null>(null);
  const [dashboardExpanded, setDashboardExpanded] = useState(false);

  // State update
  const [updatingState, setUpdatingState] = useState(false);

  useEffect(() => {
    apiService.getStaleActionables()
      .then(({ objects }) => setStaleObjects(objects))
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiService.getDashboard()
      .then((metrics) => setDashboard(metrics))
      .catch(() => {});
  }, []);

  // Auto-open detail modal when navigated with an objectId (e.g. from SearchScreen or RecordScreen)
  useEffect(() => {
    if (!initialObjectId) return;
    setModalVisible(true);
    fetchObjectDetail(initialObjectId);
  }, [initialObjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Geofence context (when navigated from a notification)
  const [geofenceObjects, setGeofenceObjects] = useState<AtomicObject[]>([]);

  useEffect(() => {
    if (!geofenceId) return;
    apiService.getGeofenceObjects(geofenceId)
      .then(({ objects }) => setGeofenceObjects(objects))
      .catch(() => {});
  }, [geofenceId]);

  const triggerSearch = useCallback((text: string, domains: string[], types: string[]) => {
    search(text, {
      domain: domains.length ? domains : undefined,
      objectType: types.length ? types : undefined,
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

  const handleDomainToggle = useCallback((domain: string) => {
    const next = selectedDomains.includes(domain)
      ? selectedDomains.filter(d => d !== domain)
      : [...selectedDomains, domain];
    setSelectedDomains(next);
    if (searchText.trim()) {
      triggerSearch(searchText, next, selectedTypes);
    } else {
      triggerBrowse(next, selectedTypes);
    }
  }, [selectedDomains, selectedTypes, searchText, triggerSearch, triggerBrowse]);

  const handleTypeToggle = useCallback((type: string) => {
    const next = selectedTypes.includes(type)
      ? selectedTypes.filter(t => t !== type)
      : [...selectedTypes, type];
    setSelectedTypes(next);
    if (searchText.trim()) {
      triggerSearch(searchText, selectedDomains, next);
    } else {
      triggerBrowse(selectedDomains, next);
    }
  }, [selectedTypes, selectedDomains, searchText, triggerSearch, triggerBrowse]);

  const handleClearFilters = useCallback(() => {
    setSearchText('');
    setSelectedDomains([]);
    setSelectedTypes([]);
    clearResults();
    setFilters({});
  }, [setFilters, clearResults]);

  const handleObjectPress = useCallback(
    async (object: AtomicObject) => {
      setModalVisible(true);
      setEditMode(false);
      await fetchObjectDetail(object.id);
    },
    [fetchObjectDetail]
  );

  const handleSearchResultPress = useCallback(
    async (result: RagSearchResult) => {
      setModalVisible(true);
      setEditMode(false);
      await fetchObjectDetail(result.objectId);
    },
    [fetchObjectDetail]
  );

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    setEditMode(false);
    setEditContent('');
    clearDetail();
  }, [clearDetail]);

  const handleEditPress = useCallback(() => {
    if (selectedObject) {
      setEditContent(selectedObject.content);
      setEditMode(true);
    }
  }, [selectedObject]);

  const handleStateChange = useCallback(
    (objectId: string, currentState: string) => {
      const states: Array<'open' | 'active' | 'resolved' | 'archived'> = ['open', 'active', 'resolved', 'archived'];
      const options = states.filter((s) => s !== currentState);
      Alert.alert(
        'Change State',
        'Move this note to:',
        [
          ...options.map((s) => ({
            text: s.charAt(0).toUpperCase() + s.slice(1),
            onPress: async () => {
              setUpdatingState(true);
              try {
                await apiService.updateObjectState(objectId, s);
                await fetchObjectDetail(objectId);
              } catch { /* silent */ }
              finally { setUpdatingState(false); }
            },
          })),
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    },
    [fetchObjectDetail]
  );

  const handleSaveEdit = useCallback(async () => {
    if (selectedObject && editContent.trim()) {
      const success = await updateObject(selectedObject.id, { content: editContent.trim() });
      if (success) {
        setEditMode(false);
      }
    }
  }, [selectedObject, editContent, updateObject]);

  const handleCancelEdit = useCallback(() => {
    setEditMode(false);
    setEditContent('');
  }, []);

  const renderStaleCard = useCallback(
    (item: AtomicObject) => {
      const daysOld = Math.floor(
        (Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      const label = item.title || item.content;
      return (
        <TouchableOpacity
          key={item.id}
          style={styles.staleCard}
          onPress={() => handleObjectPress(item)}
          activeOpacity={0.7}
        >
          <Text style={styles.staleCardAge}>{daysOld}d old</Text>
          <Text style={styles.staleCardContent} numberOfLines={2}>
            {label}
          </Text>
          {item.actionability?.nextAction ? (
            <Text style={styles.staleCardAction} numberOfLines={1}>
              {item.actionability.nextAction}
            </Text>
          ) : null}
        </TouchableOpacity>
      );
    },
    [handleObjectPress]
  );

  const renderGeofenceContext = useCallback(() => {
    if (!geofenceId || geofenceObjects.length === 0) return null;
    return (
      <View style={styles.geofenceBanner}>
        <View style={styles.geofenceBannerHeader}>
          <View style={styles.geofenceDot} />
          <Text style={styles.geofenceBannerTitle}>
            At this location ({geofenceObjects.length} note{geofenceObjects.length !== 1 ? 's' : ''})
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.staleCardsRow}
        >
          {geofenceObjects.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.staleCard, styles.geofenceCard]}
              onPress={() => handleObjectPress(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.geofenceCardLabel}>linked</Text>
              <Text style={styles.staleCardContent} numberOfLines={2}>
                {item.title || item.content}
              </Text>
              {item.actionability?.nextAction ? (
                <Text style={styles.staleCardAction} numberOfLines={1}>
                  {item.actionability.nextAction}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }, [geofenceId, geofenceObjects, handleObjectPress]);

  const renderDashboardCard = useCallback(() => {
    if (!dashboard) return null;
    const loadColor = dashboard.cognitiveLoad.level === 'low' ? '#22c55e'
      : dashboard.cognitiveLoad.level === 'moderate' ? '#f59e0b'
      : '#ef4444';
    return (
      <View style={styles.dashboardCard}>
        <TouchableOpacity
          style={styles.dashboardHeader}
          onPress={() => setDashboardExpanded((v) => !v)}
          activeOpacity={0.7}
        >
          <View style={styles.dashboardTitleRow}>
            <View style={[styles.dashboardLoadDot, { backgroundColor: loadColor }]} />
            <Text style={styles.dashboardTitle}>
              Cognitive Load: {dashboard.cognitiveLoad.level}
            </Text>
          </View>
          <Text style={styles.dashboardChevron}>{dashboardExpanded ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {dashboardExpanded && (
          <View style={styles.dashboardBody}>
            <View style={styles.dashboardGrid}>
              <DashStat label="Active" value={dashboard.activeCommitments} />
              <DashStat label="Open Loops" value={dashboard.openLoops} />
              <DashStat label="Decisions" value={dashboard.unresolvedDecisions} />
              <DashStat label="New Ideas" value={dashboard.newIdeasThisWeek} />
              <DashStat label="This Week" value={dashboard.objectsThisWeek} />
              <DashStat label="Dormant" value={dashboard.dormantIdeasCount} />
            </View>
            {dashboard.topDomainThisWeek && (
              <Text style={styles.dashboardTopDomain}>
                Top domain this week: {dashboard.topDomainThisWeek}
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
          <View style={styles.staleBannerTitleRow}>
            <View style={styles.staleDot} />
            <Text style={styles.staleBannerTitle}>
              Needs Attention ({staleObjects.length})
            </Text>
          </View>
          <Text style={styles.staleBannerChevron}>{staleExpanded ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {staleExpanded && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.staleCardsRow}
          >
            {staleObjects.map(renderStaleCard)}
          </ScrollView>
        )}
      </View>
    );
  }, [staleObjects, staleExpanded, renderStaleCard]);

  const renderFilterChips = useCallback(() => (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chipRowContent}
      >
        {DOMAINS.map((domain) => {
          const isSelected = selectedDomains.includes(domain);
          return (
            <TouchableOpacity
              key={domain}
              style={[styles.chip, isSelected && { backgroundColor: DOMAIN_COLORS[domain] ?? '#3b82f6' }]}
              onPress={() => handleDomainToggle(domain)}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {domain}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chipRowContent}
      >
        {OBJECT_TYPES.map((type) => {
          const isSelected = selectedTypes.includes(type);
          return (
            <TouchableOpacity
              key={type}
              style={[styles.chip, isSelected && { backgroundColor: TYPE_COLORS[type] ?? '#6b7280' }]}
              onPress={() => handleTypeToggle(type)}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {type}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </>
  ), [selectedDomains, selectedTypes, handleDomainToggle, handleTypeToggle]);

  const renderObjectCard = useCallback(
    ({ item }: { item: AtomicObject }) => {
      const label = item.title || item.content;
      const domainColor = item.domain ? (DOMAIN_COLORS[item.domain] ?? '#6b7280') : '#6b7280';
      const typeColor = item.objectType ? (TYPE_COLORS[item.objectType] ?? '#6b7280') : '#6b7280';
      return (
        <TouchableOpacity
          style={styles.objectCard}
          onPress={() => handleObjectPress(item)}
          activeOpacity={0.7}
        >
          <View style={styles.cardHeader}>
            <View style={styles.categoryTags}>
              {item.objectType && (
                <View style={[styles.categoryTag, { backgroundColor: typeColor }]}>
                  <Text style={styles.categoryTagText}>{item.objectType}</Text>
                </View>
              )}
              {item.domain && (
                <View style={[styles.categoryTag, { backgroundColor: domainColor, opacity: 0.8 }]}>
                  <Text style={styles.categoryTagText}>{item.domain}</Text>
                </View>
              )}
            </View>
            <View style={styles.urgencyBadge}>
              <View
                style={[
                  styles.urgencyDot,
                  { backgroundColor: getUrgencyColor(item.metadata.urgency) },
                ]}
              />
              <Text style={styles.urgencyText}>{item.metadata.urgency}</Text>
            </View>
          </View>

          <Text style={styles.contentPreview} numberOfLines={3}>
            {label}
          </Text>

          <View style={styles.cardFooter}>
            <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
            <View style={styles.tagsContainer}>
              {item.metadata.tags.slice(0, 2).map((tag) => (
                <Text key={tag} style={styles.tagText}>
                  #{tag}
                </Text>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [handleObjectPress]
  );

  const renderSearchResultCard = useCallback(
    ({ item }: { item: RagSearchResult }) => {
      const typeColor = TYPE_COLORS[item.type] ?? '#6b7280';
      const domainColor = DOMAIN_COLORS[item.domain] ?? '#6b7280';
      return (
        <TouchableOpacity
          style={styles.objectCard}
          onPress={() => handleSearchResultPress(item)}
          activeOpacity={0.7}
        >
          <View style={styles.cardHeader}>
            <View style={styles.categoryTags}>
              <View style={[styles.categoryTag, { backgroundColor: typeColor }]}>
                <Text style={styles.categoryTagText}>{item.type}</Text>
              </View>
              <View style={[styles.categoryTag, { backgroundColor: domainColor, opacity: 0.8 }]}>
                <Text style={styles.categoryTagText}>{item.domain}</Text>
              </View>
            </View>
            <Text style={styles.scoreText}>{Math.round(item.score * 100)}% match</Text>
          </View>

          {item.title && (
            <Text style={styles.searchResultTitle} numberOfLines={1}>{item.title}</Text>
          )}
          <Text style={styles.contentPreview} numberOfLines={3}>
            {item.cleanedText}
          </Text>

          <View style={styles.cardFooter}>
            <Text style={styles.dateText}>
              {formatDate(item.createdAt)}
            </Text>
            <View style={styles.tagsContainer}>
              {item.tags.slice(0, 2).map((tag) => (
                <Text key={tag} style={styles.tagText}>#{tag}</Text>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [handleSearchResultPress]
  );

  const renderEmpty = useCallback(() => {
    if (isLoading || searchLoading) return null;

    const hasFilters = isSearchMode || selectedDomains.length > 0 || selectedTypes.length > 0;

    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateIcon}>{hasFilters ? '🔍' : '🧠'}</Text>
        <Text style={styles.emptyStateTitle}>
          {hasFilters ? 'No Results' : 'No Objects Yet'}
        </Text>
        <Text style={styles.emptyStateText}>
          {hasFilters
            ? 'Try adjusting your search or filters'
            : 'Your extracted thoughts and ideas will appear here'}
        </Text>
        {hasFilters && (
          <TouchableOpacity style={styles.clearFiltersButton} onPress={handleClearFilters}>
            <Text style={styles.clearFiltersText}>Clear Filters</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [isLoading, searchLoading, isSearchMode, selectedDomains, selectedTypes, handleClearFilters]);

  const renderFooter = useCallback(() => {
    if (!hasMore || isLoading) return null;

    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator color="#3b82f6" />
      </View>
    );
  }, [hasMore, isLoading]);

  const renderError = useCallback(() => {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>!</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refresh}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }, [error, refresh]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Atomic Objects</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search objects..."
          placeholderTextColor="#666"
          value={searchText}
          onChangeText={setSearchText}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Domain + Type Filter Chips */}
      <View style={styles.chipsContainer}>
        {renderFilterChips()}
      </View>

      {/* Geofence Context Banner (when navigated from notification) */}
      {renderGeofenceContext()}

      {/* Dashboard summary card */}
      {renderDashboardCard()}

      {/* Stale Actionables Banner */}
      {renderStaleBanner()}

      {/* Objects / Search Results List */}
      {(isLoading || searchLoading) && (isSearchMode ? searchResults.length === 0 : objects.length === 0) ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>{isSearchMode ? 'Searching...' : 'Loading objects...'}</Text>
        </View>
      ) : !isSearchMode && error && objects.length === 0 ? (
        renderError()
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
        <FlatList
          data={objects}
          keyExtractor={(item) => item.id}
          renderItem={renderObjectCard}
          contentContainerStyle={objects.length === 0 ? styles.listEmpty : styles.listContent}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor="#3b82f6"
              colors={['#3b82f6']}
            />
          }
        />
      )}

      {/* Object Detail Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKeyboardView}
          >
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={handleCloseModal}>
                <Text style={styles.modalCloseButton}>Close</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Object Details</Text>
              {selectedObject && !editMode ? (
                <TouchableOpacity onPress={handleEditPress}>
                  <Text style={styles.modalEditButton}>Edit</Text>
                </TouchableOpacity>
              ) : editMode ? (
                <TouchableOpacity onPress={handleCancelEdit}>
                  <Text style={styles.modalCancelButton}>Cancel</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.headerRight} />
              )}
            </View>

            {isLoadingDetail ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color="#3b82f6" />
              </View>
            ) : selectedObject ? (
              <ScrollView style={styles.modalContent}>
                {/* Type + Domain */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Classification</Text>
                  <View style={styles.detailCategoryTags}>
                    {selectedObject.objectType && (
                      <View style={[styles.categoryTag, { backgroundColor: TYPE_COLORS[selectedObject.objectType] ?? '#6b7280' }]}>
                        <Text style={styles.categoryTagText}>{selectedObject.objectType}</Text>
                      </View>
                    )}
                    {selectedObject.domain && (
                      <View style={[styles.categoryTag, { backgroundColor: DOMAIN_COLORS[selectedObject.domain] ?? '#6b7280', opacity: 0.8 }]}>
                        <Text style={styles.categoryTagText}>{selectedObject.domain}</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* State */}
                {selectedObject && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>State</Text>
                    <View style={styles.stateRow}>
                      <View style={[styles.stateBadge, { backgroundColor: STATE_COLORS[(selectedObject as any).state ?? 'open'] ?? '#6b7280' }]}>
                        <Text style={styles.stateBadgeText}>{(selectedObject as any).state ?? 'open'}</Text>
                      </View>
                      {!editMode && (
                        <TouchableOpacity
                          style={styles.stateChangeBtn}
                          onPress={() => handleStateChange(selectedObject.id, (selectedObject as any).state ?? 'open')}
                          disabled={updatingState}
                        >
                          <Text style={styles.stateChangeBtnText}>{updatingState ? '...' : 'Change'}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}

                {/* Content */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Content</Text>
                  {editMode ? (
                    <TextInput
                      style={styles.editInput}
                      value={editContent}
                      onChangeText={setEditContent}
                      multiline
                      autoFocus
                    />
                  ) : (
                    <Text style={styles.contentText}>{selectedObject.content}</Text>
                  )}
                </View>

                {editMode && (
                  <View style={styles.editActions}>
                    {updateError && <Text style={styles.updateError}>{updateError}</Text>}
                    <TouchableOpacity
                      style={[styles.saveButton, isUpdating && styles.saveButtonDisabled]}
                      onPress={handleSaveEdit}
                      disabled={isUpdating}
                    >
                      {isUpdating ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.saveButtonText}>Save Changes</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {!editMode && (
                  <>
                    {/* Metadata */}
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Metadata</Text>
                      <View style={styles.metadataRow}>
                        <Text style={styles.metadataLabel}>Urgency:</Text>
                        <View style={styles.urgencyBadge}>
                          <View
                            style={[
                              styles.urgencyDot,
                              { backgroundColor: getUrgencyColor(selectedObject.metadata.urgency) },
                            ]}
                          />
                          <Text style={styles.metadataValue}>
                            {selectedObject.metadata.urgency}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.metadataRow}>
                        <Text style={styles.metadataLabel}>Sentiment:</Text>
                        <Text style={styles.metadataValue}>
                          {selectedObject.metadata.sentiment}
                        </Text>
                      </View>
                      <View style={styles.metadataRow}>
                        <Text style={styles.metadataLabel}>Confidence:</Text>
                        <Text style={styles.metadataValue}>
                          {Math.round(selectedObject.confidence * 100)}%
                        </Text>
                      </View>
                    </View>

                    {/* Tags */}
                    {selectedObject.metadata.tags.length > 0 && (
                      <View style={styles.detailSection}>
                        <Text style={styles.detailLabel}>Tags</Text>
                        <View style={styles.tagsRow}>
                          {selectedObject.metadata.tags.map((tag) => (
                            <View key={tag} style={styles.detailTag}>
                              <Text style={styles.detailTagText}>#{tag}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Entities */}
                    {selectedObject.metadata.entities.length > 0 && (
                      <View style={styles.detailSection}>
                        <Text style={styles.detailLabel}>Entities</Text>
                        {selectedObject.metadata.entities.map((entity, index) => (
                          <View key={index} style={styles.entityRow}>
                            <Text style={styles.entityType}>{entity.type}</Text>
                            <Text style={styles.entityValue}>{entity.value}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Source */}
                    <View style={styles.detailSection}>
                      <Text style={styles.detailLabel}>Source</Text>
                      <View style={styles.metadataRow}>
                        <Text style={styles.metadataLabel}>Type:</Text>
                        <Text style={styles.metadataValue}>{selectedObject.source.type}</Text>
                      </View>
                      <View style={styles.metadataRow}>
                        <Text style={styles.metadataLabel}>Created:</Text>
                        <Text style={styles.metadataValue}>
                          {formatDate(selectedObject.createdAt)}
                        </Text>
                      </View>
                    </View>
                  </>
                )}
              </ScrollView>
            ) : null}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function DashStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.dashStat}>
      <Text style={styles.dashStatValue}>{value}</Text>
      <Text style={styles.dashStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: {
    color: '#3b82f6',
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  headerRight: {
    width: 50,
  },
  // Search
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
  },
  searchButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  // Filter chips
  chipsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  chipRow: {
    height: 44,
  },
  chipRowContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chipText: {
    color: '#888',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  chipTextSelected: {
    color: '#fff',
  },
  scoreText: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '600',
  },
  searchResultTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 14,
  },
  // List
  listContent: {
    padding: 16,
  },
  listEmpty: {
    flex: 1,
  },
  // Object Card
  objectCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryTag: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  categoryTagText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  moreCategoriesText: {
    color: '#666',
    fontSize: 10,
  },
  urgencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  urgencyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  urgencyText: {
    color: '#888',
    fontSize: 10,
    textTransform: 'capitalize',
  },
  contentPreview: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 12,
    color: '#666',
  },
  tagsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  tagText: {
    fontSize: 10,
    color: '#3b82f6',
  },
  // Empty State
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  clearFiltersButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
  },
  clearFiltersText: {
    color: '#3b82f6',
    fontSize: 14,
  },
  loadingFooter: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  // Error
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
    color: '#ef4444',
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  modalKeyboardView: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  modalCloseButton: {
    color: '#3b82f6',
    fontSize: 16,
  },
  modalEditButton: {
    color: '#3b82f6',
    fontSize: 16,
  },
  modalCancelButton: {
    color: '#ef4444',
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  modalLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    flex: 1,
    padding: 24,
  },
  // Detail Sections
  detailSection: {
    marginBottom: 24,
  },
  detailLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  detailCategoryTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  contentText: {
    fontSize: 16,
    color: '#fff',
    lineHeight: 24,
  },
  editInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    lineHeight: 24,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  editActions: {
    marginBottom: 24,
  },
  updateError: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: '#22c55e',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  metadataLabel: {
    color: '#666',
    fontSize: 14,
    width: 100,
  },
  metadataValue: {
    color: '#fff',
    fontSize: 14,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailTag: {
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  detailTagText: {
    color: '#3b82f6',
    fontSize: 12,
  },
  entityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  entityType: {
    color: '#888',
    fontSize: 12,
    width: 100,
    textTransform: 'capitalize',
  },
  entityValue: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  // Geofence context banner
  geofenceBanner: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    backgroundColor: '#000d1a',
    paddingBottom: 12,
  },
  geofenceBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  geofenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
  },
  geofenceBannerTitle: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '600',
  },
  geofenceCard: {
    backgroundColor: '#001428',
    borderColor: '#1a3a5c',
  },
  geofenceCardLabel: {
    color: '#3b82f6',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  // Stale actionables
  staleBanner: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    backgroundColor: '#0f0a00',
  },
  staleBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  staleBannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  staleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f59e0b',
  },
  staleBannerTitle: {
    color: '#f59e0b',
    fontSize: 13,
    fontWeight: '600',
  },
  staleBannerChevron: {
    color: '#666',
    fontSize: 10,
  },
  staleCardsRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
    flexDirection: 'row',
  },
  staleCard: {
    width: 160,
    backgroundColor: '#1a1200',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#3a2a00',
  },
  staleCardAge: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
  },
  staleCardContent: {
    color: '#fff',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4,
  },
  staleCardAction: {
    color: '#888',
    fontSize: 11,
    fontStyle: 'italic',
  },

  // Dashboard card
  dashboardCard: {
    backgroundColor: '#1a1a1a',
    marginHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dashboardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dashboardLoadDot: { width: 8, height: 8, borderRadius: 4 },
  dashboardTitle: { color: '#ccc', fontSize: 13, fontWeight: '600' },
  dashboardChevron: { color: '#555', fontSize: 11 },
  dashboardBody: { paddingHorizontal: 16, paddingBottom: 12 },
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  dashStat: {
    backgroundColor: '#222',
    borderRadius: 8,
    padding: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  dashStatValue: { color: '#fff', fontSize: 18, fontWeight: '700' },
  dashStatLabel: { color: '#666', fontSize: 10, marginTop: 2 },
  dashboardTopDomain: { color: '#666', fontSize: 12 },

  // State badge
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  stateBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  stateBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  stateChangeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
  },
  stateChangeBtnText: { color: '#888', fontSize: 12 },
});
