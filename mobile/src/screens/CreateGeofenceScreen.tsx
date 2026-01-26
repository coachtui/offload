/**
 * Create Geofence Screen
 * Privacy-first geofence creation with map interface
 */

import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { locationService, LocationUsageReason } from '../services/locationService';
import { useGeofences } from '../hooks/useGeofences';

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

  // UI state
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [showPermissionExplanation, setShowPermissionExplanation] = useState(false);

  const { createGeofence } = useGeofences();

  /**
   * Request location permission and get current location
   */
  const requestLocationAccess = async () => {
    setLocationLoading(true);

    try {
      // Show explanation first
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

  /**
   * Handle map press to set geofence location
   */
  const handleMapPress = (event: any) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setLocation({ latitude, longitude });
    console.log('[CreateGeofence] Location set via map:', latitude, longitude);
  };

  /**
   * Validate and create geofence
   */
  const handleCreate = async () => {
    // Validation
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
      // Explain background permission if notifications enabled
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

      if (geofence) {
        Alert.alert(
          'Geofence Created',
          `"${geofence.name}" has been created successfully.`,
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to create geofence');
      }
    } catch (error: any) {
      console.error('[CreateGeofence] Error creating:', error);
      Alert.alert('Error', error.message || 'Failed to create geofence');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Explain background permission requirement
   */
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

  return (
    <View style={styles.container}>
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
              fillColor="rgba(59, 130, 246, 0.2)"
              strokeColor="rgba(59, 130, 246, 0.8)"
              strokeWidth={2}
            />
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            {locationLoading ? (
              <ActivityIndicator size="large" color="#3B82F6" />
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

        {/* Create Button */}
        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.createButtonText}>Create Geofence</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  privacyNotice: {
    backgroundColor: '#DBEAFE',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#93C5FD',
  },
  privacyText: {
    fontSize: 14,
    color: '#1E40AF',
    textAlign: 'center',
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
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  locationButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  form: {
    flex: 1,
    padding: 16,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  typeButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  typeButtonText: {
    fontSize: 14,
    color: '#6B7280',
  },
  typeButtonTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  radiusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  radiusButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  radiusButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  radiusButtonText: {
    fontSize: 14,
    color: '#6B7280',
  },
  radiusButtonTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  switchLabel: {
    flex: 1,
  },
  switchText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  switchSubtext: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  permissionNote: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 8,
    fontStyle: 'italic',
  },
  createButton: {
    backgroundColor: '#3B82F6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  createButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  createButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
