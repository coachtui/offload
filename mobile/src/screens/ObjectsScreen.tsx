import React, { useState, useCallback } from 'react';
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
import { RootStackParamList } from '../navigation/types';
import { useObjects } from '../hooks/useObjects';
import { AtomicObject, Category } from '../types';

type ObjectsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Objects'>;

interface Props {
  navigation: ObjectsScreenNavigationProp;
}

const ALL_CATEGORIES: Category[] = [
  'business',
  'personal',
  'fitness',
  'health',
  'family',
  'finance',
  'education',
  'other',
];

const CATEGORY_COLORS: Record<Category, string> = {
  business: '#3b82f6',
  personal: '#8b5cf6',
  fitness: '#22c55e',
  health: '#ef4444',
  family: '#f59e0b',
  finance: '#06b6d4',
  education: '#ec4899',
  other: '#6b7280',
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

  const [modalVisible, setModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');

  const handleSearch = useCallback(() => {
    setFilters({
      ...filters,
      search: searchText.trim() || undefined,
    });
  }, [filters, searchText, setFilters]);

  const handleCategoryToggle = useCallback(
    (category: Category) => {
      const currentCategories = filters.category || [];
      const isSelected = currentCategories.includes(category);

      if (isSelected) {
        setFilters({
          ...filters,
          category: currentCategories.filter((c) => c !== category),
        });
      } else {
        setFilters({
          ...filters,
          category: [...currentCategories, category],
        });
      }
    },
    [filters, setFilters]
  );

  const handleClearFilters = useCallback(() => {
    setSearchText('');
    setFilters({});
  }, [setFilters]);

  const handleObjectPress = useCallback(
    async (object: AtomicObject) => {
      setModalVisible(true);
      setEditMode(false);
      await fetchObjectDetail(object.id);
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

  const renderCategoryChip = useCallback(
    (category: Category) => {
      const isSelected = (filters.category || []).includes(category);
      return (
        <TouchableOpacity
          key={category}
          style={[
            styles.categoryChip,
            isSelected && { backgroundColor: CATEGORY_COLORS[category] },
          ]}
          onPress={() => handleCategoryToggle(category)}
        >
          <Text
            style={[
              styles.categoryChipText,
              isSelected && styles.categoryChipTextSelected,
            ]}
          >
            {category}
          </Text>
        </TouchableOpacity>
      );
    },
    [filters.category, handleCategoryToggle]
  );

  const renderObjectCard = useCallback(
    ({ item }: { item: AtomicObject }) => {
      return (
        <TouchableOpacity
          style={styles.objectCard}
          onPress={() => handleObjectPress(item)}
          activeOpacity={0.7}
        >
          <View style={styles.cardHeader}>
            <View style={styles.categoryTags}>
              {item.category.slice(0, 2).map((cat) => (
                <View
                  key={cat}
                  style={[styles.categoryTag, { backgroundColor: CATEGORY_COLORS[cat] }]}
                >
                  <Text style={styles.categoryTagText}>{cat}</Text>
                </View>
              ))}
              {item.category.length > 2 && (
                <Text style={styles.moreCategoriesText}>+{item.category.length - 2}</Text>
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
            {item.content}
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

  const renderEmpty = useCallback(() => {
    if (isLoading) return null;

    const hasFilters = filters.search || (filters.category && filters.category.length > 0);

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
  }, [isLoading, filters, handleClearFilters]);

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

      {/* Category Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryFilter}
        contentContainerStyle={styles.categoryFilterContent}
      >
        {ALL_CATEGORIES.map(renderCategoryChip)}
      </ScrollView>

      {/* Objects List */}
      {isLoading && objects.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading objects...</Text>
        </View>
      ) : error && objects.length === 0 ? (
        renderError()
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
                {/* Categories */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Categories</Text>
                  <View style={styles.detailCategoryTags}>
                    {selectedObject.category.map((cat) => (
                      <View
                        key={cat}
                        style={[styles.categoryTag, { backgroundColor: CATEGORY_COLORS[cat] }]}
                      >
                        <Text style={styles.categoryTagText}>{cat}</Text>
                      </View>
                    ))}
                  </View>
                </View>

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
  // Category Filter
  categoryFilter: {
    maxHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  categoryFilterContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    flexDirection: 'row',
  },
  categoryChip: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  categoryChipText: {
    color: '#888',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  categoryChipTextSelected: {
    color: '#fff',
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
});
