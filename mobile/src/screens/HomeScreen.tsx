import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/types';
import { RagSearchResult } from '../services/api';
import { useSearch } from '../hooks/useSearch';
import { useForYou } from '../hooks/useForYou';
import { usePermissionStatus } from '../hooks/usePermissionStatus';
import { PermissionBanner } from '../components/PermissionBanner';
import { ArrivalPermissionSheet } from '../components/ArrivalPermissionSheet';
import { subscribeArrivalPrompt } from '../services/arrivalPromptBus';
import { hasSeenArrivalPrompt, canDeliverArrivalReminders } from '../services/permissionService';
import {
  AppSearchBar,
  AppText,
  AppPressable,
  AppBadge,
  AppButton,
  ConfirmSheet,
  SkeletonCard,
  Spacing,
  Radius,
} from '../components/ui';
import { Elevation, Fonts, ThemeColors, useTheme, useThemedStyles, ColorScheme } from '../theme';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

interface Props {
  navigation: HomeScreenNavigationProp;
}

type Tint = { color: string; bg: string };

const NAV_ITEMS: Array<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  route: 'AskOffload' | 'Insights' | 'Places' | 'Objects';
  tint: Record<ColorScheme, Tint>;
}> = [
  {
    icon: 'chatbubble-outline',
    label: 'Ask Offload',
    description: 'Ask questions about your notes',
    route: 'AskOffload',
    tint: {
      light: { color: '#0F6B5F', bg: '#E4F0EC' },
      dark: { color: '#53B8A5', bg: 'rgba(83, 184, 165, 0.14)' },
    },
  },
  {
    icon: 'bar-chart-outline',
    label: 'Insights',
    description: 'Patterns across your notes',
    route: 'Insights',
    tint: {
      light: { color: '#C2492F', bg: '#FAEEE9' },
      dark: { color: '#F2A08B', bg: 'rgba(236, 106, 74, 0.14)' },
    },
  },
  {
    icon: 'location-outline',
    label: 'Places',
    description: 'Your places, notes, and arrival reminders',
    route: 'Places',
    tint: {
      light: { color: '#5D7025', bg: '#EEF2E2' },
      dark: { color: '#AFC27A', bg: 'rgba(148, 166, 84, 0.15)' },
    },
  },
  {
    icon: 'albums-outline',
    label: 'Notes',
    description: 'Browse all your captures',
    route: 'Objects',
    tint: {
      light: { color: '#A1740C', bg: '#F7EFDD' },
      dark: { color: '#E5C078', bg: 'rgba(217, 164, 65, 0.15)' },
    },
  },
];

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

function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function HomeScreen({ navigation }: Props) {
  const { logout, user } = useAuth();
  const { colors, scheme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const firstName = user?.name ? user.name.trim().split(' ')[0] : '';
  const initial = (firstName || user?.email || '?').charAt(0).toUpperCase();
  const [searchQuery, setSearchQuery] = useState('');
  const [logoutVisible, setLogoutVisible] = useState(false);
  const { results: searchResults, loading: searchLoading, search, clearResults } = useSearch();
  const { items: forYouItems } = useForYou();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSearchMode = searchQuery.trim().length > 0;
  const [forYouExpanded, setForYouExpanded] = useState(true);

  // ── Permission surfacing ──────────────────────────────────────────────────
  const { status: permissions, loading: permissionsLoading, refresh: refreshPermissions } =
    usePermissionStatus();
  const [arrivalPrompt, setArrivalPrompt] = useState<{ placeName?: string } | null>(null);

  // A saved note produced a place. Offer the "Always" escalation — but only if
  // it would actually change anything, and only once per account.
  useEffect(() => {
    return subscribeArrivalPrompt(async (placeNames) => {
      const [current, alreadyAsked] = await Promise.all([
        refreshPermissions(),
        hasSeenArrivalPrompt(),
      ]);
      if (alreadyAsked || canDeliverArrivalReminders(current)) return;
      setArrivalPrompt({ placeName: placeNames[0] });
    });
  }, [refreshPermissions]);

  const dateLine = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

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
    <AppPressable
      style={styles.searchResultCard}
      onPress={() => navigation.navigate('Objects', { objectId: item.objectId })}
      accessibilityRole="button"
      accessibilityLabel={item.title ?? item.cleanedText}
    >
      <View style={styles.searchResultRow}>
        <View style={styles.searchResultContent}>
          {item.title ? (
            <AppText variant="secondary" style={styles.searchResultTitle} numberOfLines={1}>
              {item.title}
            </AppText>
          ) : null}
          <AppText variant="body" color="secondary" numberOfLines={2} style={styles.searchResultText}>
            {item.cleanedText}
          </AppText>
        </View>
        <AppText variant="secondary" color="accent" style={styles.searchResultScore}>
          {Math.round(item.score * 100)}%
        </AppText>
      </View>
      <View style={styles.searchResultMeta}>
        {item.type ? <AppBadge label={item.type} tone="neutral" /> : null}
        <AppText variant="secondary" color="faint">
          {new Date(item.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
        </AppText>
      </View>
    </AppPressable>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header: greeting + avatar */}
      <View style={styles.header}>
        <View>
          <AppText variant="secondary" color="muted">
            {dateLine}
          </AppText>
          <AppText variant="title" style={styles.greeting}>
            {greetingForNow()}
            {firstName ? `, ${firstName}` : ''}
          </AppText>
        </View>
        <AppPressable
          onPress={() => setLogoutVisible(true)}
          style={styles.avatar}
          accessibilityRole="button"
          accessibilityLabel="Account"
        >
          <AppText variant="secondary" color="inverse" style={{ fontFamily: Fonts.bold }}>
            {initial}
          </AppText>
        </AppPressable>
      </View>

      {/* Search bar — always visible */}
      <View style={styles.searchWrap}>
        <AppSearchBar
          value={searchQuery}
          onChangeText={handleSearchChange}
          placeholder="Search notes, places, ideas…"
          loading={isSearchMode && searchLoading}
        />
      </View>

      {/* Standing notice when a permission the app depends on is missing.
          Hidden during search so it never pushes results off screen. */}
      {!isSearchMode ? (
        <PermissionBanner
          status={permissions}
          loading={permissionsLoading}
          onChanged={() => void refreshPermissions()}
        />
      ) : null}

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
              <AppText variant="secondary" color="muted" style={styles.searchResultsCount}>
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
              </AppText>
            ) : null
          }
          ListEmptyComponent={
            searchLoading ? (
              <View style={styles.searchSkeletons}>
                <SkeletonCard lines={2} />
                <SkeletonCard lines={2} style={styles.skeletonGap} />
                <SkeletonCard lines={1} style={styles.skeletonGap} />
              </View>
            ) : (
              <View style={styles.searchEmpty}>
                <Ionicons name="search-outline" size={40} color={colors.borderStrong} />
                <AppText variant="body" color="faint" align="center" style={styles.searchEmptyText}>
                  No results for "{searchQuery}"
                </AppText>
              </View>
            )
          }
          ListFooterComponent={
            searchResults.length > 0 ? (
              <AppButton
                label="Ask Offload about these"
                variant="accent"
                icon="chatbubble-outline"
                onPress={() => navigation.navigate('AskOffload', { initialQuery: searchQuery })}
                style={styles.askOffloadBtn}
              />
            ) : null
          }
        />
      ) : (
        /* ── HOME MODE ───────────────────────────────────────────────────── */
        <>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* For you right now */}
            {forYouItems.length > 0 ? (
              <View style={styles.forYouSection}>
                <AppPressable
                  scale={false}
                  style={styles.forYouSectionHeader}
                  onPress={() => setForYouExpanded((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: forYouExpanded }}
                  accessibilityLabel="For you right now"
                >
                  <AppText variant="label" color="muted">
                    For you right now
                  </AppText>
                  <Ionicons
                    name={forYouExpanded ? 'chevron-up' : 'chevron-down'}
                    size={15}
                    color={colors.textFaint}
                  />
                </AppPressable>
                {forYouExpanded ? (
                  <Animated.View entering={FadeInDown.duration(300)} style={styles.forYouCard}>
                    {forYouItems.map((obj, i) => {
                      const badge = obj.objectType ?? obj.domain ?? null;
                      return (
                        <AppPressable
                          key={obj.id}
                          scale={false}
                          style={[styles.forYouRow, i > 0 && styles.forYouRowBorder]}
                          onPress={() => navigation.navigate('Objects', { objectId: obj.id })}
                          accessibilityRole="button"
                          accessibilityLabel={obj.title ?? obj.content}
                        >
                          <View style={styles.forYouContent}>
                            <AppText variant="secondary" style={styles.forYouRowTitle} numberOfLines={1}>
                              {obj.title ?? obj.content}
                            </AppText>
                            <View style={styles.forYouRowMeta}>
                              <AppText variant="secondary" color="faint">
                                {formatRelativeTime(obj.createdAt)}
                              </AppText>
                              {badge ? <AppBadge label={badge} tone="accent" /> : null}
                            </View>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={colors.borderStrong} />
                        </AppPressable>
                      );
                    })}
                  </Animated.View>
                ) : null}
              </View>
            ) : null}

            {/* Shortcuts — 2 × 2 grid */}
            <AppText variant="label" color="muted" style={styles.sectionTitle}>
              Shortcuts
            </AppText>
            <View style={styles.grid}>
              {NAV_ITEMS.map((item, i) => {
                const tint = item.tint[scheme];
                return (
                  <Animated.View
                    key={item.route}
                    entering={FadeInDown.duration(300).delay(i * 40)}
                    style={styles.cardWrap}
                  >
                    <AppPressable
                      style={styles.card}
                      onPress={() => navigation.navigate(item.route as any)}
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                    >
                      <View style={[styles.iconWrap, { backgroundColor: tint.bg }]}>
                        <Ionicons name={item.icon} size={22} color={tint.color} />
                      </View>
                      <AppText variant="heading" style={styles.cardLabel}>
                        {item.label}
                      </AppText>
                      <AppText variant="secondary" color="muted" style={styles.cardDesc}>
                        {item.description}
                      </AppText>
                    </AppPressable>
                  </Animated.View>
                );
              })}
            </View>
          </ScrollView>

          {/* Docked record action */}
          <View style={styles.micDock} pointerEvents="box-none">
            <AppPressable
              style={styles.micButton}
              haptic="tap"
              onPress={() => navigation.navigate('Record')}
              accessibilityRole="button"
              accessibilityLabel="Record a voice note"
            >
              <Ionicons name="mic" size={30} color="#FFFFFF" />
            </AppPressable>
            <AppText variant="secondary" color="muted" style={styles.micLabel}>
              Offload something
            </AppText>
          </View>
        </>
      )}

      <ConfirmSheet
        visible={logoutVisible}
        onClose={() => setLogoutVisible(false)}
        onConfirm={logout}
        title="Log out of Offload?"
        message="Your notes stay safely synced to your account."
        confirmLabel="Log out"
        destructive
      />

      <ArrivalPermissionSheet
        visible={arrivalPrompt !== null}
        placeName={arrivalPrompt?.placeName}
        onClose={() => {
          setArrivalPrompt(null);
          void refreshPermissions();
        }}
      />
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
    },
    // Header
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.lg,
    },
    greeting: {
      marginTop: 2,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: Radius.full,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Search
    searchWrap: {
      paddingHorizontal: Spacing.xl,
      paddingBottom: Spacing.md,
    },
    // Home scroll content
    scrollContent: {
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.sm,
      paddingBottom: 150,
    },
    sectionTitle: {
      marginBottom: Spacing.md,
    },
    // For you
    forYouSection: {
      marginBottom: Spacing.xxl,
    },
    forYouSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.md,
      paddingVertical: 4,
    },
    forYouCard: {
      backgroundColor: c.bgSurface,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      paddingHorizontal: Spacing.lg,
      ...Elevation.level1,
    },
    forYouRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.md,
    },
    forYouRowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    forYouContent: {
      flex: 1,
      marginRight: Spacing.sm,
    },
    forYouRowTitle: {
      fontFamily: Fonts.semibold,
      color: c.text,
    },
    forYouRowMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      gap: Spacing.sm,
    },
    // Shortcuts grid
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.md,
    },
    cardWrap: {
      width: '47.5%',
    },
    card: {
      width: '100%',
      backgroundColor: c.bgSurface,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      ...Elevation.level1,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: Radius.sm + 2,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Spacing.md,
    },
    cardLabel: {
      marginBottom: 2,
    },
    cardDesc: {
      lineHeight: 17,
    },
    // Docked record action
    micDock: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: Spacing.xxl,
      alignItems: 'center',
    },
    micButton: {
      width: 64,
      height: 64,
      borderRadius: Radius.full,
      backgroundColor: c.record,
      justifyContent: 'center',
      alignItems: 'center',
      ...Elevation.level3,
      shadowColor: c.record,
    },
    micLabel: {
      marginTop: Spacing.sm,
      fontFamily: Fonts.semibold,
    },
    // Search mode — results list
    searchList: {
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.md,
      paddingBottom: 36,
    },
    searchResultsCount: {
      marginBottom: Spacing.md,
    },
    searchSkeletons: {
      paddingTop: Spacing.xs,
    },
    skeletonGap: {
      marginTop: Spacing.md,
    },
    searchResultCard: {
      backgroundColor: c.bgSurface,
      borderRadius: Radius.md,
      padding: Spacing.lg - 2,
      marginBottom: Spacing.sm + 2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      ...Elevation.level1,
    },
    searchResultRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    searchResultContent: {
      flex: 1,
      marginRight: Spacing.sm,
    },
    searchResultTitle: {
      fontFamily: Fonts.semibold,
      color: c.text,
      marginBottom: 2,
    },
    searchResultText: {
      fontSize: 14,
      lineHeight: 20,
    },
    searchResultScore: {
      fontFamily: Fonts.semibold,
    },
    searchResultMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Spacing.sm,
      gap: Spacing.sm,
    },
    searchEmpty: {
      alignItems: 'center',
      paddingTop: 60,
    },
    searchEmptyText: {
      marginTop: Spacing.md,
    },
    // Ask Offload CTA
    askOffloadBtn: {
      marginTop: Spacing.sm,
    },
  });
