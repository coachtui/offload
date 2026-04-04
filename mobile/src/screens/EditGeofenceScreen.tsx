/**
 * EditGeofenceScreen
 * Edit an existing geofence's name, type, radius, notifications, and quiet hours.
 * Location is immutable — delete and recreate to change it.
 */

import React, { useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useGeofences } from '../hooks/useGeofences';

type EditRoute = RouteProp<RootStackParamList, 'EditGeofence'>;
type EditNav = NativeStackNavigationProp<RootStackParamList, 'EditGeofence'>;

interface Props {
  navigation: EditNav;
}

export default function EditGeofenceScreen({ navigation }: Props) {
  const route = useRoute<EditRoute>();
  const {
    geofenceId,
    geofenceName,
    type: initialType,
    radius: initialRadius,
    notifyOnEnter: initialNotifyOnEnter,
    notifyOnExit: initialNotifyOnExit,
    quietHoursStart: initialQHStart,
    quietHoursEnd: initialQHEnd,
    location,
  } = route.params;

  const [name, setName] = useState(geofenceName);
  const [type, setType] = useState<'home' | 'work' | 'gym' | 'store' | 'custom'>(initialType);
  const [radius, setRadius] = useState(initialRadius);
  const [notifyOnEnter, setNotifyOnEnter] = useState(initialNotifyOnEnter);
  const [notifyOnExit, setNotifyOnExit] = useState(initialNotifyOnExit);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(
    !!(initialQHStart && initialQHEnd)
  );
  const [quietHoursStart, setQuietHoursStart] = useState(initialQHStart || '22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState(initialQHEnd || '08:00');
  const [saving, setSaving] = useState(false);

  const { updateGeofence } = useGeofences();

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Please enter a name');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateGeofence(geofenceId, {
        name: name.trim(),
        type,
        radius,
        notifyOnEnter,
        notifyOnExit,
        quietHoursStart: quietHoursEnabled ? quietHoursStart : undefined,
        quietHoursEnd: quietHoursEnabled ? quietHoursEnd : undefined,
      });

      if (updated) {
        navigation.goBack();
      } else {
        Alert.alert('Error', 'Failed to save changes');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Edit Reminder</Text>
        </View>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#4F46E5" />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
        {/* Location (read-only) */}
        <View style={styles.locationBanner}>
          <Ionicons name="location" size={16} color="#6B7280" />
          <Text style={styles.locationText}>
            {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
            {'  ·  '}To change location, delete and recreate.
          </Text>
        </View>

        {/* Name */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g., Home, Office, Gym"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Type */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Type</Text>
          <View style={styles.chipRow}>
            {(['home', 'work', 'gym', 'store', 'custom'] as const).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, type === t && styles.chipActive]}
                onPress={() => setType(t)}
              >
                <Text style={[styles.chipText, type === t && styles.chipTextActive]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Radius */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Radius: {radius}m</Text>
          <View style={styles.chipRow}>
            {[50, 100, 200, 500, 1000].map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.chip, radius === r && styles.chipActive]}
                onPress={() => setRadius(r)}
              >
                <Text style={[styles.chipText, radius === r && styles.chipTextActive]}>
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
              <View style={styles.chipRow}>
                {[['8 PM','20:00'],['9 PM','21:00'],['10 PM','22:00'],['11 PM','23:00'],['12 AM','00:00']].map(([label, val]) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.chip, quietHoursStart === val && styles.chipActive]}
                    onPress={() => setQuietHoursStart(val)}
                  >
                    <Text style={[styles.chipText, quietHoursStart === val && styles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.quietLabel, { marginTop: 10 }]}>Until</Text>
              <View style={styles.chipRow}>
                {[['5 AM','05:00'],['6 AM','06:00'],['7 AM','07:00'],['8 AM','08:00'],['9 AM','09:00']].map(([label, val]) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.chip, quietHoursEnd === val && styles.chipActive]}
                    onPress={() => setQuietHoursEnd(val)}
                  >
                    <Text style={[styles.chipText, quietHoursEnd === val && styles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  saveText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4F46E5',
  },
  locationBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  locationText: {
    flex: 1,
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  chipText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  chipTextActive: {
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
  quietLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  saveButton: {
    backgroundColor: '#4F46E5',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 32,
  },
  saveButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
