import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { RootStackParamList } from '../navigation/types';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

interface Props {
  navigation: HomeScreenNavigationProp;
}

export function HomeScreen({ navigation }: Props) {
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Brain Dump</Text>
        <TouchableOpacity onPress={logout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.greeting}>
          {user?.email ? `Hello, ${user.email.split('@')[0]}` : 'Welcome back'}
        </Text>
        <Text style={styles.subtitle}>What would you like to do?</Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Record')}
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>🎙️</Text>
            </View>
            <Text style={styles.actionTitle}>Record Voice</Text>
            <Text style={styles.actionDescription}>
              Capture your thoughts with real-time transcription
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Sessions')}
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>📝</Text>
            </View>
            <Text style={styles.actionTitle}>Sessions</Text>
            <Text style={styles.actionDescription}>
              View your past recordings and transcripts
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Objects')}
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>🧠</Text>
            </View>
            <Text style={styles.actionTitle}>Atomic Objects</Text>
            <Text style={styles.actionDescription}>
              Browse your extracted thoughts and ideas
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Search')}
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>🔍</Text>
            </View>
            <Text style={styles.actionTitle}>Semantic Search</Text>
            <Text style={styles.actionDescription}>
              Find objects using natural language queries
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('AIQuery')}
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>🤖</Text>
            </View>
            <Text style={styles.actionTitle}>AI Sparring</Text>
            <Text style={styles.actionDescription}>
              Ask questions about your thoughts and get AI answers
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Geofences')}
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>📍</Text>
            </View>
            <Text style={styles.actionTitle}>Geofences</Text>
            <Text style={styles.actionDescription}>
              Manage location-based reminders
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, styles.synthesisCard]}
            onPress={() => navigation.navigate('Synthesis')}
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>✨</Text>
            </View>
            <Text style={styles.actionTitle}>Weekly Synthesis</Text>
            <Text style={styles.actionDescription}>
              AI reflection on patterns, open threads, and insights from your week
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  logoutButton: {
    padding: 8,
  },
  logoutText: {
    color: '#888',
    fontSize: 14,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 32,
  },
  actions: {
    gap: 16,
  },
  actionCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#252525',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionIconText: {
    fontSize: 24,
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  actionDescription: {
    fontSize: 14,
    color: '#888',
  },
  synthesisCard: {
    borderColor: '#4338ca',
    backgroundColor: '#0f0e2a',
  },
});
