/**
 * Create Geofence Screen
 * Privacy-first geofence creation with map interface
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Circle } from 'react-native-maps';
import { locationService, LocationUsageReason } from '../services/locationService';
import { useGeofences } from '../hooks/useGeofences';
import { apiService } from '../services/api';
import { AtomicObject } from '../types';

interface CreateGeofenceScreenProps {
  navigation: any;
}

export default function CreateGeofenceScreen({ navigation }: CreateGeofenceScreenProps) {
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'home' | 'work' | 'gym' | 'store' | 'custom'>('custom');
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [radius, setRadius] = useState(200); // Default 200m
  const [notifyOnEnter, setNotifyOnEnter] = useState(true);
  const [notifyOnExit, setNotifyOnExit] = useState(false);

  // Linked notes state
  const [linkedObjectIds, setLinkedObjectIds] = useState<string[]>([]);
  const [linkedObjectsMap, setLinkedObjectsMap] = useState<Record<string, string>>({}); // id → title/content
  const [showObjectPicker, setShowObjectPicker] = useState(false);
  const [pickerObjects, setPickerObjects] = useState<AtomicObject[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [tempSelected, setTempSelected] = useState<string[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  const { createGeofence } = useGeofences();

  // ─── Object Picker ──────────────────────────────────────────────────────────

  const openObjectPicker = useCallback(async () => {
    setTempSelected([...linkedObjectIds]);
    setPickerSearch('');
    setShowObjectPicker(true);
    setPickerLoading(true);
    try {
      const { objects } = await apiService.getObjects({ limit: 50 });
      setPickerObjects(objects);
    } catch {
      setPickerObjects([]);
    } finally {
      setPickerLoading(false);
    }
  }, [linkedObjectIds]);

  const filteredPickerObjects = pickerSearch.trim()
    ? pickerObjects.filter((o) => {
        const label = (o.title || o.content || '').toLowerCase();
        return label.includes(pickerSearch.toLowerCase());
      })
    : pickerObjects;

  const togglePickerItem = useCallback((id: string) => {
    setTempSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const confirmPicker = useCallback(() => {
    // Build title map for display
    const map: Record<string, string> = {};
    for (const id of tempSelected) {
      const obj = pickerObjects.find((o) => o.id === id);
      if (obj) map[id] = obj.title || obj.content || id;
    }
    setLinkedObjectIds(tempSelected);
    setLinkedObjectsMap(map);
    setShowObjectPicker(false);
    console.log(`[CreateGeofence] Linked ${tempSelected.length} object(s) selected`);
  }, [tempSelected, pickerObjects]);

  const removeLinkedObject = useCallback((id: string) => {
    setLinkedObjectIds((prev) => prev.filter((x) => x !== id));
    setLinkedObjectsMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // ─── Location ───────────────────────────────────────────────────────────────

  const requestLocationAccess = async () => {
    setLocationLoading(true);

    try {
      const reason: LocationUsageReason = {
        action: 'create_geofence',
        description: locationService.getPermissionExplanation('create_geofence'),
        requiresBackground: false,
      };

      Alert.alert(
        'Location Permission',
        reason.description,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => setLocationLoading(false),
          },
          {
            text: 'Allow',
            onPress: async () => {
              const granted = await locationService.requestForegroundPermission(reason);

              if (granted) {
                const currentLocation = await locationService.getCurrentLocation();
                if (currentLocation) {
                  setLocation({
                    latitude: currentLocation.coords.latitude,
                    longitude: currentLocation.coords.longitude,
                  });
                  console.log('[CreateGeofence] Location obtained');
                } else {
                  Alert.alert('Error', 'Could not get your location');
                }
              } else {
                Alert.alert(
                  'Permission Denied',
                  'Location permission is required to create geofences. You can enable it in Settings.'
                );
              }
              setLocationLoading(false);
            },
          },
        ]
      );
    } catch (error) {
      console.error('[CreateGeofence] Error requesting location:', error);
      Alert.alert('Error', 'Failed to get location');
      setLocationLoading(false);
    }
  };

  const handleMapPress = (event: any) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setLocation({ latitude, longitude });
    console.log('[CreateGeofence] Location set via map:', latitude, longitude);
  };

  // ─── Create ──────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Please enter a name for this geofence');
      return;
    }

    if (!location) {
      Alert.alert('Validation Error', 'Please set a location for this geofence');
      return;
    }

    if (radius < 50 || radius > 5000) {
      Alert.alert('Validation Error', 'Radius must be between 50m and 5km');
      return;
    }

    setLoading(true);

    try {
      if (notifyOnEnter || notifyOnExit) {
        await explainBackgroundPermission();
      }

      const geofence = await createGeofence({
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        location,
        radius,
        notifyOnEnter,
        notifyOnExit,
      });

      if (!geofence) {
        Alert.alert('Error', 'Failed to create geofence');
        return;
      }

      // Link selected objects after geofence is created
      if (linkedObjectIds.length > 0) {
        try {
          console.log(`[CreateGeofence] Linking ${linkedObjectIds.length} object(s) to geofence ${geofence.id}`);
          await apiService.setGeofenceObjects(geofence.id, linkedObjectIds);
          console.log('[CreateGeofence] Objects linked successfully');
        } catch (linkErr) {
          // Non-fatal — geofence was created; user can manage links later
          console.warn('[CreateGeofence] Failed to link objects (non-fatal):', linkErr);
        }
      }

      Alert.alert(
        'Reminder saved',
        `"${geofence.name}" has been saved${linkedObjectIds.length > 0 ? ` with ${linkedObjectIds.length} linked note${linkedObjectIds.length !== 1 ? 's' : ''}` : ''}.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error: any) {
      console.error('[CreateGeofence] Error creating:', error);
      Alert.alert('Error', error.message || 'Failed to create geofence');
    } finally {
      setLoading(false);
    }
  };

  const explainBackgroundPermission = async () => {
    return new Promise<void>((resolve) => {
      Alert.alert(
        'Background Location Access',
        locationService.getBackgroundPermissionExplanation(),
        [
          {
            text: 'No Thanks',
            style: 'cancel',
            onPress: () => {
              setNotifyOnEnter(false);
              setNotifyOnExit(false);
              resolve();
            },
          },
          {
            text: 'Enable Notifications',
            onPress: async () => {
              const granted = await locationService.requestBackgroundPermission();
              if (!granted) {
                Alert.alert(
                  'Permission Required',
                  'Background location is required for geofence notifications. You can enable it in Settings.',
                  [{ text: 'OK', onPress: () => resolve() }]
                );
              } else {
                resolve();
              }
            },
          },
        ]
      );
    });
  };

  // Request location on mount
  useEffect(() => {
    requestLocationAccess();
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>New Reminder</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Privacy Notice */}
      <View style={styles.privacyNotice}>
        <Text style={styles.privacyText}>
          🔒 Your location is only used to set this geofence. We don't track your movements.
        </Text>
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        {location ? (
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            onPress={handleMapPress}
          >
            <Marker coordinate={location} title="Geofence Center" />
            <Circle
              center={location}
              radius={radius}
              fillColor="rgba(79, 70, 229, 0.2)"
              strokeColor="rgba(79, 70, 229, 0.8)"
              strokeWidth={2}
            />
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            {locationLoading ? (
              <ActivityIndicator size="large" color="#4F46E5" />
            ) : (
              <TouchableOpacity onPress={requestLocationAccess} style={styles.locationButton}>
                <Text style={styles.locationButtonText}>📍 Enable Location</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Form */}
      <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
        {/* Name */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g., Home, Office, Gym"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Description */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Description (Optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="What should you remember here?"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Type */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Type</Text>
          <View style={styles.typeButtons}>
            {(['home', 'work', 'gym', 'store', 'custom'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.typeButton, type === t && styles.typeButtonActive]}
                onPress={() => setType(t)}
              >
                <Text style={[styles.typeButtonText, type === t && styles.typeButtonTextActive]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Radius */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Radius: {radius}m</Text>
          <View style={styles.radiusButtons}>
            {[50, 100, 200, 500, 1000].map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.radiusButton, radius === r && styles.radiusButtonActive]}
                onPress={() => setRadius(r)}
              >
                <Text style={[styles.radiusButtonText, radius === r && styles.radiusButtonTextActive]}>
                  {r}m
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Notifications</Text>

          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
              <Text style={styles.switchText}>Notify on entry</Text>
              <Text style={styles.switchSubtext}>Alert when you arrive</Text>
            </View>
            <Switch value={notifyOnEnter} onValueChange={setNotifyOnEnter} />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
              <Text style={styles.switchText}>Notify on exit</Text>
              <Text style={styles.switchSubtext}>Alert when you leave</Text>
            </View>
            <Switch value={notifyOnExit} onValueChange={setNotifyOnExit} />
          </View>

          {(notifyOnEnter || notifyOnExit) && (
            <Text style={styles.permissionNote}>
              📱 Background location permission will be requested to enable notifications
            </Text>
          )}
        </View>

        {/* Linked Notes */}
        <View style={styles.formGroup}>
          <View style={styles.linkedNotesHeader}>
            <Text style={styles.label}>Linked Notes{linkedObjectIds.length > 0 ? ` (${linkedObjectIds.length})` : ''}</Text>
            <TouchableOpacity style={styles.linkButton} onPress={openObjectPicker}>
              <Text style={styles.linkButtonText}>+ Add Notes</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.linkedNotesSubtext}>
            Notes linked here will appear in notifications when you arrive or leave
          </Text>

          {linkedObjectIds.length > 0 ? (
            <View style={styles.linkedChips}>
              {linkedObjectIds.map((id) => (
                <View key={id} style={styles.linkedChip}>
                  <Text style={styles.linkedChipText} numberOfLines={1}>
                    {linkedObjectsMap[id] || id}
                  </Text>
                  <TouchableOpacity onPress={() => removeLinkedObject(id)} style={styles.linkedChipRemove}>
                    <Text style={styles.linkedChipRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.linkedEmptyState}>
              <Text style={styles.linkedEmptyText}>No notes linked yet</Text>
            </View>
          )}
        </View>

        {/* Create Button */}
        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.createButtonText}>Save Reminder</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Object Picker Modal */}
      <Modal
        visible={showObjectPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowObjectPicker(false)}
      >
        <SafeAreaView style={styles.pickerContainer}>
          {/* Picker Header */}
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={() => setShowObjectPicker(false)}>
              <Text style={styles.pickerCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>Link Notes</Text>
            <TouchableOpacity onPress={confirmPicker}>
              <Text style={styles.pickerDone}>
                Done{tempSelected.length > 0 ? ` (${tempSelected.length})` : ''}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.pickerSearchContainer}>
            <TextInput
              style={styles.pickerSearchInput}
              placeholder="Filter notes..."
              placeholderTextColor="#9CA3AF"
              value={pickerSearch}
              onChangeText={setPickerSearch}
              autoCorrect={false}
            />
          </View>

          {/* Object List */}
          {pickerLoading ? (
            <View style={styles.pickerLoading}>
              <ActivityIndicator size="large" color="#4F46E5" />
              <Text style={styles.pickerLoadingText}>Loading notes...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredPickerObjects}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isSelected = tempSelected.includes(item.id);
                const label = item.title || item.content;
                return (
                  <TouchableOpacity
                    style={[styles.pickerItem, isSelected && styles.pickerItemSelected]}
                    onPress={() => togglePickerItem(item.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.pickerItemCheck}>
                      {isSelected ? (
                        <View style={styles.pickerCheckFilled}>
                          <Text style={styles.pickerCheckMark}>✓</Text>
                        </View>
                      ) : (
                        <View style={styles.pickerCheckEmpty} />
                      )}
                    </View>
                    <View style={styles.pickerItemContent}>
                      <Text style={styles.pickerItemLabel} numberOfLines={2}>{label}</Text>
                      <View style={styles.pickerItemMeta}>
                        {item.objectType && (
                          <Text style={styles.pickerItemBadge}>{item.objectType}</Text>
                        )}
                        {item.domain && (
                          <Text style={[styles.pickerItemBadge, styles.pickerItemDomainBadge]}>
                            {item.domain}
                          </Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.pickerEmpty}>
                  <Text style={styles.pickerEmptyText}>
                    {pickerSearch ? 'No matching notes' : 'No notes found'}
                  </Text>
                </View>
              }
              contentContainerStyle={styles.pickerList}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
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
  headerTitleContainer: {
    flex: 1,
    marginLeft: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
  privacyNotice: {
    backgroundColor: '#EFF6FF',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
  },
  privacyText: {
    fontSize: 13,
    color: '#3B82F6',
    textAlign: 'center',
    lineHeight: 18,
  },
  mapContainer: {
    height: 250,
    backgroundColor: '#E5E7EB',
  },
  map: {
    flex: 1,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationButton: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  locationButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  form: {
    flex: 1,
    padding: 20,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#111827',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  typeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  typeButtonActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  typeButtonText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  typeButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  radiusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  radiusButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  radiusButtonActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  radiusButtonText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  radiusButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  switchLabel: {
    flex: 1,
  },
  switchText: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },
  switchSubtext: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  permissionNote: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 10,
    lineHeight: 18,
  },
  // Linked Notes section
  linkedNotesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  linkedNotesSubtext: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 12,
    lineHeight: 16,
  },
  linkButton: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  linkButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  linkedChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  linkedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    maxWidth: '100%',
  },
  linkedChipText: {
    fontSize: 13,
    color: '#3730A3',
    fontWeight: '500',
    maxWidth: 220,
  },
  linkedChipRemove: {
    marginLeft: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#C7D2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkedChipRemoveText: {
    fontSize: 14,
    color: '#3730A3',
    fontWeight: '700',
    lineHeight: 18,
  },
  linkedEmptyState: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  linkedEmptyText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  createButton: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 32,
  },
  createButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Object Picker Modal
  pickerContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  pickerCancel: {
    fontSize: 16,
    color: '#6B7280',
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  pickerDone: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4F46E5',
  },
  pickerSearchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerSearchInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
  },
  pickerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  pickerLoadingText: {
    fontSize: 14,
    color: '#6B7280',
  },
  pickerList: {
    paddingVertical: 8,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerItemSelected: {
    backgroundColor: '#F5F3FF',
  },
  pickerItemCheck: {
    marginRight: 14,
  },
  pickerCheckEmpty: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1D5DB',
  },
  pickerCheckFilled: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerCheckMark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  pickerItemContent: {
    flex: 1,
  },
  pickerItemLabel: {
    fontSize: 14,
    color: '#111827',
    lineHeight: 20,
  },
  pickerItemMeta: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  pickerItemBadge: {
    fontSize: 11,
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    textTransform: 'capitalize',
    overflow: 'hidden',
  },
  pickerItemDomainBadge: {
    color: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  pickerEmpty: {
    padding: 40,
    alignItems: 'center',
  },
  pickerEmptyText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
});
