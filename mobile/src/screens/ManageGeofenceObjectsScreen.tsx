/**
 * ManageGeofenceObjectsScreen
 * Lets the user view and edit which atomic objects are linked to a specific geofence.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { apiService } from '../services/api';
import { AtomicObject } from '../types';
import { useToast, Spacing, Radius } from '../components/ui';
import { Fonts, Elevation, ThemeColors, useTheme, useThemedStyles } from '../theme';

type ManageRoute = RouteProp<RootStackParamList, 'ManageGeofenceObjects'>;
type ManageNav = NativeStackNavigationProp<RootStackParamList, 'ManageGeofenceObjects'>;

interface Props {
  navigation: ManageNav;
}

export default function ManageGeofenceObjectsScreen({ navigation }: Props) {
  const route = useRoute<ManageRoute>();
  const { geofenceId, geofenceName } = route.params;
  const toast = useToast();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  // Currently linked objects (loaded from API on mount)
  const [linkedObjects, setLinkedObjects] = useState<AtomicObject[]>([]);
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [linkedLoading, setLinkedLoading] = useState(true);

  // Picker (all user objects)
  const [allObjects, setAllObjects] = useState<AtomicObject[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const [saving, setSaving] = useState(false);

  // ─── Load existing linked objects ──────────────────────────────────────────

  const loadLinked = useCallback(async () => {
    setLinkedLoading(true);
    try {
      const { objects } = await apiService.getGeofenceObjects(geofenceId);
      setLinkedObjects(objects);
      setLinkedIds(objects.map((o) => o.id));
      console.log(`[ManageGeofenceObjects] Loaded ${objects.length} linked object(s) for geofence ${geofenceId}`);
    } catch (err: any) {
      console.error('[ManageGeofenceObjects] Failed to load linked objects:', err.message);
    } finally {
      setLinkedLoading(false);
    }
  }, [geofenceId]);

  // Load browseable objects list
  const loadAll = useCallback(async () => {
    setAllLoading(true);
    try {
      const { objects } = await apiService.getObjects({ limit: 100 });
      setAllObjects(objects);
    } catch {
      setAllObjects([]);
    } finally {
      setAllLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLinked();
    loadAll();
  }, [loadLinked, loadAll]);

  // ─── Link / Unlink ─────────────────────────────────────────────────────────

  const handleLink = useCallback(async (objectId: string) => {
    // Optimistic update
    setLinkedIds((prev) => [...prev, objectId]);
    try {
      await apiService.addGeofenceObject(geofenceId, objectId);
      console.log(`[ManageGeofenceObjects] Linked object ${objectId} to geofence ${geofenceId}`);
      // Refresh linked list for accurate display
      const { objects } = await apiService.getGeofenceObjects(geofenceId);
      setLinkedObjects(objects);
      setLinkedIds(objects.map((o) => o.id));
    } catch (err: any) {
      console.error('[ManageGeofenceObjects] Failed to link object:', err.message);
      setLinkedIds((prev) => prev.filter((x) => x !== objectId));
      toast.show({ message: "Couldn't link note", description: 'Please try again.', tone: 'error' });
    }
  }, [geofenceId, toast]);

  const handleUnlink = useCallback(async (objectId: string) => {
    // Optimistic update
    setLinkedIds((prev) => prev.filter((x) => x !== objectId));
    setLinkedObjects((prev) => prev.filter((o) => o.id !== objectId));
    try {
      await apiService.removeGeofenceObject(geofenceId, objectId);
      console.log(`[ManageGeofenceObjects] Unlinked object ${objectId} from geofence ${geofenceId}`);
    } catch (err: any) {
      console.error('[ManageGeofenceObjects] Failed to unlink object:', err.message);
      // Re-fetch to restore correct state
      await loadLinked();
      toast.show({ message: "Couldn't unlink note", description: 'Please try again.', tone: 'error' });
    }
  }, [geofenceId, loadLinked, toast]);

  // ─── Filter ────────────────────────────────────────────────────────────────

  const filteredObjects = searchText.trim()
    ? allObjects.filter((o) => {
        const label = (o.title || o.content || '').toLowerCase();
        return label.includes(searchText.toLowerCase());
      })
    : allObjects;

  // ─── Render ────────────────────────────────────────────────────────────────

  const renderLinkedSection = () => {
    if (linkedLoading) {
      return (
        <View style={styles.sectionLoading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      );
    }
    if (linkedObjects.length === 0) {
      return (
        <View style={styles.linkedEmpty}>
          <Text style={styles.linkedEmptyText}>No notes linked yet — add some below</Text>
        </View>
      );
    }
    return (
      <>
        {linkedObjects.map((obj) => (
          <View key={obj.id} style={styles.linkedRow}>
            <View style={styles.linkedRowContent}>
              <Text style={styles.linkedRowLabel} numberOfLines={2}>
                {obj.title || obj.content}
              </Text>
              <View style={styles.linkedRowMeta}>
                {obj.objectType && <Text style={styles.badge}>{obj.objectType}</Text>}
                {obj.domain && <Text style={[styles.badge, styles.domainBadge]}>{obj.domain}</Text>}
              </View>
            </View>
            <TouchableOpacity
              onPress={() => handleUnlink(obj.id)}
              style={styles.unlinkButton}
              accessibilityRole="button"
              accessibilityLabel="Unlink note"
            >
              <Ionicons name="close-circle" size={22} color={colors.error} />
            </TouchableOpacity>
          </View>
        ))}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Linked Notes</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{geofenceName}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={filteredObjects}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            {/* Linked section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Currently Linked{linkedObjects.length > 0 ? ` (${linkedObjects.length})` : ''}
              </Text>
              {renderLinkedSection()}
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Add section header */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Add Notes</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Filter notes..."
                placeholderTextColor={colors.textFaint}
                value={searchText}
                onChangeText={setSearchText}
                autoCorrect={false}
              />
            </View>
          </>
        }
        renderItem={({ item }) => {
          const isLinked = linkedIds.includes(item.id);
          const label = item.title || item.content;
          return (
            <TouchableOpacity
              style={[styles.objectRow, isLinked && styles.objectRowLinked]}
              onPress={() => isLinked ? handleUnlink(item.id) : handleLink(item.id)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${isLinked ? 'Unlink' : 'Link'} note: ${label}`}
              accessibilityState={{ selected: isLinked }}
            >
              <View style={styles.objectRowContent}>
                <Text style={styles.objectRowLabel} numberOfLines={2}>{label}</Text>
                <View style={styles.objectRowMeta}>
                  {item.objectType && <Text style={styles.badge}>{item.objectType}</Text>}
                  {item.domain && <Text style={[styles.badge, styles.domainBadge]}>{item.domain}</Text>}
                </View>
              </View>
              <View style={isLinked ? styles.linkedIndicator : styles.addIndicator}>
                <Ionicons
                  name={isLinked ? 'checkmark-circle' : 'add-circle-outline'}
                  size={24}
                  color={isLinked ? colors.accent : colors.textFaint}
                />
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          allLoading ? (
            <View style={styles.sectionLoading}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.loadingText}>Loading notes...</Text>
            </View>
          ) : (
            <View style={styles.linkedEmpty}>
              <Text style={styles.linkedEmptyText}>
                {searchText ? 'No matching notes' : 'No notes found'}
              </Text>
            </View>
          )
        }
        contentContainerStyle={styles.listContent}
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      paddingVertical: 14,
      backgroundColor: c.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    headerTextContainer: {
      flex: 1,
      marginLeft: 12,
    },
    headerTitle: {
      fontSize: 17,
      fontFamily: Fonts.bold,
      color: c.text,
    },
    headerSubtitle: {
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: c.textMuted,
      marginTop: 2,
    },
    headerSpacer: {
      width: 24,
    },
    listContent: {
      paddingBottom: 40,
    },
    section: {
      padding: Spacing.lg,
      paddingBottom: Spacing.sm,
    },
    sectionTitle: {
      fontSize: 13,
      fontFamily: Fonts.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 12,
    },
    sectionLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: Spacing.lg,
    },
    loadingText: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: c.textFaint,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginHorizontal: 0,
    },
    // Linked rows
    linkedEmpty: {
      backgroundColor: c.bgMuted,
      borderRadius: Radius.sm,
      padding: Spacing.lg,
      alignItems: 'center',
    },
    linkedEmptyText: {
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: c.textFaint,
    },
    linkedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bgSurface,
      borderRadius: Radius.sm,
      padding: Spacing.md,
      marginBottom: Spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      ...Elevation.level1,
    },
    linkedRowContent: {
      flex: 1,
    },
    linkedRowLabel: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: c.text,
      lineHeight: 20,
    },
    linkedRowMeta: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 4,
    },
    unlinkButton: {
      marginLeft: 10,
      padding: 4,
    },
    // All objects list
    searchInput: {
      backgroundColor: c.bgSurface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Radius.sm,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: c.text,
      marginBottom: 4,
    },
    objectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      paddingVertical: 14,
      backgroundColor: c.bgSurface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    objectRowLinked: {
      backgroundColor: c.accentLight,
    },
    objectRowContent: {
      flex: 1,
    },
    objectRowLabel: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: c.text,
      lineHeight: 20,
    },
    objectRowMeta: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 4,
    },
    badge: {
      fontSize: 11,
      fontFamily: Fonts.regular,
      color: c.textMuted,
      backgroundColor: c.bgMuted,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      textTransform: 'capitalize',
      overflow: 'hidden',
    },
    domainBadge: {
      color: c.accent,
      backgroundColor: c.accentLight,
    },
    linkedIndicator: {
      marginLeft: 12,
    },
    addIndicator: {
      marginLeft: 12,
    },
  });
