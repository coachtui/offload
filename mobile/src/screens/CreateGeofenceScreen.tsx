/**
 * Create Geofence Screen
 * Privacy-first geofence creation with map interface
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import { locationService, LocationUsageReason } from '../services/locationService';
import PlaceLocationMap from '../components/PlaceLocationMap';
import { useGeofences } from '../hooks/useGeofences';
import { apiService } from '../services/api';
import { AtomicObject } from '../types';
import { RootStackParamList } from '../navigation/types';
import {
  AppInput,
  ConfirmSheet,
  useToast,
  Spacing,
  Radius,
} from '../components/ui';
import { Fonts, Elevation, ThemeColors, useTheme, useThemedStyles } from '../theme';

interface CreateGeofenceScreenProps {
  navigation: any;
}

export default function CreateGeofenceScreen({ navigation }: CreateGeofenceScreenProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  // Arriving from a pending lookup's "Pick on the map": the spoken name is
  // pre-filled, and saving also resolves the lookup (linking the note).
  const route = useRoute<RouteProp<RootStackParamList, 'CreateGeofence'>>();
  const prefillName = route.params?.prefillName;
  const pendingLookupId = route.params?.pendingLookupId;

  // Form state
  const [name, setName] = useState(prefillName ?? '');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'home' | 'work' | 'gym' | 'store' | 'custom'>('custom');
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [radius, setRadius] = useState(200); // Default 200m
  const [notifyOnEnter, setNotifyOnEnter] = useState(true);
  const [notifyOnExit, setNotifyOnExit] = useState(false);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('08:00');

  // Inline validation state
  const [nameError, setNameError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [radiusError, setRadiusError] = useState<string | null>(null);

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
  const [locationSheetVisible, setLocationSheetVisible] = useState(false);
  const [bgPermSheetVisible, setBgPermSheetVisible] = useState(false);
  const bgPermResolver = useRef<(() => void) | null>(null);

  const toast = useToast();
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

  const requestLocationAccess = () => {
    setLocationSheetVisible(true);
  };

  const performLocationRequest = async () => {
    setLocationLoading(true);

    try {
      const reason: LocationUsageReason = {
        action: 'create_geofence',
        description: locationService.getPermissionExplanation('create_geofence'),
        requiresBackground: false,
      };

      const granted = await locationService.requestForegroundPermission(reason);

      if (granted) {
        const currentLocation = await locationService.getCurrentLocation();
        if (currentLocation) {
          setLocation({
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
          });
          setLocationError(null);
          console.log('[CreateGeofence] Location obtained');
        } else {
          toast.show({ message: "Couldn't get your location", tone: 'error' });
        }
      } else {
        toast.show({
          message: 'Location permission needed',
          description: 'Location permission is required to create geofences. You can enable it in Settings.',
          tone: 'error',
        });
      }
    } catch (error) {
      console.error('[CreateGeofence] Error requesting location:', error);
      toast.show({ message: 'Failed to get location', tone: 'error' });
    } finally {
      setLocationLoading(false);
    }
  };

  const handleLocationChange = (coordinate: { latitude: number; longitude: number }) => {
    setLocation(coordinate);
    setLocationError(null);
  };

  // ─── Create ──────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!name.trim()) {
      setNameError('Please enter a name for this geofence');
      return;
    }

    if (!location) {
      setLocationError('Please set a location for this geofence');
      return;
    }

    if (radius < 50 || radius > 5000) {
      setRadiusError('Radius must be between 50m and 5km');
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
        quietHoursStart: quietHoursEnabled ? quietHoursStart : undefined,
        quietHoursEnd: quietHoursEnabled ? quietHoursEnd : undefined,
      });

      if (!geofence) {
        toast.show({ message: "Couldn't save place", description: 'Please try again.', tone: 'error' });
        return;
      }

      // Saving FOR a pending lookup: tell the server, so the note that asked
      // the question gets linked and the row leaves the "needs a location"
      // queue. Non-fatal — the geofence exists either way, and the pending row
      // simply stays answerable.
      if (pendingLookupId) {
        try {
          await apiService.resolvePendingPlace(pendingLookupId, { geofenceId: geofence.id });
          console.log(`[CreateGeofence] Resolved pending lookup ${pendingLookupId}`);
        } catch (resolveErr) {
          console.warn('[CreateGeofence] Failed to resolve pending lookup (non-fatal):', resolveErr);
        }
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

      toast.show({
        message: 'Place saved',
        description: `"${geofence.name}" has been saved${linkedObjectIds.length > 0 ? ` with ${linkedObjectIds.length} linked note${linkedObjectIds.length !== 1 ? 's' : ''}` : ''}.`,
        tone: 'success',
      });
      navigation.goBack();
    } catch (error: any) {
      console.error('[CreateGeofence] Error creating:', error);
      toast.show({
        message: "Couldn't save place",
        description: error.message || 'Failed to create geofence',
        tone: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const explainBackgroundPermission = () => {
    return new Promise<void>((resolve) => {
      bgPermResolver.current = resolve;
      setBgPermSheetVisible(true);
    });
  };

  /** Sheet dismissed without confirming → treated as "No Thanks". */
  const handleBgPermClose = () => {
    setBgPermSheetVisible(false);
    // Defer so a confirm (which runs synchronously right after close) can
    // claim the resolver first.
    setTimeout(() => {
      if (bgPermResolver.current) {
        setNotifyOnEnter(false);
        setNotifyOnExit(false);
        bgPermResolver.current();
        bgPermResolver.current = null;
      }
    }, 0);
  };

  const handleBgPermConfirm = async () => {
    const resolve = bgPermResolver.current;
    bgPermResolver.current = null;
    const granted = await locationService.requestBackgroundPermission();
    if (!granted) {
      toast.show({
        message: 'Background location required',
        description: 'Background location is required for geofence notifications. You can enable it in Settings.',
        tone: 'error',
      });
    }
    resolve?.();
  };

  // Request location on mount
  useEffect(() => {
    requestLocationAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────────

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
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>New Place</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Privacy Notice */}
      <View style={styles.privacyNotice}>
        <Ionicons name="lock-closed-outline" size={16} color={colors.accent} />
        <Text style={styles.privacyText}>
          Your location is only used to set this geofence. We don't track your movements.
        </Text>
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        {location ? (
          <PlaceLocationMap location={location} radius={radius} onLocationChange={handleLocationChange} />
        ) : (
          <View style={styles.mapPlaceholder}>
            {locationLoading ? (
              <ActivityIndicator size="large" color={colors.accent} />
            ) : (
              <TouchableOpacity onPress={requestLocationAccess} style={styles.locationButton}>
                <Ionicons name="location-outline" size={18} color="#FFFFFF" />
                <Text style={styles.locationButtonText}>Enable Location</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
      {locationError ? <Text style={styles.mapError}>{locationError}</Text> : null}

      {/* Form */}
      <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
        {/* Name */}
        <View style={styles.formGroup}>
          <AppInput
            label="Name *"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (nameError) setNameError(null);
            }}
            placeholder="e.g., Home, Office, Gym"
            error={nameError ?? undefined}
          />
        </View>

        {/* Description */}
        <View style={styles.formGroup}>
          <AppInput
            label="Description (Optional)"
            value={description}
            onChangeText={setDescription}
            placeholder="What should you remember here?"
            multiline
            numberOfLines={3}
            style={styles.textAreaInput}
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
                accessibilityState={{ selected: type === t }}
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
                onPress={() => {
                  setRadius(r);
                  if (radiusError) setRadiusError(null);
                }}
              >
                <Text style={[styles.radiusButtonText, radius === r && styles.radiusButtonTextActive]}>
                  {r}m
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {radiusError ? <Text style={styles.inlineError}>{radiusError}</Text> : null}
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
            <View style={styles.permissionNote}>
              <Ionicons name="phone-portrait-outline" size={16} color={colors.textMuted} />
              <Text style={styles.permissionNoteText}>
                Background location permission will be requested to enable notifications
              </Text>
            </View>
          )}
        </View>

        {/* Quiet Hours */}
        <View style={styles.formGroup}>
          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
              <Text style={styles.switchText}>Do not disturb</Text>
              <Text style={styles.switchSubtext}>Suppress notifications during set hours</Text>
            </View>
            <Switch value={quietHoursEnabled} onValueChange={setQuietHoursEnabled} />
          </View>
          {quietHoursEnabled && (
            <>
              <Text style={styles.quietLabel}>Don't notify from</Text>
              <View style={styles.radiusButtons}>
                {[['8 PM','20:00'],['9 PM','21:00'],['10 PM','22:00'],['11 PM','23:00'],['12 AM','00:00']].map(([label, val]) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.radiusButton, quietHoursStart === val && styles.radiusButtonActive]}
                    onPress={() => setQuietHoursStart(val)}
                  >
                    <Text style={[styles.radiusButtonText, quietHoursStart === val && styles.radiusButtonTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.quietLabel, { marginTop: 10 }]}>Until</Text>
              <View style={styles.radiusButtons}>
                {[['5 AM','05:00'],['6 AM','06:00'],['7 AM','07:00'],['8 AM','08:00'],['9 AM','09:00']].map(([label, val]) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.radiusButton, quietHoursEnd === val && styles.radiusButtonActive]}
                    onPress={() => setQuietHoursEnd(val)}
                  >
                    <Text style={[styles.radiusButtonText, quietHoursEnd === val && styles.radiusButtonTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
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
                  <TouchableOpacity
                    onPress={() => removeLinkedObject(id)}
                    style={styles.linkedChipRemove}
                    accessibilityRole="button"
                    accessibilityLabel="Remove"
                  >
                    <Ionicons name="close" size={14} color={colors.accent} />
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
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.createButtonText}>Save Place</Text>
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
              placeholderTextColor={colors.textFaint}
              value={pickerSearch}
              onChangeText={setPickerSearch}
              autoCorrect={false}
            />
          </View>

          {/* Object List */}
          {pickerLoading ? (
            <View style={styles.pickerLoading}>
              <ActivityIndicator size="large" color={colors.accent} />
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
                          <Ionicons name="checkmark" size={16} color="#FFFFFF" />
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

      {/* Foreground location permission prompt (replaces the old system alert) */}
      <ConfirmSheet
        visible={locationSheetVisible}
        onClose={() => setLocationSheetVisible(false)}
        onConfirm={performLocationRequest}
        title="Location Permission"
        message={locationService.getPermissionExplanation('create_geofence')}
        confirmLabel="Allow"
      />

      {/* Background location permission prompt (replaces the old system alert) */}
      <ConfirmSheet
        visible={bgPermSheetVisible}
        onClose={handleBgPermClose}
        onConfirm={handleBgPermConfirm}
        title="Background Location Access"
        message={locationService.getBackgroundPermissionExplanation()}
        // The sheet explains Always-location and the button calls
        // requestBackgroundPermission() — labelling it "Enable Notifications"
        // named the wrong permission on the one screen that justifies the most
        // scrutinised entitlement the app asks for.
        confirmLabel="Allow Always"
        cancelLabel="No Thanks"
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
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.lg,
      backgroundColor: c.bgSurface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitleContainer: {
      flex: 1,
      marginLeft: Spacing.lg,
    },
    headerTitle: {
      fontSize: 18,
      fontFamily: Fonts.bold,
      color: c.text,
      textAlign: 'center',
    },
    cancelText: {
      fontSize: 16,
      fontFamily: Fonts.semibold,
      color: c.error,
    },
    privacyNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
      backgroundColor: c.accentLight,
      paddingVertical: 14,
      paddingHorizontal: Spacing.xl,
      borderBottomWidth: 1,
      borderBottomColor: c.accentBorder,
    },
    privacyText: {
      flexShrink: 1,
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: c.accent,
      textAlign: 'center',
      lineHeight: 18,
    },
    mapContainer: {
      height: 250,
      backgroundColor: c.bgMuted,
    },
    mapPlaceholder: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    mapError: {
      fontSize: 13,
      fontFamily: Fonts.medium,
      color: c.error,
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.sm,
    },
    locationButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: c.accent,
      paddingHorizontal: Spacing.xxl,
      paddingVertical: Spacing.md,
      borderRadius: Radius.md,
    },
    locationButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontFamily: Fonts.semibold,
    },
    form: {
      flex: 1,
      padding: Spacing.xl,
    },
    formGroup: {
      marginBottom: Spacing.xxl,
    },
    label: {
      fontSize: 15,
      fontFamily: Fonts.semibold,
      color: c.text,
      marginBottom: 10,
    },
    textAreaInput: {
      flex: 1,
      fontSize: 15,
      fontFamily: Fonts.regular,
      color: c.text,
      paddingVertical: 12,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    inlineError: {
      fontSize: 13,
      fontFamily: Fonts.medium,
      color: c.error,
      marginTop: Spacing.sm,
    },
    typeButtons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    typeButton: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: Radius.full,
      backgroundColor: c.bgSurface,
      borderWidth: 1,
      borderColor: c.border,
    },
    typeButtonActive: {
      backgroundColor: c.accent,
      borderColor: c.accent,
    },
    typeButtonText: {
      fontSize: 14,
      color: c.textMuted,
      fontFamily: Fonts.medium,
    },
    typeButtonTextActive: {
      color: '#FFFFFF',
      fontFamily: Fonts.semibold,
    },
    radiusButtons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    radiusButton: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: Radius.full,
      backgroundColor: c.bgSurface,
      borderWidth: 1,
      borderColor: c.border,
    },
    radiusButtonActive: {
      backgroundColor: c.accent,
      borderColor: c.accent,
    },
    radiusButtonText: {
      fontSize: 14,
      color: c.textMuted,
      fontFamily: Fonts.medium,
    },
    radiusButtonTextActive: {
      color: '#FFFFFF',
      fontFamily: Fonts.semibold,
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: c.bgSurface,
      padding: 14,
      borderRadius: Radius.md,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.border,
      ...Elevation.level1,
    },
    switchLabel: {
      flex: 1,
    },
    switchText: {
      fontSize: 15,
      color: c.text,
      fontFamily: Fonts.semibold,
    },
    switchSubtext: {
      fontSize: 13,
      color: c.textMuted,
      marginTop: 4,
    },
    permissionNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
      marginTop: 10,
    },
    permissionNoteText: {
      flex: 1,
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: c.textMuted,
      lineHeight: 18,
    },
    quietLabel: {
      fontSize: 13,
      fontFamily: Fonts.semibold,
      color: c.textMuted,
      marginTop: 12,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
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
      color: c.textMuted,
      marginBottom: 12,
      lineHeight: 16,
    },
    linkButton: {
      backgroundColor: c.accent,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: Radius.sm,
    },
    linkButtonText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontFamily: Fonts.semibold,
    },
    linkedChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    linkedChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.accentLight,
      borderRadius: Radius.sm,
      paddingLeft: 10,
      paddingRight: 4,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: c.accentBorder,
      maxWidth: '100%',
    },
    linkedChipText: {
      fontSize: 13,
      color: c.accent,
      fontFamily: Fonts.medium,
      maxWidth: 220,
    },
    linkedChipRemove: {
      marginLeft: 6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.accentBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    linkedEmptyState: {
      backgroundColor: c.bgSurface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Radius.sm,
      padding: 14,
      alignItems: 'center',
    },
    linkedEmptyText: {
      fontSize: 13,
      color: c.textFaint,
    },
    createButton: {
      backgroundColor: c.accent,
      padding: Spacing.lg,
      borderRadius: Radius.md,
      alignItems: 'center',
      marginTop: 12,
      marginBottom: 32,
    },
    createButtonDisabled: {
      backgroundColor: c.borderStrong,
    },
    createButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontFamily: Fonts.semibold,
    },
    // Object Picker Modal
    pickerContainer: {
      flex: 1,
      backgroundColor: c.bgSurface,
    },
    pickerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    pickerCancel: {
      fontSize: 16,
      color: c.textMuted,
    },
    pickerTitle: {
      fontSize: 17,
      fontFamily: Fonts.bold,
      color: c.text,
    },
    pickerDone: {
      fontSize: 16,
      fontFamily: Fonts.bold,
      color: c.accent,
    },
    pickerSearchContainer: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.bgMuted,
    },
    pickerSearchInput: {
      backgroundColor: c.bgMuted,
      borderRadius: Radius.sm,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      fontFamily: Fonts.regular,
      color: c.text,
    },
    pickerLoading: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: Spacing.md,
    },
    pickerLoadingText: {
      fontSize: 14,
      color: c.textMuted,
    },
    pickerList: {
      paddingVertical: Spacing.sm,
    },
    pickerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.bgMuted,
    },
    pickerItemSelected: {
      backgroundColor: c.accentLight,
    },
    pickerItemCheck: {
      marginRight: 14,
    },
    pickerCheckEmpty: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: c.borderStrong,
    },
    pickerCheckFilled: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pickerItemContent: {
      flex: 1,
    },
    pickerItemLabel: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: c.text,
      lineHeight: 20,
    },
    pickerItemMeta: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 4,
    },
    pickerItemBadge: {
      fontSize: 11,
      color: c.textMuted,
      backgroundColor: c.bgMuted,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      textTransform: 'capitalize',
      overflow: 'hidden',
    },
    pickerItemDomainBadge: {
      color: c.accent,
      backgroundColor: c.accentLight,
    },
    pickerEmpty: {
      padding: 40,
      alignItems: 'center',
    },
    pickerEmptyText: {
      fontSize: 14,
      color: c.textFaint,
    },
  });
