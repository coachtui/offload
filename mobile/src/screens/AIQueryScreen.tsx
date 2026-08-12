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
  const { messages, loading, error, askQuestion, clearConversation } = useAI();
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

  const renderMessage = ({ item }: { item: AIMessage }) => {
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
        title="Ask Offload"
        subtitle={messages.length === 0 ? 'Ask me anything' : `${messages.length} messages`}
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
          messages.length > 0 ? (
            <TouchableOpacity
              onPress={clearConversation}
              accessibilityRole="button"
              accessibilityLabel="Clear conversation"
            >
              <Ionicons name="trash-outline" size={22} color={colors.error} />
            </TouchableOpacity>
          ) : undefined
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
      <KeyboardAvoidingView
        style={styles.messagesContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
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
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.loadingText}>Thinking...</Text>
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
