/**
 * Floating banner shown when the foreground proximity check (useProximityAlerts)
 * detects the user is at one of their places with open notes. Tapping it opens
 * the place's notes; the ✕ dismisses it for this visit.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useProximityAlerts } from '../hooks/useProximityAlerts';
import { navigationRef } from '../navigation/navigationRef';

// Fixed top offset to clear the status bar / notch. Avoids useSafeAreaInsets,
// which requires a SafeAreaProvider in the tree above this component.
const TOP_OFFSET = Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight ?? 24) + 8;

export function ProximityBanner() {
  const { match, dismiss } = useProximityAlerts();

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
    <View style={[styles.wrap, { top: TOP_OFFSET }]} pointerEvents="box-none">
      <TouchableOpacity style={styles.banner} onPress={open} activeOpacity={0.85}>
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
    backgroundColor: '#0284C7',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  icon: { marginRight: 10 },
  textCol: { flex: 1 },
  title: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  sub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 1 },
  close: { marginLeft: 8 },
});
