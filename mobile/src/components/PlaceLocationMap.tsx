/**
 * PlaceLocationMap — shared map picker for a place's location.
 * Tap the map or drag the pin to move the center; the circle previews the
 * notification radius. Used by CreateGeofence and EditGeofence.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { useTheme } from '../theme';

interface Props {
  location: { latitude: number; longitude: number };
  radius: number;
  onLocationChange: (location: { latitude: number; longitude: number }) => void;
}

export default function PlaceLocationMap({ location, radius, onLocationChange }: Props) {
  const { colors, scheme } = useTheme();

  return (
    <MapView
      style={styles.map}
      initialRegion={{
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }}
      onPress={(e) => onLocationChange(e.nativeEvent.coordinate)}
    >
      <Marker
        coordinate={location}
        draggable
        onDragEnd={(e) => onLocationChange(e.nativeEvent.coordinate)}
      />
      <Circle
        center={location}
        radius={radius}
        fillColor={scheme === 'dark' ? 'rgba(83, 184, 165, 0.18)' : 'rgba(15, 107, 95, 0.15)'}
        strokeColor={colors.accent}
        strokeWidth={2}
      />
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
