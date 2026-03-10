import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/types';
import { RagSearchResult } from '../services/api';
import { useSearch } from '../hooks/useSearch';
import { useForYou } from '../hooks/useForYou';
import { AppSearchBar } from '../components/ui';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

interface Props {
  navigation: HomeScreenNavigationProp;
}

const NAV_ITEMS = [
  {
    icon: 'chatbubble-outline' as const,
    label: 'Ask Offload',
    description: 'Ask questions about your notes',
    route: 'AskOffload' as const,
    iconColor: '#4F46E5',
    iconBg: '#EEF2FF',
  },
  {
    icon: 'notifications-outline' as const,
    label: 'Place reminders',
    description: 'Get notified when you arrive somewhere',
    route: 'Reminders' as const,
    iconColor: '#0284C7',
    iconBg: '#E0F2FE',
  },
  {
    icon: 'bar-chart-outline' as const,
    label: 'Insights',
    description: 'Patterns across your notes',
    route: 'Insights' as const,
    iconColor: '#059669',
    iconBg: '#D1FAE5',
  },
  {
    icon: 'albums-outline' as const,
    label: 'Notes',
    description: 'Browse all your captures',
    route: 'Objects' as const,
    iconColor: '#B45309',
    iconBg: '#FEF3C7',
  },
] as const;

function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function HomeScreen({ navigation }: Props) {
  const { logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const { results: searchResults, loading: searchLoading, search, clearResults } = useSearch();
  const { items: forYouItems } = useForYou();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSearchMode = searchQuery.trim().length > 0;
  const [forYouExpanded, setForYouExpanded] = useState(false);

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (text.trim()) {
        debounceRef.current = setTimeout(() => {
          search(text.trim());
        }, 300);
      } else {
        clearResults();
      }
    },
    [search, clearResults]
  );

  const renderSearchResult = ({ item }: { item: RagSearchResult }) => (
    <TouchableOpacity
      style={styles.searchResultCard}
      onPress={() => navigation.navigate('Objects', { objectId: item.objectId })}
      activeOpacity={0.72}
    >
      <View style={styles.searchResultRow}>
        <View style={styles.searchResultContent}>
          {item.title ? (
            <Text style={styles.searchResultTitle} numberOfLines={1}>
              {item.title}
            </Text>
          ) : null}
          <Text style={styles.searchResultText} numberOfLines={2}>
            {item.cleanedText}
          </Text>
        </View>
        <Text style={styles.searchResultScore}>{Math.round(item.score * 100)}%</Text>
      </View>
      <View style={styles.searchResultMeta}>
        {item.type ? (
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{item.type}</Text>
          </View>
        ) : null}
        <Text style={styles.searchResultDate}>
          {new Date(item.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.brand}>Offload</Text>
        <TouchableOpacity
          onPress={logout}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
        >
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>

      {/* Search bar — always visible */}
      <View style={styles.searchWrap}>
        <AppSearchBar
          value={searchQuery}
          onChangeText={handleSearchChange}
          placeholder="Forget Anything?"
          loading={isSearchMode && searchLoading}
        />
      </View>

      {isSearchMode ? (
        /* ── SEARCH MODE ─────────────────────────────────────────────────── */
        <FlatList
          data={searchResults}
          renderItem={renderSearchResult}
          keyExtractor={(item) => item.objectId}
          contentContainerStyle={styles.searchList}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            searchResults.length > 0 ? (
              <Text style={styles.searchResultsCount}>
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            searchLoading ? (
              <ActivityIndicator
                size="small"
                color="#9CA3AF"
                style={{ marginTop: 32 }}
              />
            ) : (
              <View style={styles.searchEmpty}>
                <Ionicons name="search-outline" size={40} color="#D1D5DB" />
                <Text style={styles.searchEmptyText}>
                  No results for "{searchQuery}"
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            searchResults.length > 0 ? (
              <TouchableOpacity
                style={styles.askOffloadBtn}
                onPress={() =>
                  navigation.navigate('AskOffload', { initialQuery: searchQuery })
                }
                activeOpacity={0.78}
              >
                <Ionicons
                  name="chatbubble-outline"
                  size={15}
                  color="#4F46E5"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.askOffloadBtnText}>Ask Offload about these</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      ) : (
        /* ── HOME MODE ───────────────────────────────────────────────────── */
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Mic button */}
          <View style={styles.micSection}>
            <TouchableOpacity
              style={styles.micButton}
              onPress={() => navigation.navigate('Record')}
              activeOpacity={0.82}
            >
              <Ionicons name="mic" size={36} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.micLabel}>Capture a thought</Text>
          </View>

          {/* Nav cards — 2 × 2 grid */}
          <View style={styles.grid}>
            {NAV_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.route}
                style={styles.card}
                onPress={() => navigation.navigate(item.route as any)}
                activeOpacity={0.72}
              >
                <View style={[styles.iconWrap, { backgroundColor: item.iconBg }]}>
                  <Ionicons name={item.icon} size={22} color={item.iconColor} />
                </View>
                <Text style={styles.cardLabel}>{item.label}</Text>
                <Text style={styles.cardDesc}>{item.description}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* For you right now */}
          {forYouItems.length > 0 ? (
            <View style={styles.forYouSection}>
              <TouchableOpacity
                style={styles.forYouSectionHeader}
                onPress={() => setForYouExpanded((v) => !v)}
                activeOpacity={0.7}
              >
                <Text style={styles.forYouTitle}>For you right now</Text>
                <Ionicons
                  name={forYouExpanded ? 'chevron-up' : 'chevron-down'}
                  size={15}
                  color="#9CA3AF"
                />
              </TouchableOpacity>
              {forYouExpanded && forYouItems.map((obj) => {
                const badge = obj.objectType ?? obj.domain ?? null;
                return (
                  <TouchableOpacity
                    key={obj.id}
                    style={styles.forYouRow}
                    onPress={() => navigation.navigate('Objects', { objectId: obj.id })}
                    activeOpacity={0.7}
                  >
                    <View style={styles.forYouContent}>
                      <Text style={styles.forYouRowTitle} numberOfLines={1}>
                        {obj.title ?? obj.content}
                      </Text>
                      <View style={styles.forYouRowMeta}>
                        <Text style={styles.forYouRowTime}>
                          {formatRelativeTime(obj.createdAt)}
                        </Text>
                        {badge ? (
                          <>
                            <Text style={styles.forYouMetaDot}>·</Text>
                            <View style={styles.forYouBadge}>
                              <Text style={styles.forYouBadgeText}>{badge}</Text>
                            </View>
                          </>
                        ) : null}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  brand: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.4,
  },
  logoutText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  // Search
  searchWrap: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  // Home scroll content
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 48,
  },
  // Mic
  micSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  micButton: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
  },
  micLabel: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  // Cards grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 32,
  },
  card: {
    width: '47.5%',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  // For you right now
  forYouSection: {
    marginBottom: 32,
  },
  forYouSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  forYouTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  forYouRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  forYouContent: {
    flex: 1,
    marginRight: 8,
  },
  forYouRowTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  forYouRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 4,
  },
  forYouRowTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  forYouMetaDot: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  forYouBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  forYouBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
  },
  // Search mode — results list
  searchList: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  searchResultsCount: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 12,
  },
  searchResultCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  searchResultContent: {
    flex: 1,
    marginRight: 8,
  },
  searchResultTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  searchResultText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  searchResultScore: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
  },
  searchResultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  typeBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  searchResultDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  searchEmpty: {
    alignItems: 'center',
    paddingTop: 60,
  },
  searchEmptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 12,
    textAlign: 'center',
  },
  // Ask Offload CTA
  askOffloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  askOffloadBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
  },
});
