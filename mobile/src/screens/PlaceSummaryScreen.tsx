/**
 * PlaceSummaryScreen
 *
 * Shown when the user taps a place-based geofence notification.
 * Displays linked atomic objects with Done / Dismiss / Snooze / Unlink actions.
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
  Modal,
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

const SNOOZE_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '4 hours', hours: 4 },
  { label: 'Tomorrow', hours: 24 },
];

export default function PlaceSummaryScreen({ navigation }: Props) {
  const route = useRoute<PlaceSummaryRoute>();
  const { placeId, placeName, eventType } = route.params;

  const [objects, setObjects] = useState<AtomicObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // objectId being actioned
  const [snoozeTarget, setSnoozeTarget] = useState<string | null>(null); // objectId for snooze modal

  // ─── Load objects ───────────────────────────────────────────────────────────

  const loadObjects = useCallback(async () => {
    setLoading(true);
    try {
      const { objects: loaded } = await apiService.getPlaceObjects(placeId);
      setObjects(loaded);
    } catch (err: any) {
      console.error('[PlaceSummary] Failed to load objects:', err.message);
    } finally {
      setLoading(false);
    }
  }, [placeId]);

  useEffect(() => {
    loadObjects();
  }, [loadObjects]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const handleDone = async (objectId: string) => {
    setActionLoading(objectId);
    try {
      await apiService.markPlaceObjectDone(placeId, objectId);
      setObjects(prev => prev.filter(o => o.id !== objectId));
    } catch (err: any) {
      Alert.alert('Error', 'Failed to mark as done.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDismiss = async (objectId: string) => {
    setActionLoading(objectId);
    try {
      await apiService.dismissPlaceObject(placeId, objectId);
      setObjects(prev => prev.filter(o => o.id !== objectId));
    } catch (err: any) {
      Alert.alert('Error', 'Failed to dismiss.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSnooze = async (objectId: string, hours: number) => {
    setSnoozeTarget(null);
    setActionLoading(objectId);
    try {
      const until = new Date(Date.now() + hours * 60 * 60 * 1000);
      await apiService.snoozePlaceObject(placeId, objectId, until);
      setObjects(prev => prev.filter(o => o.id !== objectId));
    } catch (err: any) {
      Alert.alert('Error', 'Failed to snooze.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnlink = (objectId: string) => {
    Alert.alert(
      'Unlink from place',
      'This note will no longer appear when you visit this place.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(objectId);
            try {
              await apiService.unlinkPlaceObject(placeId, objectId);
              setObjects(prev => prev.filter(o => o.id !== objectId));
            } catch (err: any) {
              Alert.alert('Error', 'Failed to unlink.');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
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
              style={styles.actionBtn}
              onPress={() => handleDismiss(item.id)}
            >
              <Ionicons name="eye-off-outline" size={14} color="#94a3b8" />
              <Text style={styles.actionBtnText}>Dismiss</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => setSnoozeTarget(item.id)}
            >
              <Ionicons name="time-outline" size={14} color="#94a3b8" />
              <Text style={styles.actionBtnText}>Snooze</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleUnlink(item.id)}
            >
              <Ionicons name="unlink-outline" size={14} color="#94a3b8" />
              <Text style={styles.actionBtnText}>Unlink</Text>
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
            {eventType === 'enter' ? "You're here" : 'You just left'}
          </Text>
        </View>
        <Ionicons name="location" size={20} color="#3b82f6" style={{ marginRight: 4 }} />
      </View>

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

      {/* Snooze modal */}
      <Modal
        visible={snoozeTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSnoozeTarget(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setSnoozeTarget(null)}
        >
          <View style={styles.snoozeSheet}>
            <Text style={styles.snoozeTitle}>Snooze until…</Text>
            {SNOOZE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.label}
                style={styles.snoozeOption}
                onPress={() => snoozeTarget && handleSnooze(snoozeTarget, opt.hours)}
              >
                <Text style={styles.snoozeOptionText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.snoozeCancelBtn}
              onPress={() => setSnoozeTarget(null)}
            >
              <Text style={styles.snoozeCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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
    marginBottom: 6,
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
  actionBtnText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  snoozeSheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  snoozeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e2e8f0',
    marginBottom: 16,
    textAlign: 'center',
  },
  snoozeOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    alignItems: 'center',
  },
  snoozeOptionText: {
    fontSize: 16,
    color: '#e2e8f0',
  },
  snoozeCancelBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 10,
  },
  snoozeCancelText: {
    fontSize: 15,
    color: '#64748b',
  },
});
