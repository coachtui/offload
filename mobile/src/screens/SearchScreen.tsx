import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSearch, ObjectDomain } from '../hooks/useSearch';
import type { RagSearchResult } from '../services/api';

const DOMAINS: { label: string; value: ObjectDomain }[] = [
  { label: 'Work', value: 'work' },
  { label: 'Personal', value: 'personal' },
  { label: 'Health', value: 'health' },
  { label: 'Family', value: 'family' },
  { label: 'Finance', value: 'finance' },
  { label: 'Project', value: 'project' },
];

export default function SearchScreen({ navigation }: any) {
  const [query, setQuery] = useState('');
  const [selectedDomains, setSelectedDomains] = useState<ObjectDomain[]>([]);
  const { results, loading, error, search } = useSearch();

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query.trim()) {
        search(query, { domain: selectedDomains.length > 0 ? selectedDomains : undefined });
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [query, selectedDomains]);

  const toggleDomain = (domain: ObjectDomain) => {
    setSelectedDomains((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    );
  };

  const clearSearch = () => {
    setQuery('');
    setSelectedDomains([]);
  };

  const renderResult = ({ item }: { item: RagSearchResult }) => (
    <TouchableOpacity
      style={styles.resultCard}
      onPress={() => navigation.navigate('Objects', { objectId: item.objectId })}
    >
      <View style={styles.resultHeader}>
        <View style={styles.badgeRow}>
          <View style={[styles.typeBadge, getTypeStyle(item.type)]}>
            <Text style={styles.badgeText}>{item.type}</Text>
          </View>
          <View style={[styles.domainBadge, getDomainStyle(item.domain)]}>
            <Text style={styles.badgeText}>{item.domain}</Text>
          </View>
        </View>
        <Text style={styles.scoreText}>{Math.round(item.score * 100)}% match</Text>
      </View>

      {item.title && (
        <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
      )}
      <Text style={styles.resultContent} numberOfLines={3}>
        {item.cleanedText}
      </Text>

      <View style={styles.resultFooter}>
        <Text style={styles.timestampText}>
          {new Date(item.createdAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          })}
        </Text>
        {item.tags.length > 0 && (
          <View style={styles.tagsContainer}>
            {item.tags.slice(0, 3).map((tag) => (
              <Text key={tag} style={styles.tagText}>#{tag}</Text>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => {
    if (loading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.emptyStateText}>Searching...</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />
          <Text style={styles.emptyStateTitle}>Search Failed</Text>
          <Text style={styles.emptyStateText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => query.trim() && search(query, { domain: selectedDomains.length > 0 ? selectedDomains : undefined })}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (!query.trim()) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={64} color="#9CA3AF" />
          <Text style={styles.emptyStateTitle}>Search Your Notes</Text>
          <Text style={styles.emptyStateText}>
            Try searching for "workout", "project deadline", or "call Mom"
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <Ionicons name="document-text-outline" size={64} color="#9CA3AF" />
        <Text style={styles.emptyStateTitle}>No Results Found</Text>
        <Text style={styles.emptyStateText}>Try different keywords or remove filters</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Search</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color="#374151" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search your notes..."
          placeholderTextColor="#9CA3AF"
          value={query}
          onChangeText={setQuery}
          autoFocus
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
            <Ionicons name="close-circle" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersContainer}
        contentContainerStyle={styles.filtersContent}
      >
        {DOMAINS.map(({ label, value }) => {
          const isSelected = selectedDomains.includes(value);
          return (
            <TouchableOpacity
              key={value}
              style={[styles.filterChip, isSelected && styles.filterChipSelected]}
              onPress={() => toggleDomain(value)}
            >
              <Text style={[styles.filterChipText, isSelected && styles.filterChipTextSelected]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {results.length > 0 && (
        <View style={styles.resultsCountContainer}>
          <Text style={styles.resultsCountText}>
            {results.length} result{results.length !== 1 ? 's' : ''} found
          </Text>
        </View>
      )}

      <FlatList
        data={results}
        renderItem={renderResult}
        keyExtractor={(item) => item.objectId}
        contentContainerStyle={styles.resultsList}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          results.length > 0 ? (
            <TouchableOpacity
              style={styles.askOffloadBtn}
              onPress={() => navigation.navigate('AskOffload', { initialQuery: query })}
              activeOpacity={0.78}
            >
              <Text style={styles.askOffloadBtnText}>Ask Offload about these results</Text>
            </TouchableOpacity>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function getTypeStyle(type: string) {
  const map: Record<string, any> = {
    task:        { backgroundColor: '#DBEAFE', borderColor: '#3B82F6' },
    reminder:    { backgroundColor: '#FEE2E2', borderColor: '#EF4444' },
    idea:        { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
    decision:    { backgroundColor: '#D1FAE5', borderColor: '#10B981' },
    question:    { backgroundColor: '#E9D5FF', borderColor: '#A855F7' },
    observation: { backgroundColor: '#F3F4F6', borderColor: '#9CA3AF' },
    journal:     { backgroundColor: '#FDF2F8', borderColor: '#EC4899' },
    reference:   { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7' },
  };
  return map[type] ?? { backgroundColor: '#F3F4F6', borderColor: '#9CA3AF' };
}

function getDomainStyle(domain: string) {
  const map: Record<string, any> = {
    work:     { backgroundColor: '#EFF6FF', borderColor: '#93C5FD' },
    personal: { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' },
    health:   { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7' },
    family:   { backgroundColor: '#F5F3FF', borderColor: '#C4B5FD' },
    finance:  { backgroundColor: '#FFF7ED', borderColor: '#FDBA74' },
    project:  { backgroundColor: '#F0F9FF', borderColor: '#7DD3FC' },
  };
  return map[domain] ?? { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB' };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#111827' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: { marginRight: 12 },
  searchInput: { flex: 1, fontSize: 16, color: '#111827' },
  clearButton: { marginLeft: 8 },
  filtersContainer: { marginTop: 16, maxHeight: 50 },
  filtersContent: { paddingHorizontal: 20, paddingVertical: 4 },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipSelected: { backgroundColor: '#EEF2FF', borderColor: '#4F46E5', borderWidth: 2 },
  filterChipText: { fontSize: 14, fontWeight: '500', color: '#6B7280' },
  filterChipTextSelected: { fontWeight: '600', color: '#4F46E5' },
  resultsCountContainer: { paddingHorizontal: 20, paddingVertical: 12 },
  resultsCountText: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  resultsList: { paddingHorizontal: 20, paddingBottom: 20 },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeRow: { flexDirection: 'row', gap: 6 },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  domainBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#374151' },
  scoreText: { fontSize: 12, fontWeight: '600', color: '#4F46E5' },
  resultTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  resultContent: { fontSize: 15, color: '#374151', lineHeight: 22, marginBottom: 12 },
  resultFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timestampText: { fontSize: 12, color: '#9CA3AF' },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  tagText: { fontSize: 12, color: '#6B7280', marginLeft: 8 },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#4F46E5',
    borderRadius: 8,
  },
  retryButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  askOffloadBtn: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  askOffloadBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
  },
});
