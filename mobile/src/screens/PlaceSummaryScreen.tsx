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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { apiService } from '../services/api';
import { AtomicObject } from '../types';

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

  const [objects, setObjects] = useState<AtomicObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // objectId being actioned
  const [editLoading, setEditLoading] = useState(false);

  // ─── Load objects ───────────────────────────────────────────────────────────

  const loadObjects = useCallback(async () => {
    setLoading(true);
    try {
      const { objects: loaded } = geofenceId
        ? await apiService.getGeofenceObjects(geofenceId, true)
        : await apiService.getPlaceObjects(placeId!);
      setObjects(loaded);
    } catch (err: any) {
      console.error('[PlaceSummary] Failed to load objects:', err.message);
    } finally {
      setLoading(false);
    }
  }, [placeId, geofenceId]);

  useEffect(() => {
    loadObjects();
  }, [loadObjects]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const handleDone = async (objectId: string) => {
    setActionLoading(objectId);
    try {
      // Done = resolve the underlying object globally (gone from every place it's linked to)
      await apiService.updateObjectState(objectId, 'resolved');
      setObjects(prev => prev.filter(o => o.id !== objectId));
    } catch (err: any) {
      Alert.alert('Error', 'Failed to mark as done.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = (objectId: string) => {
    Alert.alert(
      'Delete note',
      'This note will be removed everywhere. You can recover it within 30 days.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(objectId);
            try {
              await apiService.deleteObject(objectId);
              setObjects(prev => prev.filter(o => o.id !== objectId));
            } catch (err: any) {
              Alert.alert('Error', 'Failed to delete.');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
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
        Alert.alert('Could not open reminder settings', 'Please try again.');
      }
    } catch {
      Alert.alert('Could not open reminder settings', 'Please try again.');
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
          <ActivityIndicator size="small" color="#3b82f6" style={styles.actionLoader} />
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.doneBtn]}
              onPress={() => handleDone(item.id)}
            >
              <Ionicons name="checkmark-circle-outline" size={14} color="#22c55e" />
              <Text style={[styles.actionBtnText, { color: '#22c55e' }]}>Done</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.deleteBtn]}
              onPress={() => handleDelete(item.id)}
            >
              <Ionicons name="trash-outline" size={14} color="#ef4444" />
              <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>Delete</Text>
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#e2e8f0" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.placeName} numberOfLines={1}>
            {placeName}
          </Text>
          <Text style={styles.placeSubtitle}>
            {eventType === 'enter' ? "You're here" : eventType === 'exit' ? 'You just left' : 'Linked notes'}
          </Text>
        </View>
        <Ionicons name="location" size={20} color="#3b82f6" style={{ marginRight: 4 }} />
      </View>

      {/* Edit reminder settings — only for saved geofences */}
      {geofenceId ? (
        <TouchableOpacity
          style={styles.editReminderRow}
          onPress={handleEditReminderSettings}
          disabled={editLoading}
        >
          {editLoading ? (
            <ActivityIndicator size="small" color="#3b82f6" />
          ) : (
            <>
              <Ionicons name="settings-outline" size={16} color="#3b82f6" />
              <Text style={styles.editReminderText}>Edit reminder settings</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}

      {/* Content */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : objects.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="checkmark-done-circle-outline" size={48} color="#475569" />
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
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
    fontWeight: '700',
    color: '#e2e8f0',
  },
  placeSubtitle: {
    fontSize: 12,
    color: '#64748b',
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
    color: '#64748b',
    textAlign: 'center',
  },
  list: {
    padding: 16,
  },
  separator: {
    height: 12,
  },
  objectCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  objectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  objectDate: {
    marginLeft: 'auto',
    fontSize: 11,
    color: '#64748b',
  },
  typeBadge: {
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 10,
    color: '#93c5fd',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  objectTitle: {
    fontSize: 15,
    color: '#e2e8f0',
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
    backgroundColor: '#1e293b',
  },
  doneBtn: {
    backgroundColor: '#052e16',
  },
  deleteBtn: {
    backgroundColor: '#2e0a0a',
  },
  actionBtnText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  editReminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  editReminderText: {
    fontSize: 13,
    color: '#3b82f6',
    fontWeight: '500',
  },
});
