import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/types';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

interface Props {
  navigation: HomeScreenNavigationProp;
}

const NAV_ITEMS = [
  {
    icon: 'chatbubble-outline' as const,
    label: 'Chat',
    description: 'Ask anything about your notes',
    route: 'Chat' as const,
    iconColor: '#4F46E5',
    iconBg: '#EEF2FF',
  },
  {
    icon: 'notifications-outline' as const,
    label: 'Reminders',
    description: 'Notes tied to places',
    route: 'Reminders' as const,
    iconColor: '#0284C7',
    iconBg: '#E0F2FE',
  },
  {
    icon: 'bar-chart-outline' as const,
    label: 'Insights',
    description: 'Weekly patterns',
    route: 'Insights' as const,
    iconColor: '#059669',
    iconBg: '#D1FAE5',
  },
  {
    icon: 'time-outline' as const,
    label: 'History',
    description: 'Past captures',
    route: 'History' as const,
    iconColor: '#D97706',
    iconBg: '#FEF3C7',
  },
] as const;

export function HomeScreen({ navigation }: Props) {
  const { logout } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>Offload</Text>
        <TouchableOpacity
          onPress={logout}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
        >
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Mic button */}
        <View style={styles.micSection}>
          <TouchableOpacity
            style={styles.micButton}
            onPress={() => navigation.navigate('Record')}
            activeOpacity={0.82}
          >
            <Ionicons name="mic" size={42} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.micLabel}>Capture a thought</Text>
        </View>

        {/* Nav cards — 2 × 2 grid */}
        <View style={styles.grid}>
          {NAV_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.route}
              style={styles.card}
              onPress={() => navigation.navigate(item.route)}
              activeOpacity={0.72}
            >
              <View style={[styles.iconWrap, { backgroundColor: item.iconBg }]}>
                <Ionicons name={item.icon} size={22} color={item.iconColor} />
              </View>
              <Text style={styles.cardLabel}>{item.label}</Text>
              <Text style={styles.cardDesc}>{item.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  brand: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.4,
  },
  logoutText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 48,
  },
  micSection: {
    alignItems: 'center',
    marginBottom: 52,
  },
  micButton: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
  },
  micLabel: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: '47.5%',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
});
