import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useSessions } from '../hooks/useSessions';
import { VoiceSession } from '../types';
import { AudioPlayer } from '../components/AudioPlayer';

type SessionsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'History'>;

interface Props {
  navigation: SessionsScreenNavigationProp;
}

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

function formatDuration(ms: number): string {
  if (!ms) return '0:00';
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getStatusColor(status: VoiceSession['status']): string {
  switch (status) {
    case 'completed':
      return '#22c55e';
    case 'recording':
      return '#f59e0b';
    case 'processing':
      return '#3b82f6';
    case 'failed':
      return '#ef4444';
    default:
      return '#D1D5DB';
  }
}

function getStatusLabel(status: VoiceSession['status']): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'recording':
      return 'Recording';
    case 'processing':
      return 'Processing';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

export function SessionsScreen({ navigation }: Props) {
  const {
    sessions,
    isLoading,
    isRefreshing,
    error,
    hasMore,
    session: selectedSession,
    currentTranscript,
    duration,
    audioUrl,
    isLoadingDetail,
    isLoadingAudio,
    refresh,
    loadMore,
    fetchSessionDetail,
    clearDetail,
  } = useSessions();

  const [modalVisible, setModalVisible] = useState(false);

  const handleSessionPress = useCallback(
    async (session: VoiceSession) => {
      setModalVisible(true);
      await fetchSessionDetail(session.sessionId);
    },
    [fetchSessionDetail]
  );

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    clearDetail();
  }, [clearDetail]);

  const renderSessionCard = useCallback(
    ({ item }: { item: VoiceSession }) => {
      const transcript = item.metadata?.transcript as string | undefined;
      const sessionDuration = item.metadata?.duration as number | undefined;

      return (
        <TouchableOpacity
          style={styles.sessionCard}
          onPress={() => handleSessionPress(item)}
          activeOpacity={0.72}
        >
          <View style={styles.cardHeader}>
            <View style={styles.statusContainer}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
              <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
            </View>
            <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
          </View>

          {transcript ? (
            <Text style={styles.transcriptPreview} numberOfLines={2}>
              {transcript}
            </Text>
          ) : (
            <Text style={styles.noTranscript}>No text available</Text>
          )}

          {sessionDuration ? (
            <View style={styles.cardFooter}>
              <Text style={styles.durationText}>{formatDuration(sessionDuration)}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      );
    },
    [handleSessionPress]
  );

  const renderEmpty = useCallback(() => {
    if (isLoading) return null;

    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateIcon}>📝</Text>
        <Text style={styles.emptyStateTitle}>Nothing captured yet</Text>
        <Text style={styles.emptyStateText}>
          Your captured thoughts will appear here
        </Text>
      </View>
    );
  }, [isLoading]);

  const renderFooter = useCallback(() => {
    if (!hasMore || isLoading) return null;

    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator color="#3b82f6" />
      </View>
    );
  }, [hasMore, isLoading]);

  const renderError = useCallback(() => {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refresh}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }, [error, refresh]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>History</Text>
        <View style={styles.headerRight} />
      </View>

      {isLoading && sessions.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : error && sessions.length === 0 ? (
        renderError()
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.sessionId}
          renderItem={renderSessionCard}
          contentContainerStyle={sessions.length === 0 ? styles.listEmpty : styles.listContent}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor="#3b82f6"
              colors={['#3b82f6']}
            />
          }
        />
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={handleCloseModal}>
              <Text style={styles.modalCloseButton}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Note Details</Text>
            <View style={styles.headerRight} />
          </View>

          {isLoadingDetail ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator size="large" color="#3b82f6" />
            </View>
          ) : selectedSession ? (
            <View style={styles.modalContent}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Status</Text>
                <View style={styles.statusContainer}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: getStatusColor(selectedSession.status) },
                    ]}
                  />
                  <Text style={styles.detailValue}>{getStatusLabel(selectedSession.status)}</Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Date</Text>
                <Text style={styles.detailValue}>{formatDate(selectedSession.createdAt)}</Text>
              </View>

              {duration > 0 && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Duration</Text>
                  <Text style={styles.detailValue}>{formatDuration(duration)}</Text>
                </View>
              )}

              {selectedSession.status === 'completed' && (
                <View style={styles.audioSection}>
                  <Text style={styles.sectionTitle}>Audio</Text>
                  {isLoadingAudio ? (
                    <ActivityIndicator color="#3b82f6" />
                  ) : audioUrl ? (
                    <AudioPlayer audioUrl={audioUrl} />
                  ) : (
                    <Text style={styles.noAudioText}>Audio not available</Text>
                  )}
                </View>
              )}

              <View style={styles.transcriptSection}>
                <Text style={styles.sectionTitle}>Transcript</Text>
                {currentTranscript ? (
                  <Text style={styles.transcriptText}>{currentTranscript}</Text>
                ) : (
                  <Text style={styles.noTranscriptText}>No text available</Text>
                )}
              </View>
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>
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
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    color: '#3b82f6',
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  headerRight: {
    width: 50,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  listEmpty: {
    flex: 1,
  },
  sessionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#6B7280',
    textTransform: 'capitalize',
  },
  dateText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  transcriptPreview: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 8,
  },
  noTranscript: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  durationText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  loadingFooter: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalCloseButton: {
    color: '#3b82f6',
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    flex: 1,
    padding: 24,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 14,
    color: '#111827',
  },
  audioSection: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  noAudioText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  transcriptSection: {
    marginTop: 24,
    flex: 1,
  },
  transcriptText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
  },
  noTranscriptText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
});
