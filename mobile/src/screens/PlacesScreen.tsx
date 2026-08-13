import React, { useCallback, useRef, useState } from 'react';
import { View, Text, SectionList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { apiService, PlaceOverviewItem } from '../services/api';
import { Spacing, Radius, AppPressable, SkeletonCard, useToast } from '../components/ui';
import { SetPlaceLocationSheet, PendingLookupForSheet } from '../components/SetPlaceLocationSheet';
import { Fonts, Elevation, ThemeColors, useTheme, useThemedStyles } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Places'>;

export default function PlacesScreen({ navigation }: { navigation: Nav }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const toast = useToast();
  const [items, setItems] = useState<PlaceOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLookup, setActiveLookup] = useState<PendingLookupForSheet | null>(null);
  const inFlight = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { places } = await apiService.getPlacesOverview();
      setItems(places);
    } catch (e) {
      console.warn('[PlacesScreen] load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sections = [
    // A question the user can answer in one tap outranks rows that already work.
    { title: 'Needs a location', data: items.filter((i) => i.kind === 'pending') },
    { title: 'Your places', data: items.filter((i) => i.kind !== 'pending' && i.labeled) },
    { title: 'Detected places', data: items.filter((i) => i.kind !== 'pending' && !i.labeled) },
  ].filter((s) => s.data.length > 0);

  const openPendingSheet = (item: PlaceOverviewItem) => {
    setActiveLookup({
      id: item.id,
      query: item.query ?? item.name,
      candidates: item.candidates ?? [],
    });
  };

  const toggleBell = async (item: PlaceOverviewItem) => {
    const key = `${item.kind}:${item.id}`;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    const prev = items;
    let success = false;
    try {
      if (item.kind === 'geofence') {
        const next = !item.enabled;
        setItems((cur) => cur.map((i) =>
          i.kind === item.kind && i.id === item.id ? { ...i, enabled: next } : i));
        await apiService.setGeofenceEnabled(item.id, next);
      } else {
        // detected place → promote to a reminder
        await apiService.promotePlace(item.id);
      }
      success = true;
    } catch (e) {
      console.warn('[PlacesScreen] toggle failed', e);
      setItems(prev); // rollback
      toast.show({ message: 'Could not update place', description: 'Please try again.', tone: 'error' });
    } finally {
      inFlight.current.delete(key);
    }
    // load() is outside the mutation try — a refresh blip won't roll back or alert
    if (success) {
      try { await load(); } catch { /* server state is correct; ignore refresh failure */ }
    }
  };

  // Places is a home for places — tapping one manages it (name, radius,
  // notifications, delete). The notes that mention a place live on the Notes
  // page, filterable by that place. PlaceSummary (the notes-waiting view) is
  // reserved for the arrival flow: notification taps and the proximity banner.
  const openPlace = async (item: PlaceOverviewItem) => {
    if (item.kind === 'pending') {
      openPendingSheet(item);
      return;
    }
    if (item.kind === 'geofence') {
      try {
        const { geofences } = await apiService.getGeofences();
        const g = geofences.find((x) => x.id === item.id);
        if (!g) throw new Error('not found');
        navigation.navigate('EditGeofence', {
          geofenceId: g.id,
          geofenceName: g.name,
          type: g.type,
          radius: g.radius,
          notifyOnEnter: g.notifyOnEnter,
          notifyOnExit: g.notifyOnExit,
          quietHoursStart: g.quietHoursStart,
          quietHoursEnd: g.quietHoursEnd,
          location: g.location,
        });
      } catch {
        toast.show({ message: "Couldn't open place", description: 'Please try again.', tone: 'error' });
      }
    } else {
      // Inferred place with no armed geofence: nothing to edit until it's
      // promoted (the bell) — show its notes where notes live instead.
      navigation.navigate('Objects', { placeId: item.id, placeName: item.name });
    }
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
      </TouchableOpacity>
      <View style={styles.headerTitleContainer}>
        <Text style={styles.headerTitle}>Places</Text>
      </View>
      <View style={{ width: 24 }} />
    </View>
  );

  if (loading && items.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <View style={styles.skeletonList}>
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} style={styles.skeletonGap} />
          <SkeletonCard lines={1} style={styles.skeletonGap} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {header}
      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          if (item.kind === 'pending') {
            const count = item.candidates?.length ?? 0;
            return (
              <AppPressable
                style={[styles.card, styles.pendingCard]}
                onPress={() => openPendingSheet(item)}
                accessibilityRole="button"
                accessibilityLabel={`Set location for ${item.name}`}
              >
                <View style={[styles.iconChip, styles.pendingIconChip]}>
                  <Ionicons name="help" size={20} color={colors.warning ?? colors.accent} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.subline} numberOfLines={1}>
                    {count > 0
                      ? `${count} possible location${count === 1 ? '' : 's'} — tap to choose`
                      : 'Tap to set where this is'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </AppPressable>
            );
          }
          const bellOn = item.kind === 'geofence' && item.enabled;
          return (
            <AppPressable
              style={styles.card}
              onPress={() => openPlace(item)}
              accessibilityRole="button"
              accessibilityLabel={item.name}
            >
              <View style={styles.iconChip}>
                <Ionicons name="location" size={20} color={colors.accent} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.subline} numberOfLines={1}>
                  {item.openCount} open {item.openCount === 1 ? 'note' : 'notes'}
                  {' · '}Arrival reminders {bellOn ? 'on' : 'off'}
                </Text>
              </View>
              <AppPressable
                onPress={() => toggleBell(item)}
                style={[styles.bellButton, bellOn ? styles.bellButtonOn : styles.bellButtonOff]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Toggle arrival reminders"
                accessibilityState={{ selected: bellOn }}
              >
                <Ionicons
                  name={bellOn ? 'notifications' : 'notifications-off-outline'}
                  size={18}
                  color={bellOn ? colors.accent : colors.textMuted}
                />
              </AppPressable>
            </AppPressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>No places yet. Tap "Add a place" to create one.</Text>
        }
        ListFooterComponent={
          <AppPressable
            style={styles.addCard}
            onPress={() => navigation.navigate('CreateGeofence')}
            accessibilityRole="button"
            accessibilityLabel="Add a place"
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.textMuted} />
            <Text style={styles.addCardText}>Add a place</Text>
          </AppPressable>
        }
        contentContainerStyle={styles.listContent}
      />
      <SetPlaceLocationSheet
        visible={activeLookup !== null}
        lookup={activeLookup}
        onClose={() => setActiveLookup(null)}
        onDone={load}
        onPickOnMap={(lookup) =>
          navigation.navigate('CreateGeofence', {
            prefillName: lookup.query,
            pendingLookupId: lookup.id,
          })
        }
      />
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: c.bg,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitleContainer: {
      flex: 1,
      marginLeft: 16,
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontFamily: Fonts.bold,
      color: c.text,
    },
    sectionHeader: { color: c.textMuted, fontSize: 12, fontFamily: Fonts.bold, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
    listContent: {
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.xxl,
    },
    card: {
      backgroundColor: c.bgSurface,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      ...Elevation.level1,
    },
    iconChip: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.accentLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBody: { flex: 1, marginHorizontal: Spacing.md },
    name: { color: c.text, fontSize: 15, fontFamily: Fonts.semibold },
    subline: { color: c.textMuted, fontSize: 12, marginTop: 3 },
    bellButton: {
      width: 36,
      height: 36,
      borderRadius: Radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pendingCard: { borderColor: c.accentBorder, borderWidth: 1 },
    pendingIconChip: { backgroundColor: c.bgMuted },
    bellButtonOn: { backgroundColor: c.accentLight },
    bellButtonOff: { backgroundColor: c.bgMuted },
    addCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      marginTop: Spacing.xs,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.borderStrong,
      backgroundColor: 'transparent',
    },
    addCardText: { color: c.textMuted, fontSize: 15, fontFamily: Fonts.semibold },
    empty: { color: c.textMuted, textAlign: 'center', marginTop: 40, marginBottom: Spacing.lg },
    skeletonList: { padding: Spacing.lg },
    skeletonGap: { marginTop: Spacing.md },
  });
