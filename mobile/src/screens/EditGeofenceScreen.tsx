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
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useGeofences } from '../hooks/useGeofences';
import { AppInput, ConfirmSheet, useToast, Spacing, Radius } from '../components/ui';
import { Fonts, Elevation, ThemeColors, useTheme, useThemedStyles } from '../theme';

type EditRoute = RouteProp<RootStackParamList, 'EditGeofence'>;
type EditNav = NativeStackNavigationProp<RootStackParamList, 'EditGeofence'>;

interface Props {
  navigation: EditNav;
}

export default function EditGeofenceScreen({ navigation }: Props) {
  const route = useRoute<EditRoute>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
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
  const [nameError, setNameError] = useState<string | null>(null);
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
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toast = useToast();
  const { updateGeofence, deleteGeofence } = useGeofences();

  const handleSave = async () => {
    if (!name.trim()) {
      setNameError('Please enter a name');
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
        toast.show({ message: "Couldn't save changes", description: 'Please try again.', tone: 'error' });
      }
    } catch (err: any) {
      toast.show({
        message: "Couldn't save changes",
        description: err.message || 'Failed to save changes',
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // The hook stops OS monitoring for this region before the API call, so a
      // deleted place can't keep firing from a stale registration.
      const deleted = await deleteGeofence(geofenceId);
      if (deleted) {
        toast.show({ message: `${geofenceName} deleted`, tone: 'success' });
        // Not goBack(): that lands on the place's summary screen, which is now
        // showing a geofence that no longer exists. Places is the honest
        // destination — it pops back to it if it's already in the stack.
        navigation.navigate('Places');
      } else {
        toast.show({
          message: "Couldn't delete this place",
          description: 'Please try again.',
          tone: 'error',
        });
      }
    } catch (err: any) {
      toast.show({
        message: "Couldn't delete this place",
        description: err.message || 'Please try again.',
        tone: 'error',
      });
    } finally {
      setDeleting(false);
    }
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
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Edit Place</Text>
        </View>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
        {/* Location (read-only) */}
        <View style={styles.locationBanner}>
          <Ionicons name="location" size={16} color={colors.textMuted} />
          <Text style={styles.locationText}>
            {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
            {'  ·  '}To change location, delete and recreate.
          </Text>
        </View>

        {/* Name */}
        <View style={styles.formGroup}>
          <AppInput
            label="Name"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (nameError) setNameError(null);
            }}
            placeholder="e.g., Home, Office, Gym"
            error={nameError ?? undefined}
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
                accessibilityState={{ selected: type === t }}
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
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>

        {/* Delete — the only way to stop Offload watching a place you created. */}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => setConfirmDelete(true)}
          disabled={saving || deleting}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${geofenceName}`}
        >
          {deleting ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <>
              <Ionicons name="trash-outline" size={16} color={colors.error} />
              <Text style={styles.deleteButtonText}>Delete this place</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      <ConfirmSheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title={`Delete ${geofenceName}?`}
        message="Offload will stop watching this place and stop reminding you when you arrive. Notes attached to it are kept."
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
    saveText: {
      fontSize: 16,
      fontFamily: Fonts.bold,
      color: c.accent,
    },
    locationBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      backgroundColor: c.bgMuted,
      padding: Spacing.md,
      borderRadius: Radius.sm,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: Spacing.xxl,
    },
    locationText: {
      flex: 1,
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: c.textMuted,
      lineHeight: 18,
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
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    chip: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: Radius.full,
      backgroundColor: c.bgSurface,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipActive: {
      backgroundColor: c.accent,
      borderColor: c.accent,
    },
    chipText: {
      fontSize: 14,
      color: c.textMuted,
      fontFamily: Fonts.medium,
    },
    chipTextActive: {
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
    quietLabel: {
      fontSize: 13,
      fontFamily: Fonts.semibold,
      color: c.textMuted,
      marginTop: 12,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    saveButton: {
      backgroundColor: c.accent,
      padding: Spacing.lg,
      borderRadius: Radius.md,
      alignItems: 'center',
      marginTop: 12,
    },
    saveButtonDisabled: {
      backgroundColor: c.borderStrong,
    },
    saveButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontFamily: Fonts.semibold,
    },
    deleteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      padding: Spacing.lg,
      marginTop: Spacing.sm,
      marginBottom: 32,
    },
    deleteButtonText: {
      color: c.error,
      fontSize: 15,
      fontFamily: Fonts.medium,
    },
  });
