// mobile/src/screens/CategoriesScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useCategories } from '../hooks/useCategories';
import { UserCategory } from '../types';

const PALETTE = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#06b6d4', '#ec4899', '#ef4444', '#6b7280'];

type Nav = NativeStackNavigationProp<RootStackParamList, 'Categories'>;

export default function CategoriesScreen({ navigation }: { navigation: Nav }) {
  const { categories, isLoading, error, createCategory, updateCategory, deleteCategory, applyCategory } = useCategories();
  const [editing, setEditing] = useState<UserCategory | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState(PALETTE[0]);
  const [showEditor, setShowEditor] = useState(false);
  const [draftKeywords, setDraftKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');

  const openNew = () => { setEditing(null); setDraftName(''); setDraftColor(PALETTE[0]); setDraftKeywords([]); setKeywordInput(''); setShowEditor(true); };
  const openEdit = (c: UserCategory) => { setEditing(c); setDraftName(c.name); setDraftColor(c.color); setDraftKeywords(c.keywords ?? []); setKeywordInput(''); setShowEditor(true); };

  const save = async () => {
    const name = draftName.trim();
    if (!name) { Alert.alert('Name required'); return; }
    try {
      if (editing) await updateCategory(editing.id, { name, color: draftColor, keywords: draftKeywords });
      else await createCategory({ name, color: draftColor, keywords: draftKeywords });
      setEditing(null);
      setShowEditor(false);
    } catch {
      Alert.alert('Couldn\'t save category', 'Please try again.');
    }
  };

  const confirmDelete = (c: UserCategory) => {
    Alert.alert(
      `Delete "${c.name}"?`,
      'Notes in this category are kept — they just become uncategorized.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteCategory(c.id).catch(() => Alert.alert('Couldn\'t delete', 'Please try again.')) },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>Categories</Text>
        <TouchableOpacity onPress={openNew}>
          <Ionicons name="add" size={28} color="#111827" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(c) => c.id}
          ListEmptyComponent={<Text style={styles.empty}>No categories yet. Tap + to add one.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <TouchableOpacity style={styles.rowContent} onPress={() => openEdit(item)}>
                <View style={[styles.swatch, { backgroundColor: item.color }]} />
                <Text style={styles.rowName}>{item.name}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  try {
                    const { filed } = await applyCategory(item.id);
                    Alert.alert('Done', `Filed ${filed} note${filed === 1 ? '' : 's'} into "${item.name}".`);
                  } catch {
                    Alert.alert('Couldn\'t apply rules', 'Please try again.');
                  }
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ marginRight: 16 }}
              >
                <Ionicons name="sparkles-outline" size={18} color="#3b82f6" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
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
              style={styles.input}
              placeholder="Category name"
              value={draftName}
              onChangeText={setDraftName}
              autoFocus
            />
            <View style={styles.paletteRow}>
              {PALETTE.map((c) => (
                <TouchableOpacity key={c} onPress={() => setDraftColor(c)}>
                  <View style={[styles.swatch, { backgroundColor: c, borderWidth: draftColor === c ? 3 : 0, borderColor: '#111827' }]} />
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.keywordsBlock}>
              <Text style={styles.keywordsLabel}>Auto-file notes containing:</Text>
              <View style={styles.keywordChips}>
                {draftKeywords.map((kw) => (
                  <TouchableOpacity key={kw} style={styles.keywordChip} onPress={() => setDraftKeywords((p) => p.filter((k) => k !== kw))}>
                    <Text style={styles.keywordChipText}>{kw}</Text>
                    <Ionicons name="close" size={14} color="#374151" />
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.input}
                placeholder="Add keyword, then return"
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  rowContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  swatch: { width: 22, height: 22, borderRadius: 11, marginRight: 12 },
  rowName: { flex: 1, fontSize: 16, color: '#111827' },
  empty: { textAlign: 'center', color: '#6b7280', marginTop: 40 },
  errorText: { textAlign: 'center', color: '#ef4444', marginTop: 40, paddingHorizontal: 16 },
  editorWrapper: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  editor: { backgroundColor: '#fff', padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  paletteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  editorActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, marginTop: 16 },
  cancel: { color: '#6b7280', fontSize: 16 },
  saveBtn: { color: '#3b82f6', fontSize: 16, fontWeight: '700' },
  keywordsBlock: { marginTop: 14 },
  keywordsLabel: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  keywordChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  keywordChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  keywordChipText: { fontSize: 13, color: '#374151' },
});
