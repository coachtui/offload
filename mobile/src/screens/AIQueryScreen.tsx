import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAI, AIMessage } from '../hooks/useAI';
import { useVoiceDictation } from '../hooks/useVoiceDictation';
import { AppScreen, AppHeader, Spacing } from '../components/ui';
import { Fonts, Elevation, ThemeColors, useTheme, useThemedStyles } from '../theme';

export default function AIQueryScreen({ navigation, route }: any) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const initialQuery: string | undefined = route?.params?.initialQuery;
  const [inputText, setInputText] = useState(initialQuery ?? '');

  // navigate() to an already-mounted AskOffload updates params without
  // remounting, so the useState seed above never re-runs — re-seed on change
  // (e.g. tapping a second example in How Offload works).
  useEffect(() => {
    if (initialQuery) setInputText(initialQuery);
  }, [initialQuery]);

  const {
    messages,
    conversationId,
    conversationTitle,
    threads,
    loading,
    resuming,
    error,
    askQuestion,
    openThread,
    checkForUpdates,
    newThread,
    deleteThread,
    refreshThreads,
  } = useAI();

  const [threadListVisible, setThreadListVisible] = useState(false);

  // Saved threads are what makes the header's "past threads" affordance
  // meaningful — load them up front so the button isn't a blind tap.
  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  // Deep link from elsewhere in the app (a thread notification, a link on the
  // home screen) opens that thread and fires its delta report.
  const initialConversationId: string | undefined = route?.params?.conversationId;
  useEffect(() => {
    if (initialConversationId) void openThread(initialConversationId);
  }, [initialConversationId, openThread]);
  const {
    isDictating,
    liveTranscript,
    error: dictationError,
    start: startDictation,
    stop: stopDictation,
  } = useVoiceDictation();
  // Text that was in the box before dictation started — dictation appends, never destroys.
  const dictationBaseRef = useRef('');
  const flatListRef = useRef<FlatList>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  // Stream the live transcript into the box while dictating (appended to prior text)
  useEffect(() => {
    if (!isDictating) return;
    const base = dictationBaseRef.current;
    setInputText(liveTranscript ? (base ? base + ' ' + liveTranscript : liveTranscript) : base);
  }, [liveTranscript, isDictating]);

  // On dictation error, restore whatever was typed before the mic was tapped
  useEffect(() => {
    if (dictationError) setInputText(dictationBaseRef.current);
  }, [dictationError]);

  // Stop dictation when the screen loses focus. Native-stack pushes keep this
  // screen mounted (e.g. a notification tap navigating to PlaceSummary), so
  // unmount teardown alone would leave the mic hot behind the covering screen.
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      if (isDictating) {
        void stopDictation();
      }
    });
    return unsubscribe;
  }, [navigation, isDictating, stopDictation]);

  const handleMicPress = async () => {
    if (loading) return;
    if (isDictating) {
      const final = await stopDictation();
      const base = dictationBaseRef.current;
      setInputText(final ? (base ? base + ' ' + final : final) : base);
    } else {
      dictationBaseRef.current = inputText.trim();
      await startDictation();
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || loading) return;

    const question = inputText.trim();
    setInputText('');

    await askQuestion(question);
  };

  /**
   * A delta report is not a chat turn — it is the thread telling you what
   * moved while you were gone. It gets its own full-width treatment with the
   * deterministic counts on top of the narration, because the counts are the
   * part that came from the database and are guaranteed true.
   */
  const renderDelta = (item: AIMessage) => {
    const d = item.delta;
    const counts: string[] = [];
    if (d?.resolved.length) counts.push(`${d.resolved.length} resolved`);
    if (d?.stillOpen.length) counts.push(`${d.stillOpen.length} still open`);
    if (d?.newlyMentioned.length) counts.push(`${d.newlyMentioned.length} new`);
    if (d?.gone.length) counts.push(`${d.gone.length} deleted`);

    return (
      <View style={styles.deltaContainer}>
        <View style={styles.deltaHeaderRow}>
          <Ionicons name="git-compare-outline" size={15} color={colors.success} />
          <Text style={styles.deltaHeaderText}>
            {d && d.daysSince > 0
              ? `Since you last looked · ${d.daysSince} day${d.daysSince === 1 ? '' : 's'}`
              : 'Since you last looked'}
          </Text>
        </View>

        {counts.length > 0 && (
          <View style={styles.chipRow}>
            {counts.map((label) => (
              <View key={label} style={styles.deltaCountChip}>
                <Text style={styles.deltaCountText}>{label}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.deltaBody}>{item.content}</Text>

        {d && d.stillOpen.length > 0 && (
          <View style={styles.deltaSection}>
            <Text style={styles.metaLabel}>Still open</Text>
            {d.stillOpen.slice(0, 5).map((o) => (
              <Text key={o.objectId} style={styles.deltaItem} numberOfLines={2}>
                • {o.title}
              </Text>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderMessage = ({ item }: { item: AIMessage }) => {
    if (item.role === 'delta') return renderDelta(item);

    const isUser = item.role === 'user';

    return (
      <View style={[styles.messageContainer, isUser && styles.userMessageContainer]}>
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.aiBubble]}>
          <Text style={[styles.messageText, isUser && styles.userMessageText]}>
            {item.content}
          </Text>

          {/* Themes */}
          {item.themes && item.themes.length > 0 && (
            <View style={styles.metaSection}>
              <Text style={styles.metaLabel}>Themes</Text>
              <View style={styles.chipRow}>
                {item.themes.map((theme) => (
                  <View key={theme} style={styles.themeChip}>
                    <Text style={styles.themeChipText}>{theme}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Gaps */}
          {item.gaps && (
            <View style={styles.metaSection}>
              <Text style={styles.metaLabel}>Gaps in your notes</Text>
              <Text style={styles.gapText}>{item.gaps}</Text>
            </View>
          )}

          {/* Cited + contradiction flag */}
          <View style={styles.messageFooter}>
            {item.citedIds && item.citedIds.length > 0 && (
              <Text style={styles.citedText}>
                {item.citedIds.length} note{item.citedIds.length !== 1 ? 's' : ''} cited
              </Text>
            )}
            {item.hasContradictions && (
              <View style={styles.contradictionRow}>
                <Ionicons name="alert-circle-outline" size={13} color={colors.warning} />
                <Text style={styles.contradictionText}>Contradictions found</Text>
              </View>
            )}
            <Text style={styles.timestamp}>
              {new Date(item.timestamp).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              })}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="chatbubbles-outline" size={80} color={colors.accentBorder} />
      <Text style={styles.emptyStateTitle}>Ask Offload</Text>
      <Text style={styles.emptyStateText}>
        Ask anything about your notes.
      </Text>
      <View style={styles.exampleQuestionsContainer}>
        <Text style={styles.exampleQuestionsTitle}>Try asking:</Text>
        {EXAMPLE_QUESTIONS.map((question) => (
          <TouchableOpacity
            key={question}
            style={styles.exampleQuestionChip}
            onPress={() => askQuestion(question)}
          >
            <Text style={styles.exampleQuestionText}>{question}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <AppScreen>
      <AppHeader
        title={conversationTitle ?? 'Ask Offload'}
        subtitle={
          conversationId
            ? resuming
              ? 'Checking for updates…'
              : `${messages.length} message${messages.length === 1 ? '' : 's'}`
            : 'Ask me anything'
        }
        left={
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        }
        right={
          <View style={styles.headerActions}>
            {/* Re-check an open thread on demand. Opening already does this
                automatically; this is for "I closed that ten minutes ago". */}
            {conversationId && (
              <TouchableOpacity
                onPress={checkForUpdates}
                disabled={resuming || loading}
                accessibilityRole="button"
                accessibilityLabel="Check for updates"
              >
                <Ionicons
                  name="refresh-outline"
                  size={22}
                  color={resuming || loading ? colors.textFaint : colors.textSecondary}
                />
              </TouchableOpacity>
            )}
            {messages.length > 0 && (
              <TouchableOpacity
                onPress={newThread}
                accessibilityRole="button"
                accessibilityLabel="New thread"
              >
                <Ionicons name="create-outline" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => {
                void refreshThreads();
                setThreadListVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Saved threads"
            >
              <Ionicons name="albums-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Error Banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Messages List */}
      {/* No keyboardVerticalOffset: the header is part of this screen's own
          layout (headerShown: false), so there's no navigation bar to offset
          for — a non-zero value here floats the input bar that far above the
          keyboard. */}
      <KeyboardAvoidingView
        style={styles.messagesContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        {/* Loading Indicator */}
        {(loading || resuming) && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.loadingText}>
              {resuming ? 'Checking what changed…' : 'Thinking...'}
            </Text>
          </View>
        )}

        {dictationError && (
          <Text style={styles.dictationError}>{dictationError}</Text>
        )}

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Ask about your notes..."
            placeholderTextColor={colors.textFaint}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            editable={!loading && !isDictating}
          />
          <TouchableOpacity
            style={styles.micButton}
            onPress={handleMicPress}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={isDictating ? 'Stop dictation' : 'Start dictation'}
          >
            <Ionicons
              name={isDictating ? 'stop-circle' : 'mic-outline'}
              size={24}
              color={loading ? colors.textFaint : isDictating ? colors.error : colors.textMuted}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || loading || isDictating) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || loading || isDictating}
            accessibilityRole="button"
            accessibilityLabel="Send question"
          >
            <Ionicons
              name="send"
              size={20}
              color={!inputText.trim() || loading || isDictating ? colors.textFaint : '#FFFFFF'}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={threadListVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setThreadListVisible(false)}
      >
        <AppScreen>
          <AppHeader
            title="Saved threads"
            subtitle={threads.length === 0 ? 'None yet' : `${threads.length} saved`}
            right={
              <TouchableOpacity
                onPress={() => setThreadListVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            }
          />
          <FlatList
            data={threads}
            keyExtractor={(t) => t.id}
            contentContainerStyle={styles.threadList}
            ListEmptyComponent={
              <View style={styles.threadEmpty}>
                <Text style={styles.emptyStateText}>
                  Threads you start here are saved. Come back to one later and Offload will tell
                  you what changed.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.threadRow, item.id === conversationId && styles.threadRowActive]}
                onPress={() => {
                  setThreadListVisible(false);
                  void openThread(item.id);
                }}
                onLongPress={() =>
                  Alert.alert('Delete thread?', item.title, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => void deleteThread(item.id),
                    },
                  ])
                }
                accessibilityRole="button"
                accessibilityLabel={`Open thread: ${item.title}`}
              >
                <View style={styles.threadRowMain}>
                  <Text style={styles.threadTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {!!item.lastMessagePreview && (
                    <Text style={styles.threadPreview} numberOfLines={2}>
                      {item.lastMessagePreview}
                    </Text>
                  )}
                  <Text style={styles.threadMeta}>
                    {item.messageCount} message{item.messageCount === 1 ? '' : 's'} ·{' '}
                    {new Date(item.updatedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </TouchableOpacity>
            )}
          />
        </AppScreen>
      </Modal>
    </AppScreen>
  );
}

const EXAMPLE_QUESTIONS = [
  'What did I say I needed at Costco?',
  'Summarize my gym notes this week.',
  'What tasks did I mention for work?',
  'What ideas have I been thinking about?',
];

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },

    // Delta report — full width, not a bubble. It is the thread reporting on
    // the world, not either party speaking.
    deltaContainer: {
      marginBottom: 16,
      padding: 14,
      borderRadius: 14,
      backgroundColor: c.successBg,
      borderWidth: 1,
      borderColor: c.successBorder,
    },
    deltaHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    deltaHeaderText: {
      fontSize: 11,
      fontFamily: Fonts.semibold,
      color: c.success,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    deltaCountChip: {
      backgroundColor: c.bgSurface,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.successBorder,
    },
    deltaCountText: { fontSize: 12, color: c.success, fontFamily: Fonts.medium },
    deltaBody: { fontSize: 15, lineHeight: 21, color: c.textSecondary, marginTop: 10 },
    deltaSection: {
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.successBorder,
    },
    deltaItem: { fontSize: 13, lineHeight: 19, color: c.textMuted, marginTop: 2 },

    // Saved-thread list
    threadList: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 },
    threadEmpty: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
    threadRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.bgSurface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      ...Elevation.level1,
    },
    threadRowActive: { borderColor: c.accentBorder, backgroundColor: c.accentLight },
    threadRowMain: { flex: 1 },
    threadTitle: { fontSize: 15, fontFamily: Fonts.semibold, color: c.text },
    threadPreview: { fontSize: 13, color: c.textMuted, lineHeight: 18, marginTop: 4 },
    threadMeta: { fontSize: 11, color: c.textFaint, marginTop: 6 },

    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.errorBg,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.errorBorder,
    },
    errorText: {
      flex: 1,
      fontSize: 14,
      color: c.error,
      marginLeft: 8,
    },
    messagesContainer: {
      flex: 1,
    },
    messagesList: {
      paddingHorizontal: 16,
      paddingVertical: 20,
      flexGrow: 1,
    },
    messageContainer: {
      marginBottom: 16,
      alignItems: 'flex-start',
    },
    userMessageContainer: {
      alignItems: 'flex-end',
    },
    messageBubble: {
      maxWidth: '80%',
      borderRadius: 16,
      padding: 12,
    },
    userBubble: {
      backgroundColor: c.accent,
      borderBottomRightRadius: 4,
    },
    aiBubble: {
      backgroundColor: c.bgSurface,
      borderBottomLeftRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      ...Elevation.level1,
    },
    messageText: {
      fontSize: 15,
      lineHeight: 21,
      color: c.textSecondary,
    },
    userMessageText: {
      color: '#FFFFFF',
    },
    metaSection: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    metaLabel: {
      fontSize: 11,
      fontFamily: Fonts.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    themeChip: {
      backgroundColor: c.accentLight,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: c.accentBorder,
    },
    themeChipText: { fontSize: 12, color: c.accent, fontFamily: Fonts.medium },
    gapText: { fontSize: 12, color: c.textMuted, lineHeight: 18, marginTop: 2 },
    messageFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      gap: 8,
    },
    citedText: { fontSize: 11, color: c.textFaint },
    contradictionRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    contradictionText: { fontSize: 11, color: c.warning, fontFamily: Fonts.semibold },
    timestamp: { fontSize: 11, color: c.textFaint, marginLeft: 'auto' },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 40,
    },
    emptyStateTitle: {
      fontSize: 24,
      fontFamily: Fonts.bold,
      color: c.text,
      marginTop: 20,
      marginBottom: 8,
    },
    emptyStateText: {
      fontSize: 15,
      color: c.textMuted,
      textAlign: 'center',
      lineHeight: 22,
    },
    exampleQuestionsContainer: {
      marginTop: 32,
      width: '100%',
    },
    exampleQuestionsTitle: {
      fontSize: 13,
      fontFamily: Fonts.semibold,
      color: c.textMuted,
      marginBottom: 12,
      textAlign: 'center',
    },
    exampleQuestionChip: {
      backgroundColor: c.accentLight,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: c.accentBorder,
    },
    exampleQuestionText: {
      fontSize: 14,
      color: c.accent,
      fontFamily: Fonts.medium,
      textAlign: 'center',
    },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
    },
    loadingText: {
      fontSize: 14,
      color: c.textMuted,
      marginLeft: 8,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: c.bgSurface,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    input: {
      flex: 1,
      maxHeight: 100,
      backgroundColor: c.bgMuted,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 15,
      fontFamily: Fonts.regular,
      color: c.text,
      marginRight: 8,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonDisabled: {
      backgroundColor: c.border,
    },
    micButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 8,
    },
    dictationError: {
      color: c.error,
      fontSize: 13,
      paddingHorizontal: 16,
      paddingBottom: 4,
      backgroundColor: c.bgSurface,
    },
  });
