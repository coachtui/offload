/**
 * PlaceSummaryScreen
 *
 * Shown when the user taps a place-based geofence notification.
 * Displays linked atomic objects with Done / Delete actions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { apiService } from '../services/api';
import { updateNoteState, deleteNote } from '../services/noteLifecycle';
import { subscribeNotesChanged } from '../services/notesBus';
import { AtomicObject } from '../types';
import { ConfirmSheet, useToast, Spacing, Radius } from '../components/ui';
import { Fonts, Elevation, ThemeColors, useTheme, useThemedStyles } from '../theme';

type PlaceSummaryRoute = RouteProp<RootStackParamList, 'PlaceSummary'>;
type PlaceSummaryNav = NativeStackNavigationProp<RootStackParamList, 'PlaceSummary'>;

interface Props {
  navigation: PlaceSummaryNav;
}

/** "When did I take this note?" — short date, with year if it's not this year. */
function formatNoteDate(value: Date | string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
  return d.toLocaleDateString(undefined, opts);
}

export default function PlaceSummaryScreen({ navigation }: Props) {
  const route = useRoute<PlaceSummaryRoute>();
  const { placeId, geofenceId, placeName, eventType } = route.params;
  const toast = useToast();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [objects, setObjects] = useState<AtomicObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // objectId being actioned
  const [editLoading, setEditLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ─── Load objects ───────────────────────────────────────────────────────────

  const loadObjects = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    try {
      const { objects: loaded } = geofenceId
        ? await apiService.getGeofenceObjects(geofenceId, true)
        : await apiService.getPlaceObjects(placeId!);
      setObjects(loaded);
    } catch (err: any) {
      console.error('[PlaceSummary] Failed to load objects:', err.message);
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, [placeId, geofenceId]);

  useEffect(() => {
    loadObjects();
  }, [loadObjects]);

  // Quiet, because this screen already applied its own Done/Delete
  // optimistically — the reload is for changes made elsewhere, and a spinner
  // over a list that is already correct just makes it flicker.
  useEffect(
    () => subscribeNotesChanged(() => { void loadObjects({ quiet: true }); }),
    [loadObjects]
  );

  // ─── Actions ────────────────────────────────────────────────────────────────

  const handleDone = async (objectId: string) => {
    setActionLoading(objectId);
    try {
      // Done = resolve the underlying object globally (gone from every place it's linked to)
      await updateNoteState(objectId, 'resolved');
      setObjects(prev => prev.filter(o => o.id !== objectId));
    } catch (err: any) {
      toast.show({ message: "Couldn't mark as done", description: 'Please try again.', tone: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = (objectId: string) => {
    setConfirmDeleteId(objectId);
  };

  const performDelete = async () => {
    const objectId = confirmDeleteId;
    if (!objectId) return;
    setActionLoading(objectId);
    try {
      await deleteNote(objectId);
      setObjects(prev => prev.filter(o => o.id !== objectId));
    } catch (err: any) {
      toast.show({ message: "Couldn't delete", description: 'Please try again.', tone: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  // ─── Edit reminder settings ─────────────────────────────────────────────────

  const handleEditReminderSettings = async () => {
    if (editLoading || !geofenceId) return;
    setEditLoading(true);
    try {
      const { geofences } = await apiService.getGeofences();
      const g = geofences.find((x) => x.id === geofenceId);
      if (g) {
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
      } else {
        toast.show({ message: "Couldn't open place settings", description: 'Please try again.', tone: 'error' });
      }
    } catch {
      toast.show({ message: "Couldn't open place settings", description: 'Please try again.', tone: 'error' });
    } finally {
      setEditLoading(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const renderObject = ({ item }: { item: AtomicObject }) => {
    const isActioning = actionLoading === item.id;
    const displayText = item.title || item.content || '';

    return (
      <View style={styles.objectCard}>
        <View style={styles.objectHeader}>
          {item.objectType ? (
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{item.objectType}</Text>
            </View>
          ) : null}
          {item.createdAt ? (
            <Text style={styles.objectDate}>{formatNoteDate(item.createdAt)}</Text>
          ) : null}
        </View>

        <Text style={styles.objectTitle} numberOfLines={3}>
          {displayText}
        </Text>

        {isActioning ? (
          <ActivityIndicator size="small" color={colors.accent} style={styles.actionLoader} />
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.doneBtn]}
              onPress={() => handleDone(item.id)}
            >
              <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
              <Text style={[styles.actionBtnText, { color: colors.success }]}>Done</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.deleteBtn]}
              onPress={() => handleDelete(item.id)}
            >
              <Ionicons name="trash-outline" size={14} color={colors.error} />
              <Text style={[styles.actionBtnText, { color: colors.error }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.placeName} numberOfLines={1}>
            {placeName}
          </Text>
          <Text style={styles.placeSubtitle}>
            {eventType === 'enter' ? "You're here" : eventType === 'exit' ? 'You just left' : 'Linked notes'}
          </Text>
        </View>
        <Ionicons name="location" size={20} color={colors.accent} style={{ marginRight: 4 }} />
      </View>

      {/* Edit reminder settings — only for saved geofences */}
      {geofenceId ? (
        <TouchableOpacity
          style={styles.editReminderRow}
          onPress={handleEditReminderSettings}
          disabled={editLoading}
        >
          {editLoading ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <>
              <Ionicons name="settings-outline" size={16} color={colors.accent} />
              <Text style={styles.editReminderText}>Edit place</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}

      {/* Content */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : objects.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.borderStrong} />
          <Text style={styles.emptyText}>Nothing to do here right now</Text>
        </View>
      ) : (
        <FlatList
          data={objects}
          keyExtractor={item => item.id}
          renderItem={renderObject}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <ConfirmSheet
        visible={confirmDeleteId != null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={performDelete}
        title="Delete note?"
        message="This note will be removed everywhere. You can recover it within 30 days."
        confirmLabel="Delete"
        destructive
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
      paddingVertical: Spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    backBtn: {
      padding: 4,
      marginRight: 8,
    },
    headerText: {
      flex: 1,
    },
    placeName: {
      fontSize: 18,
      fontFamily: Fonts.bold,
      color: c.text,
    },
    placeSubtitle: {
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: c.textMuted,
      marginTop: 1,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
    },
    emptyText: {
      fontSize: 15,
      fontFamily: Fonts.regular,
      color: c.textMuted,
      textAlign: 'center',
    },
    list: {
      padding: Spacing.lg,
    },
    separator: {
      height: 12,
    },
    objectCard: {
      backgroundColor: c.bgSurface,
      borderRadius: Radius.md,
      padding: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      ...Elevation.level1,
    },
    objectHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    objectDate: {
      marginLeft: 'auto',
      fontSize: 11,
      fontFamily: Fonts.regular,
      color: c.textMuted,
    },
    typeBadge: {
      backgroundColor: c.accentLight,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
    },
    typeBadgeText: {
      fontSize: 10,
      color: c.accent,
      fontFamily: Fonts.semibold,
      textTransform: 'uppercase',
    },
    objectTitle: {
      fontSize: 15,
      fontFamily: Fonts.regular,
      color: c.text,
      lineHeight: 21,
      marginBottom: 12,
    },
    actionLoader: {
      alignSelf: 'flex-start',
      marginTop: 4,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
      backgroundColor: c.bgMuted,
    },
    doneBtn: {
      backgroundColor: c.successBg,
    },
    deleteBtn: {
      backgroundColor: c.errorBg,
    },
    actionBtnText: {
      fontSize: 12,
      fontFamily: Fonts.medium,
      color: c.textMuted,
    },
    editReminderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: Spacing.lg,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    editReminderText: {
      fontSize: 13,
      color: c.accent,
      fontFamily: Fonts.medium,
    },
  });
