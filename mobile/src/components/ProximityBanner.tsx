/**
 * Floating banner shown when the foreground proximity check (useProximityAlerts)
 * detects the user is at one of their places with open notes. Tapping it opens
 * the place's notes; the ✕ dismisses it for this visit.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useProximityAlerts } from '../hooks/useProximityAlerts';
import { navigationRef } from '../navigation/navigationRef';
import { Fonts, Radius, Spacing, Elevation, useTheme } from '../theme';

export function ProximityBanner() {
  const { match, dismiss } = useProximityAlerts();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  if (!match) return null;

  const open = () => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('PlaceSummary', {
        geofenceId: match.geofenceId,
        placeName: match.name,
      });
    }
    dismiss();
  };

  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <TouchableOpacity
        style={[styles.banner, { backgroundColor: colors.accent }]}
        onPress={open}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`You're at ${match.name}. Open notes for this place`}
      >
        <Ionicons name="location" size={22} color="#FFFFFF" style={styles.icon} />
        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>You're at {match.name}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {match.count > 1 ? `${match.count} notes · ` : ''}{match.preview}
          </Text>
        </View>
        <TouchableOpacity
          onPress={dismiss}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    zIndex: 1000,
    elevation: 1000,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg - 2,
    ...Elevation.level2,
    shadowOpacity: 0.2,
  },
  icon: { marginRight: 10 },
  textCol: { flex: 1 },
  title: { color: '#FFFFFF', fontFamily: Fonts.bold, fontSize: 15 },
  sub: { color: 'rgba(255,255,255,0.9)', fontFamily: Fonts.regular, fontSize: 13, marginTop: 1 },
  close: { marginLeft: 8 },
});
