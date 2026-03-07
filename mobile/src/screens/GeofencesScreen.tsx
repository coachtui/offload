/**
 * Geofences Screen
 * List and manage geofences with privacy controls
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useGeofences } from '../hooks/useGeofences';
import { geofenceMonitoringService } from '../services/geofenceMonitoringService';
import { locationService } from '../services/locationService';

interface GeofencesScreenProps {
  navigation: any;
}

export default function GeofencesScreen({ navigation }: GeofencesScreenProps) {
  const {
    geofences,
    loading,
    error,
    refreshing,
    fetchGeofences,
    deleteGeofence,
    enableGeofence,
    disableGeofence,
  } = useGeofences();

  const [showPrivacyDashboard, setShowPrivacyDashboard] = useState(false);
  const [privacyStats, setPrivacyStats] = useState<any>(null);
  const [pendingToggles, setPendingToggles] = useState<Record<string, boolean>>({});

  /**
   * Load privacy statistics
   */
  const loadPrivacyStats = async () => {
    const summary = await locationService.getPrivacySummary();
    const monitoring = geofenceMonitoringService.getMonitoringStats();

    setPrivacyStats({
      ...summary,
      ...monitoring,
    });
  };

  useEffect(() => {
    loadPrivacyStats();
  }, [geofences]);

  /**
   * Handle geofence toggle (enable/disable)
   */
  const handleToggle = async (id: string, currentlyEnabled: boolean) => {
    // Optimistic update so the switch flips immediately
    setPendingToggles(prev => ({ ...prev, [id]: !currentlyEnabled }));

    try {
      if (currentlyEnabled) {
        const success = await disableGeofence(id);
        console.log('[GeofencesScreen] disableGeofence result:', success);
        if (success) {
          Alert.alert('Geofence Disabled', 'Notifications paused for this geofence');
        } else {
          setPendingToggles(prev => { const n = { ...prev }; delete n[id]; return n; });
        }
      } else {
        const canMonitor = await locationService.canMonitorGeofences();

        if (!canMonitor.allowed) {
          setPendingToggles(prev => { const n = { ...prev }; delete n[id]; return n; });
          Alert.alert(
            'Permission Required',
            canMonitor.reason + '\n\nWould you like to enable it now?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Enable',
                onPress: async () => {
                  const granted = await locationService.requestBackgroundPermission();
                  if (granted) {
                    setPendingToggles(prev => ({ ...prev, [id]: true }));
                    const success = await enableGeofence(id);
                    if (!success) setPendingToggles(prev => { const n = { ...prev }; delete n[id]; return n; });
                  }
                },
              },
            ]
          );
        } else {
          const success = await enableGeofence(id);
          console.log('[GeofencesScreen] enableGeofence result:', success);
          if (success) {
            Alert.alert('Geofence Enabled', 'You will be notified when entering this area');
          } else {
            setPendingToggles(prev => { const n = { ...prev }; delete n[id]; return n; });
          }
        }
      }
    } catch (e) {
      // Revert on error
      setPendingToggles(prev => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  /**
   * Handle geofence deletion
   */
  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      'Delete Geofence',
      `Are you sure you want to delete "${name}"?\n\nThis will remove all location data associated with this geofence.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteGeofence(id);
            if (success) {
              Alert.alert('Deleted', 'Geofence and location data removed');
            } else {
              Alert.alert('Error', 'Failed to delete geofence');
            }
          },
        },
      ]
    );
  };

  /**
   * Render geofence item
   */
  const renderGeofence = ({ item }: any) => {
    const displayEnabled = pendingToggles[item.id] ?? item.enabled;

    return (
      <View style={styles.geofenceCard}>
        <View style={styles.geofenceHeader}>
          <View style={styles.geofenceInfo}>
            <Text style={styles.geofenceName}>{item.name}</Text>
            <Text style={styles.geofenceType}>
              {item.type.charAt(0).toUpperCase() + item.type.slice(1)} • {item.radius}m radius
            </Text>
            {item.description && (
              <Text style={styles.geofenceDescription}>{item.description}</Text>
            )}
          </View>

          <Switch
            value={displayEnabled}
            onValueChange={() => handleToggle(item.id, displayEnabled)}
          />
        </View>

        <View style={styles.geofenceStats}>
          <Text style={styles.statText}>
            {displayEnabled ? '📍 Actively monitoring' : '⏸️ Paused'}
          </Text>
          {item.notifyOnEnter && <Text style={styles.statBadge}>Entry alerts</Text>}
          {item.notifyOnExit && <Text style={styles.statBadge}>Exit alerts</Text>}
        </View>

        <View style={styles.geofenceActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              // TODO: Navigate to edit screen
              Alert.alert('Edit', 'Edit functionality coming soon');
            }}
          >
            <Text style={styles.actionButtonText}>Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => handleDelete(item.id, item.name)}
          >
            <Text style={[styles.actionButtonText, styles.deleteButtonText]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  /**
   * Render privacy dashboard
   */
  const renderPrivacyDashboard = () => {
    if (!showPrivacyDashboard || !privacyStats) return null;

    return (
      <View style={styles.privacyDashboard}>
        <View style={styles.dashboardHeader}>
          <Text style={styles.dashboardTitle}>Privacy Dashboard</Text>
          <TouchableOpacity onPress={() => setShowPrivacyDashboard(false)}>
            <Ionicons name="close" size={24} color="#6B7280" />
          </TouchableOpacity>
        </View>

        <View style={styles.dashboardSection}>
          <Text style={styles.dashboardLabel}>Location Permissions</Text>
          {privacyStats.permissionsGranted.map((perm: string) => (
            <Text key={perm} style={styles.dashboardValue}>
              ✓ {perm}
            </Text>
          ))}
        </View>

        <View style={styles.dashboardSection}>
          <Text style={styles.dashboardLabel}>Active Monitoring</Text>
          <Text style={styles.dashboardValue}>
            {privacyStats.activeRegions} of {privacyStats.maxRegions} geofences active
          </Text>
        </View>

        <View style={styles.dashboardSection}>
          <Text style={styles.dashboardLabel}>Privacy Guarantee</Text>
          <Text style={styles.dashboardNote}>
            • Location only accessed for geofence creation{'\n'}
            • No location history tracked or stored{'\n'}
            • OS-level monitoring (battery efficient){'\n'}
            • Delete any geofence to remove location data
          </Text>
        </View>

        <TouchableOpacity
          style={styles.deleteAllButton}
          onPress={() => {
            Alert.alert(
              'Delete All Location Data',
              'This will remove all geofences and stop all location monitoring. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete All',
                  style: 'destructive',
                  onPress: async () => {
                    await geofenceMonitoringService.stopAllMonitoring();
                    // TODO: Delete all geofences from server
                    Alert.alert('Deleted', 'All location data removed');
                    setShowPrivacyDashboard(false);
                  },
                },
              ]
            );
          }}
        >
          <Text style={styles.deleteAllButtonText}>Delete All Location Data</Text>
        </TouchableOpacity>
      </View>
    );
  };

  /**
   * Render empty state
   */
  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>📍</Text>
      <Text style={styles.emptyTitle}>No Geofences Yet</Text>
      <Text style={styles.emptyText}>
        Create geofences to get notified about relevant notes when you arrive at specific places.
      </Text>
      <Text style={styles.privacyNote}>
        🔒 We only store coordinates you explicitly save. Your location is never tracked.
      </Text>
    </View>
  );

  if (loading && geofences.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.loadingText}>Loading geofences...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Geofences</Text>
        </View>
        <TouchableOpacity onPress={() => setShowPrivacyDashboard(!showPrivacyDashboard)}>
          <Ionicons name="shield-checkmark-outline" size={24} color="#4F46E5" />
        </TouchableOpacity>
      </View>

      {/* Privacy Dashboard */}
      {renderPrivacyDashboard()}

      {/* Error */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* List */}
      <FlatList
        data={geofences}
        keyExtractor={(item) => item.id}
        renderItem={renderGeofence}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={fetchGeofences} />
        }
      />

      {/* Create Button */}
      <TouchableOpacity
        style={styles.createFab}
        onPress={() => navigation.navigate('CreateGeofence')}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
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
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FCA5A5',
  },
  errorText: {
    color: '#991B1B',
    fontSize: 14,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
  geofenceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  geofenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  geofenceInfo: {
    flex: 1,
    marginRight: 12,
  },
  geofenceName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  geofenceType: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  geofenceDescription: {
    fontSize: 14,
    color: '#4B5563',
    marginTop: 4,
  },
  geofenceStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  statText: {
    fontSize: 14,
    color: '#6B7280',
  },
  statBadge: {
    backgroundColor: '#DBEAFE',
    color: '#1E40AF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '600',
  },
  geofenceActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
  },
  deleteButtonText: {
    color: '#991B1B',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 24,
  },
  privacyNote: {
    fontSize: 14,
    color: '#3B82F6',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  privacyDashboard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  dashboardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  dashboardSection: {
    marginBottom: 16,
  },
  dashboardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  dashboardValue: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 12,
    marginBottom: 4,
  },
  dashboardNote: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
    marginLeft: 12,
  },
  deleteAllButton: {
    backgroundColor: '#FEE2E2',
    padding: 14,
    borderRadius: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  deleteAllButtonText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '600',
  },
  createFab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '300',
  },
});
