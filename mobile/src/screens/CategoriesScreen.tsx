// mobile/src/screens/CategoriesScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useCategories } from '../hooks/useCategories';
import { UserCategory } from '../types';
import { ConfirmSheet, useToast, Spacing, Radius } from '../components/ui';
import { Fonts, Elevation, ThemeColors, useTheme, useThemedStyles } from '../theme';

// Harmonized with the Deep Lagoon palette
const PALETTE = ['#2C6E8F', '#7A5FB0', '#1E7B54', '#A1740C', '#0F6B5F', '#B0508A', '#C2492F', '#5F6B66'];

const PALETTE_NAMES: Record<string, string> = {
  '#2C6E8F': 'Blue',
  '#7A5FB0': 'Purple',
  '#1E7B54': 'Green',
  '#A1740C': 'Amber',
  '#0F6B5F': 'Teal',
  '#B0508A': 'Magenta',
  '#C2492F': 'Red',
  '#5F6B66': 'Gray',
};

type Nav = NativeStackNavigationProp<RootStackParamList, 'Categories'>;

export default function CategoriesScreen({ navigation }: { navigation: Nav }) {
  const { categories, isLoading, error, createCategory, updateCategory, deleteCategory, applyCategory } = useCategories();
  const toast = useToast();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [editing, setEditing] = useState<UserCategory | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState(PALETTE[0]);
  const [showEditor, setShowEditor] = useState(false);
  const [draftKeywords, setDraftKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserCategory | null>(null);

  const openNew = () => { setEditing(null); setDraftName(''); setDraftColor(PALETTE[0]); setDraftKeywords([]); setKeywordInput(''); setNameError(null); setShowEditor(true); };
  const openEdit = (c: UserCategory) => { setEditing(c); setDraftName(c.name); setDraftColor(c.color); setDraftKeywords(c.keywords ?? []); setKeywordInput(''); setNameError(null); setShowEditor(true); };

  const save = async () => {
    const name = draftName.trim();
    if (!name) { setNameError('Enter a category name'); return; }
    try {
      if (editing) await updateCategory(editing.id, { name, color: draftColor, keywords: draftKeywords });
      else await createCategory({ name, color: draftColor, keywords: draftKeywords });
      setEditing(null);
      setShowEditor(false);
    } catch {
      toast.show({ message: "Couldn't save category", description: 'Please try again.', tone: 'error' });
    }
  };

  const performDelete = () => {
    if (!confirmDelete) return;
    deleteCategory(confirmDelete.id).catch(() =>
      toast.show({ message: "Couldn't delete", description: 'Please try again.', tone: 'error' })
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Categories</Text>
        <TouchableOpacity
          onPress={openNew}
          accessibilityRole="button"
          accessibilityLabel="Add category"
        >
          <Ionicons name="add" size={28} color={colors.text} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.accent} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(c) => c.id}
          ListEmptyComponent={<Text style={styles.empty}>No categories yet. Tap + to add one.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.rowContent}
                onPress={() => openEdit(item)}
                accessibilityRole="button"
                accessibilityLabel={`Edit category ${item.name}`}
              >
                <View style={[styles.swatch, { backgroundColor: item.color }]} />
                <Text style={styles.rowName}>{item.name}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  try {
                    const { filed } = await applyCategory(item.id);
                    toast.show({
                      message: `Filed ${filed} note${filed === 1 ? '' : 's'} into "${item.name}"`,
                      tone: 'success',
                    });
                  } catch {
                    toast.show({ message: "Couldn't apply rules", description: 'Please try again.', tone: 'error' });
                  }
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ marginRight: 16 }}
                accessibilityRole="button"
                accessibilityLabel="Apply category rules"
              >
                <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setConfirmDelete(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Delete category"
              >
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {showEditor && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.editorWrapper}
        >
          <View style={styles.editor}>
            <TextInput
              style={[styles.input, nameError ? styles.inputError : null]}
              placeholder="Category name"
              placeholderTextColor={colors.textFaint}
              value={draftName}
              onChangeText={(t) => { setDraftName(t); if (nameError) setNameError(null); }}
              autoFocus
            />
            {nameError ? (
              <View style={styles.fieldErrorRow} accessibilityRole="alert">
                <Ionicons name="alert-circle" size={14} color={colors.error} />
                <Text style={styles.fieldErrorText}>{nameError}</Text>
              </View>
            ) : null}
            <View style={styles.paletteRow}>
              {PALETTE.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setDraftColor(c)}
                  accessibilityRole="button"
                  accessibilityLabel={PALETTE_NAMES[c] ?? 'Color option'}
                  accessibilityState={{ selected: draftColor === c }}
                >
                  <View style={[styles.swatch, { backgroundColor: c, borderWidth: draftColor === c ? 3 : 0, borderColor: colors.text }]} />
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.keywordsBlock}>
              <Text style={styles.keywordsLabel}>Auto-file notes containing:</Text>
              <View style={styles.keywordChips}>
                {draftKeywords.map((kw) => (
                  <TouchableOpacity key={kw} style={styles.keywordChip} onPress={() => setDraftKeywords((p) => p.filter((k) => k !== kw))}>
                    <Text style={styles.keywordChipText}>{kw}</Text>
                    <Ionicons name="close" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.input}
                placeholder="Add keyword, then return"
                placeholderTextColor={colors.textFaint}
                value={keywordInput}
                onChangeText={setKeywordInput}
                onSubmitEditing={() => {
                  const kw = keywordInput.trim().toLowerCase();
                  if (kw && !draftKeywords.includes(kw)) setDraftKeywords((p) => [...p, kw]);
                  setKeywordInput('');
                }}
                returnKeyType="done"
              />
            </View>
            <View style={styles.editorActions}>
              <TouchableOpacity onPress={() => { setEditing(null); setShowEditor(false); }}><Text style={styles.cancel}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={save}><Text style={styles.saveBtn}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      <ConfirmSheet
        visible={confirmDelete != null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={performDelete}
        title={confirmDelete ? `Delete "${confirmDelete.name}"?` : 'Delete category?'}
        message="Notes in this category are kept — they just become uncategorized."
        confirmLabel="Delete"
        destructive
      />
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
    title: { fontSize: 18, fontFamily: Fonts.bold, color: c.text },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    rowContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    swatch: { width: 22, height: 22, borderRadius: 11, marginRight: 12 },
    rowName: { flex: 1, fontSize: 16, fontFamily: Fonts.regular, color: c.text },
    empty: { textAlign: 'center', fontFamily: Fonts.regular, color: c.textMuted, marginTop: 40 },
    errorText: { textAlign: 'center', fontFamily: Fonts.regular, color: c.error, marginTop: 40, paddingHorizontal: Spacing.lg },
    editorWrapper: { position: 'absolute', left: 0, right: 0, bottom: 0 },
    editor: { backgroundColor: c.bgSurface, padding: Spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, ...Elevation.level2 },
    input: { backgroundColor: c.bgSurface, borderWidth: 1, borderColor: c.borderStrong, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: 16, fontFamily: Fonts.regular, color: c.text },
    inputError: { borderColor: c.error },
    fieldErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    fieldErrorText: { fontSize: 13, fontFamily: Fonts.medium, color: c.error },
    paletteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
    editorActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, marginTop: 16 },
    cancel: { color: c.textMuted, fontSize: 16, fontFamily: Fonts.regular },
    saveBtn: { color: c.accent, fontSize: 16, fontFamily: Fonts.bold },
    keywordsBlock: { marginTop: 14 },
    keywordsLabel: { fontSize: 13, fontFamily: Fonts.regular, color: c.textMuted, marginBottom: 8 },
    keywordChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    keywordChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.bgMuted, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
    keywordChipText: { fontSize: 13, fontFamily: Fonts.regular, color: c.textSecondary },
  });
