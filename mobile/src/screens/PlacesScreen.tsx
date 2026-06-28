import React, { useCallback, useState } from 'react';
import { View, Text, SectionList, TouchableOpacity, ActivityIndicator, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { apiService, PlaceOverviewItem } from '../services/api';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Places'>;

export default function PlacesScreen({ navigation }: { navigation: Nav }) {
  const [items, setItems] = useState<PlaceOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { places } = await apiService.getPlacesOverview();
      setItems(places);
    } catch (e) {
      console.warn('[PlacesScreen] load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sections = [
    { title: 'Your places', data: items.filter((i) => i.labeled) },
    { title: 'Detected places', data: items.filter((i) => !i.labeled) },
  ].filter((s) => s.data.length > 0);

  const openPlace = (item: PlaceOverviewItem) => {
    navigation.navigate('PlaceSummary',
      item.kind === 'geofence'
        ? { geofenceId: item.id, placeName: item.name }
        : { placeId: item.id, placeName: item.name });
  };

  if (loading && items.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{ marginTop: 40 }} color="#4F46E5" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#4F46E5" />}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => openPlace(item)} activeOpacity={0.7}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.count}>{item.openCount} {item.openCount === 1 ? 'note' : 'notes'}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No places yet. Create one under "Place reminders."</Text>
        }
        contentContainerStyle={{ padding: 16 }}
      />
      <TouchableOpacity style={styles.manage} onPress={() => navigation.navigate('Reminders')}>
        <Text style={styles.manageText}>Manage / add a place</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  sectionHeader: { color: '#6B7280', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 16, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: '#111827', fontSize: 16, fontWeight: '600' },
  count: { color: '#6B7280', fontSize: 13 },
  empty: { color: '#6B7280', textAlign: 'center', marginTop: 40 },
  manage: { padding: 16, alignItems: 'center' },
  manageText: { color: '#4F46E5', fontSize: 15, fontWeight: '600' },
});
