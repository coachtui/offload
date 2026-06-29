# Notes: Custom Categories & Deletion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users delete notes (single + bulk) and organize them into their own custom categories (one per note) filled by manual assignment plus optional keyword rules, with manual choice always winning over rules.

**Architecture:** Custom categories are a new additive layer. A new `hub.user_categories` table holds each user's categories and their keyword lists; `hub.atomic_objects` gains `category_id` (FK, `ON DELETE SET NULL`) and `category_locked` (true = user assigned, rules won't touch it). The AI's existing `domain`/`objectType` auto-tagging is untouched. Keyword rules are plain case-insensitive substring matching applied in the API layer at note-creation time and on demand ("apply to existing"). The mobile `ObjectsScreen` gains a multi-select mode, a per-note trash action, category filter chips, and a category picker; a new `CategoriesScreen` manages categories and keywords.

**Tech Stack:** Backend — Node/Express + TypeScript, PostgreSQL (`node-pg-migrate`, schema `hub`), Jest (mocking `../db/queries`). Mobile — React Native (Expo), TypeScript, React Navigation native-stack, `@expo/vector-icons` Ionicons.

## Global Constraints

- All DB objects live in the `hub` schema. UUID PKs default to `pgm.func('uuid_generate_v4()')`.
- All `atomic_objects` reads MUST keep `AND deleted_at IS NULL`.
- Backend service tests mock `../../db/queries` (`query`, `queryOne`, `queryMany`) via `jest.mock`; never hit a real DB.
- Run backend tests from `backend/api/` with `npm test`. Run a single file with `npm test -- <path>`.
- All `/api/v1/objects` and `/api/v1/categories` routes require auth (`router.use(authenticate)`); every handler guards `if (!req.user)` → 401, and ownership errors map to 404 (`Object not found` / `Category not found`) and 403 (`Unauthorized`), matching `routes/objects.ts`.
- Mobile has no automated tests; mobile tasks are verified by `npx tsc --noEmit` (from `mobile/`) and manual on-device testing.
- One category per note. Manual assignment sets `category_locked = true`; rule assignment sets `category_locked = false` and must never overwrite a locked note.

---

# Phase 1 — Delete features

Shippable on its own: per-note trash icon + multi-select bulk delete. The bulk endpoint starts delete-only here and gains a `move` action in Phase 2.

### Task 1: Bulk-delete service function

**Files:**
- Modify: `backend/api/src/services/objectService.ts` (add `bulkDeleteObjects`)
- Test: `backend/api/src/__tests__/services/objectBulk.test.ts` (create)

**Interfaces:**
- Produces: `bulkDeleteObjects(userId: string, ids: string[]): Promise<{ deleted: number }>` — soft-deletes only the caller's own, non-deleted objects; returns how many rows were affected. Ignores ids the user doesn't own.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/api/src/__tests__/services/objectBulk.test.ts
import { bulkDeleteObjects } from '../../services/objectService';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQueries = queries as jest.Mocked<typeof queries>;

describe('bulkDeleteObjects', () => {
  beforeEach(() => jest.clearAllMocks());

  it('soft-deletes only the user\'s own non-deleted objects and returns the count', async () => {
    mockQueries.query.mockResolvedValueOnce({ rowCount: 2, rows: [] } as any);

    const result = await bulkDeleteObjects('u1', ['a', 'b', 'c']);

    expect(result).toEqual({ deleted: 2 });
    const [sql, params] = mockQueries.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE hub\.atomic_objects/i);
    expect(sql).toMatch(/SET deleted_at = NOW\(\)/i);
    expect(sql).toMatch(/user_id = \$1/);
    expect(sql).toMatch(/id = ANY\(\$2\)/);
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(params).toEqual(['u1', ['a', 'b', 'c']]);
  });

  it('returns deleted: 0 for an empty id list without querying', async () => {
    const result = await bulkDeleteObjects('u1', []);
    expect(result).toEqual({ deleted: 0 });
    expect(mockQueries.query).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/services/objectBulk.test.ts`
Expected: FAIL — `bulkDeleteObjects is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to the top imports of `objectService.ts` (only if not already importing `query`):

```typescript
import { query } from '../db/queries';
```

Append to `backend/api/src/services/objectService.ts`:

```typescript
/**
 * Bulk soft-delete: only affects the user's own, non-deleted objects.
 */
export async function bulkDeleteObjects(
  userId: string,
  ids: string[]
): Promise<{ deleted: number }> {
  if (!ids || ids.length === 0) return { deleted: 0 };
  const result = await query(
    `UPDATE hub.atomic_objects
     SET deleted_at = NOW()
     WHERE user_id = $1 AND id = ANY($2) AND deleted_at IS NULL`,
    [userId, ids]
  );
  return { deleted: result.rowCount ?? 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/services/objectBulk.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add backend/api/src/services/objectService.ts backend/api/src/__tests__/services/objectBulk.test.ts
git commit -m "feat(objects): bulk soft-delete service function"
```

---

### Task 2: Bulk endpoint route

**Files:**
- Modify: `backend/api/src/routes/objects.ts` (add `POST /bulk`)
- Test: `backend/api/src/__tests__/routes/objectsBulk.test.ts` (create)

**Interfaces:**
- Consumes: `bulkDeleteObjects` from Task 1.
- Produces: `POST /api/v1/objects/bulk` body `{ ids: string[], action: 'delete' }` → `200 { deleted: number }`. (Action `'move'` is added in Phase 2.) Unknown action → `400 VALIDATION_ERROR`.

> **Routing note:** Express matches in order. `POST /bulk` MUST be registered before any `POST /:id/...` handlers so `bulk` is not captured as an `:id`. There is currently no `POST /:id` (only `/:id/state`, `/:id/review`), but place `/bulk` immediately after the existing `POST /` handler to be safe.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/api/src/__tests__/routes/objectsBulk.test.ts
import express from 'express';
import request from 'supertest';

jest.mock('../../auth/middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'u1' };
    next();
  },
}));
jest.mock('../../services/objectService');

import * as objectService from '../../services/objectService';
import objectRoutes from '../../routes/objects';

const app = express();
app.use(express.json());
app.use('/api/v1/objects', objectRoutes);

describe('POST /api/v1/objects/bulk', () => {
  beforeEach(() => jest.clearAllMocks());

  it('delete action returns the deleted count', async () => {
    (objectService.bulkDeleteObjects as jest.Mock).mockResolvedValue({ deleted: 3 });

    const res = await request(app)
      .post('/api/v1/objects/bulk')
      .send({ ids: ['a', 'b', 'c'], action: 'delete' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 3 });
    expect(objectService.bulkDeleteObjects).toHaveBeenCalledWith('u1', ['a', 'b', 'c']);
  });

  it('rejects an unknown action with 400', async () => {
    const res = await request(app)
      .post('/api/v1/objects/bulk')
      .send({ ids: ['a'], action: 'frobnicate' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/routes/objectsBulk.test.ts`
Expected: FAIL — 404 (route not found).

- [ ] **Step 3: Write minimal implementation**

In `backend/api/src/routes/objects.ts`, add `bulkDeleteObjects` to the import from `../services/objectService`:

```typescript
import {
  createObject,
  getObjectById,
  listObjects,
  listStaleActionables,
  updateObject,
  deleteObject,
  findSimilarObjects,
  bulkDeleteObjects,
} from '../services/objectService';
```

Insert this handler immediately after the `POST /` handler (before `PUT /:id`):

```typescript
/**
 * POST /api/v1/objects/bulk
 * Bulk operations on multiple objects.
 * Body: { ids: string[], action: 'delete' }
 */
router.post('/bulk', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    }

    const { ids, action } = req.body as { ids?: string[]; action?: string };

    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'ids must be an array' });
    }

    if (action === 'delete') {
      const result = await bulkDeleteObjects(req.user.id, ids);
      return res.json(result);
    }

    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: `Unsupported action: ${action}`,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Bulk operation failed',
    });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/routes/objectsBulk.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add backend/api/src/routes/objects.ts backend/api/src/__tests__/routes/objectsBulk.test.ts
git commit -m "feat(objects): POST /objects/bulk endpoint (delete action)"
```

---

### Task 3: Mobile API client + hook delete methods

**Files:**
- Modify: `mobile/src/services/api.ts` (add `bulkDeleteObjects`; `deleteObject` already exists)
- Modify: `mobile/src/hooks/useObjects.ts` (add `deleteObject`, `bulkDeleteObjects` to hook)

**Interfaces:**
- Produces (api): `apiService.bulkDeleteObjects(ids: string[]): Promise<{ deleted: number }>`
- Produces (hook): `deleteObject(objectId: string): Promise<boolean>` and `bulkDeleteObjects(ids: string[]): Promise<boolean>` — both update local state on success (remove from `objects`, clear detail if it matched).

- [ ] **Step 1: Add the API client method**

In `mobile/src/services/api.ts`, immediately after the existing `deleteObject` method, add:

```typescript
  async bulkDeleteObjects(ids: string[]): Promise<{ deleted: number }> {
    return this.request<{ deleted: number }>(`/api/v1/objects/bulk`, {
      method: 'POST',
      body: JSON.stringify({ ids, action: 'delete' }),
    });
  }
```

- [ ] **Step 2: Extend the hook return type**

In `mobile/src/hooks/useObjects.ts`, add to `interface UseObjectsReturn` (after `updateObject`):

```typescript
  deleteObject: (objectId: string) => Promise<boolean>;
  bulkDeleteObjects: (ids: string[]) => Promise<boolean>;
```

- [ ] **Step 3: Implement the hook methods**

In `useObjects.ts`, add these `useCallback`s after the existing `updateObject` callback (before `clearDetail`):

```typescript
  const deleteObject = useCallback(async (objectId: string): Promise<boolean> => {
    try {
      await apiService.deleteObject(objectId);
      setState((prev) => ({
        ...prev,
        objects: prev.objects.filter((obj) => obj.id !== objectId),
        total: Math.max(0, prev.total - 1),
      }));
      setDetailState((prev) =>
        prev.object?.id === objectId
          ? { object: null, isLoadingDetail: false, isUpdating: false, updateError: null }
          : prev
      );
      return true;
    } catch (error) {
      return false;
    }
  }, []);

  const bulkDeleteObjects = useCallback(async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0) return true;
    try {
      await apiService.bulkDeleteObjects(ids);
      const idSet = new Set(ids);
      setState((prev) => ({
        ...prev,
        objects: prev.objects.filter((obj) => !idSet.has(obj.id)),
        total: Math.max(0, prev.total - ids.length),
      }));
      return true;
    } catch (error) {
      return false;
    }
  }, []);
```

- [ ] **Step 4: Export them from the hook**

In the `return { ... }` at the bottom of `useObjects`, add `deleteObject,` and `bulkDeleteObjects,` after `updateObject,`.

- [ ] **Step 5: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no new errors referencing `api.ts` or `useObjects.ts`.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/services/api.ts mobile/src/hooks/useObjects.ts
git commit -m "feat(mobile): deleteObject + bulkDeleteObjects in api client and useObjects"
```

---

### Task 4: Trash icon in note detail modal

**Files:**
- Modify: `mobile/src/screens/ObjectsScreen.tsx` (detail modal quick-actions row + handler; consume `deleteObject` from the hook)

**Interfaces:**
- Consumes: `deleteObject` from `useObjects` (Task 3).

- [ ] **Step 1: Destructure `deleteObject` from the hook**

Find where `ObjectsScreen` calls `useObjects()` and destructures its values. Add `deleteObject` to that destructuring list.

- [ ] **Step 2: Add a delete handler**

Add this handler inside the component (near the other action handlers such as the "Mark Done"/edit handlers):

```typescript
  const handleDeleteNote = useCallback(
    (objectId: string) => {
      Alert.alert(
        'Delete note?',
        'This note will be removed. You can\'t undo this from the app.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              const ok = await deleteObject(objectId);
              if (ok) {
                clearDetail();
              } else {
                Alert.alert('Couldn\'t delete', 'Please try again.');
              }
            },
          },
        ]
      );
    },
    [deleteObject, clearDetail]
  );
```

(`clearDetail` is already destructured from the hook in this screen; if not, add it.)

- [ ] **Step 3: Add the trash button to the detail quick-actions row**

In the detail modal's quick-actions row (the row containing "Mark Done", "Remind Me", "Pin", "Edit"), add a trash action. Use the screen's existing quick-action button styling. Example button:

```tsx
<TouchableOpacity
  style={styles.quickActionButton}
  onPress={() => detailObject && handleDeleteNote(detailObject.id)}
>
  <Ionicons name="trash-outline" size={22} color="#ef4444" />
  <Text style={[styles.quickActionLabel, { color: '#ef4444' }]}>Delete</Text>
</TouchableOpacity>
```

Replace `detailObject` with whatever the modal uses for the currently-open object (e.g. `object` from `detailState`), and `styles.quickActionButton` / `styles.quickActionLabel` with the existing style names used by the sibling action buttons in that row.

- [ ] **Step 4: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no new errors in `ObjectsScreen.tsx`.

- [ ] **Step 5: Manual verification**

Open the app → Objects → tap a note → tap Delete → confirm. The modal closes and the note disappears from the list. Pull-to-refresh; it stays gone.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/screens/ObjectsScreen.tsx
git commit -m "feat(mobile): delete action in note detail modal"
```

---

### Task 5: Multi-select mode + bulk delete on the list

**Files:**
- Modify: `mobile/src/screens/ObjectsScreen.tsx` (selection state, header "Select" toggle, card checkboxes, bottom action bar; consume `bulkDeleteObjects`)

**Interfaces:**
- Consumes: `bulkDeleteObjects` from `useObjects` (Task 3).

- [ ] **Step 1: Destructure `bulkDeleteObjects` from the hook**

Add `bulkDeleteObjects` to the `useObjects()` destructuring in `ObjectsScreen`.

- [ ] **Step 2: Add selection state**

Near the other `useState` declarations in the component:

```typescript
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);
```

- [ ] **Step 3: Add the bulk-delete handler**

```typescript
  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    Alert.alert(
      `Delete ${ids.length} note${ids.length === 1 ? '' : 's'}?`,
      'This can\'t be undone from the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const ok = await bulkDeleteObjects(ids);
            if (ok) exitSelection();
            else Alert.alert('Couldn\'t delete', 'Please try again.');
          },
        },
      ]
    );
  }, [selectedIds, bulkDeleteObjects, exitSelection]);
```

- [ ] **Step 4: Add a "Select" / "Cancel" toggle to the header**

In the screen header actions, add a button that toggles selection mode. When `selectionMode` is false it shows "Select"; when true it shows "Cancel" and calls `exitSelection`. Use the existing header-action styling on this screen:

```tsx
<TouchableOpacity
  onPress={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
>
  <Text style={styles.headerActionText}>{selectionMode ? 'Cancel' : 'Select'}</Text>
</TouchableOpacity>
```

- [ ] **Step 5: Wire card press + checkbox into selection mode**

In `renderNoteCard`, when `selectionMode` is true: (a) tapping the card calls `toggleSelected(item.id)` instead of opening the detail modal; (b) render a checkbox leading the card. Wrap the existing `onPress` so it branches on `selectionMode`:

```tsx
onPress={() => (selectionMode ? toggleSelected(item.id) : openDetail(item.id))}
```

(Use the screen's actual detail-open call in place of `openDetail(item.id)`.) Add the checkbox inside the card, before the title:

```tsx
{selectionMode && (
  <Ionicons
    name={selectedIds.has(item.id) ? 'checkmark-circle' : 'ellipse-outline'}
    size={22}
    color={selectedIds.has(item.id) ? Colors.primary : '#9ca3af'}
    style={{ marginRight: Spacing.sm }}
  />
)}
```

(Use the screen's actual primary color token if `Colors.primary` isn't the right name.)

- [ ] **Step 6: Add the bottom action bar**

Render this above the list's container close, shown only in selection mode:

```tsx
{selectionMode && (
  <View style={styles.selectionBar}>
    <Text style={styles.selectionCount}>{selectedIds.size} selected</Text>
    <TouchableOpacity
      style={styles.selectionDeleteBtn}
      disabled={selectedIds.size === 0}
      onPress={handleBulkDelete}
    >
      <Ionicons name="trash-outline" size={20} color="#fff" />
      <Text style={styles.selectionDeleteText}>Delete</Text>
    </TouchableOpacity>
  </View>
)}
```

Add styles to the screen's `StyleSheet.create({...})`:

```typescript
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  selectionCount: { fontSize: 15, color: '#374151', fontWeight: '600' },
  selectionDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    gap: 6,
  },
  selectionDeleteText: { color: '#fff', fontWeight: '600' },
```

(Adjust `Spacing`/`Radius` tokens to the ones already imported in this file.)

- [ ] **Step 7: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Manual verification**

Objects → tap "Select" → tap several notes (checkmarks appear, count updates) → tap Delete → confirm. Selected notes vanish; selection mode exits. "Cancel" leaves selection mode without deleting.

- [ ] **Step 9: Commit**

```bash
git add mobile/src/screens/ObjectsScreen.tsx
git commit -m "feat(mobile): multi-select mode with bulk delete on notes list"
```

**Phase 1 complete — shippable.**

---

# Phase 2 — Categories + manual assignment

### Task 6: Migration — user_categories table + atomic_objects columns

**Files:**
- Create: `backend/api/migrations/005_user_categories.ts`

- [ ] **Step 1: Write the migration**

```typescript
// backend/api/migrations/005_user_categories.ts
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    { schema: 'hub', name: 'user_categories' },
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('uuid_generate_v4()'),
      },
      user_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'hub', name: 'users', column: 'id' },
        onDelete: 'CASCADE',
      },
      name: { type: 'text', notNull: true },
      color: { type: 'text', notNull: true, default: '#6b7280' },
      icon: { type: 'text', notNull: false, default: null },
      keywords: { type: 'text[]', notNull: true, default: '{}' },
      sort_order: { type: 'integer', notNull: true, default: 0 },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    }
  );

  pgm.createIndex({ schema: 'hub', name: 'user_categories' }, 'user_id');

  pgm.addColumns(
    { schema: 'hub', name: 'atomic_objects' },
    {
      category_id: {
        type: 'uuid',
        notNull: false,
        default: null,
        references: { schema: 'hub', name: 'user_categories', column: 'id' },
        onDelete: 'SET NULL',
      },
      category_locked: { type: 'boolean', notNull: true, default: false },
    }
  );

  pgm.createIndex({ schema: 'hub', name: 'atomic_objects' }, 'category_id', {
    where: 'category_id IS NOT NULL',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns({ schema: 'hub', name: 'atomic_objects' }, ['category_id', 'category_locked']);
  pgm.dropTable({ schema: 'hub', name: 'user_categories' });
}
```

- [ ] **Step 2: Run the migration**

Run (from `backend/api/`): `npm run migrate`
Expected: migration `005_user_categories` applied. Verify with `npm run migrate:status`.

- [ ] **Step 3: Commit**

```bash
git add backend/api/migrations/005_user_categories.ts
git commit -m "feat(db): user_categories table + atomic_objects category columns"
```

---

### Task 7: AtomicObject model — category fields + filter + assignment

**Files:**
- Modify: `backend/api/src/models/AtomicObject.ts`
- Test: `backend/api/src/__tests__/models/atomicObjectCategory.test.ts` (create)

**Interfaces:**
- Produces:
  - Row gains `category_id: string | null`, `category_locked: boolean`; class gains `categoryId: string | null`, `categoryLocked: boolean`; both surfaced in `toAtomicObject()`.
  - `findByUserId` options gains `categoryId?: string` filter.
  - `static assignCategoryByRule(objectId: string, categoryId: string): Promise<void>` — sets `category_id`, leaves `category_locked = false`, only when the row is currently unlocked.
  - `update()` accepts `categoryId?: string | null` and `categoryLocked?: boolean`.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/api/src/__tests__/models/atomicObjectCategory.test.ts
import { AtomicObjectModel } from '../../models/AtomicObject';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
jest.mock('../../services/vectorService', () => ({ deleteFromVector: jest.fn() }));
const mockQueries = queries as jest.Mocked<typeof queries>;

describe('AtomicObjectModel category assignment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('assignCategoryByRule only updates unlocked rows', async () => {
    mockQueries.query.mockResolvedValueOnce({ rowCount: 1, rows: [] } as any);

    await AtomicObjectModel.assignCategoryByRule('obj1', 'cat1');

    const [sql, params] = mockQueries.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE hub\.atomic_objects/i);
    expect(sql).toMatch(/SET category_id = \$1/);
    expect(sql).toMatch(/category_locked = false/i);
    expect(params).toEqual(['cat1', 'obj1']);
  });

  it('findByUserId adds a category_id filter when categoryId is given', async () => {
    mockQueries.query.mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);
    mockQueries.queryMany.mockResolvedValueOnce([] as any);

    await AtomicObjectModel.findByUserId('u1', { categoryId: 'cat1' });

    const countCall = mockQueries.query.mock.calls[0];
    expect(countCall[0]).toMatch(/category_id = \$2/);
    expect(countCall[1]).toEqual(['u1', 'cat1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/models/atomicObjectCategory.test.ts`
Expected: FAIL — `assignCategoryByRule is not a function`.

- [ ] **Step 3: Implement model changes**

In `AtomicObjectRow` (after `deleted_at`):

```typescript
  category_id: string | null;
  category_locked: boolean;
```

In the class field declarations (after `evolvedFromId`):

```typescript
  categoryId: string | null;
  categoryLocked: boolean;
```

In the constructor (after `this.evolvedFromId = ...`):

```typescript
    this.categoryId = row.category_id ?? null;
    this.categoryLocked = row.category_locked ?? false;
```

In `toAtomicObject()` return (after `evolvedFromId`):

```typescript
      categoryId: this.categoryId,
      categoryLocked: this.categoryLocked,
```

In `findByUserId` options type, add `categoryId?: string;`. After the `objectType` filter block, add:

```typescript
    if (options?.categoryId) {
      queryText += ` AND category_id = $${paramIndex++}`;
      params.push(options.categoryId);
    }
```

In `update()`'s `updates` type, add `categoryId?: string | null;` and `categoryLocked?: boolean;`. After the `confidence` block, add:

```typescript
    if (updates.categoryId !== undefined) {
      updatesList.push(`category_id = $${paramIndex++}`);
      values.push(updates.categoryId);
    }

    if (updates.categoryLocked !== undefined) {
      updatesList.push(`category_locked = $${paramIndex++}`);
      values.push(updates.categoryLocked);
    }
```

Add a static method (near `updateEmbeddingStatus`):

```typescript
  /**
   * Assign a category via a keyword rule. No-op on rows the user has manually
   * locked, so manual choices always win.
   */
  static async assignCategoryByRule(objectId: string, categoryId: string): Promise<void> {
    await query(
      `UPDATE hub.atomic_objects
       SET category_id = $1
       WHERE id = $2 AND category_locked = false AND deleted_at IS NULL`,
      [categoryId, objectId]
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/models/atomicObjectCategory.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the shared + mobile AtomicObject types**

In `shared/types/index.ts`, add to the `AtomicObject` interface (near `evolvedFromId`):

```typescript
  categoryId?: string | null;
  categoryLocked?: boolean;
```

In `mobile/src/types/index.ts`, add the same two fields to the `AtomicObject` interface.

- [ ] **Step 6: Commit**

```bash
git add backend/api/src/models/AtomicObject.ts backend/api/src/__tests__/models/atomicObjectCategory.test.ts shared/types/index.ts mobile/src/types/index.ts
git commit -m "feat(objects): category_id/category_locked on AtomicObject model + types"
```

---

### Task 8: UserCategory model

**Files:**
- Create: `backend/api/src/models/UserCategory.ts`
- Test: `backend/api/src/__tests__/models/userCategory.test.ts` (create)

**Interfaces:**
- Produces a `UserCategoryModel` with row type `UserCategoryRow`, a `toUserCategory()` serializer returning `{ id, userId, name, color, icon, keywords, sortOrder, createdAt, updatedAt }`, and statics:
  - `findByUserId(userId): Promise<UserCategoryModel[]>` (ordered by `sort_order`, then `created_at`)
  - `findById(id): Promise<UserCategoryModel | null>`
  - `create(userId, { name, color?, icon?, keywords?, sortOrder? }): Promise<UserCategoryModel>`
  - `update(id, updates): Promise<UserCategoryModel>`
  - `delete(id): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/api/src/__tests__/models/userCategory.test.ts
import { UserCategoryModel } from '../../models/UserCategory';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQueries = queries as jest.Mocked<typeof queries>;

const row = {
  id: 'c1', user_id: 'u1', name: 'Side hustle', color: '#3b82f6',
  icon: null, keywords: ['etsy', 'shop'], sort_order: 0,
  created_at: new Date('2026-06-28'), updated_at: new Date('2026-06-28'),
};

describe('UserCategoryModel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('findByUserId returns the user\'s categories ordered by sort_order', async () => {
    mockQueries.queryMany.mockResolvedValueOnce([row] as any);
    const result = await UserCategoryModel.findByUserId('u1');
    const [sql, params] = mockQueries.queryMany.mock.calls[0];
    expect(sql).toMatch(/FROM hub\.user_categories/i);
    expect(sql).toMatch(/WHERE user_id = \$1/);
    expect(sql).toMatch(/ORDER BY sort_order/i);
    expect(params).toEqual(['u1']);
    expect(result[0].toUserCategory()).toMatchObject({
      id: 'c1', userId: 'u1', name: 'Side hustle', keywords: ['etsy', 'shop'], sortOrder: 0,
    });
  });

  it('create inserts and returns the new category', async () => {
    mockQueries.queryOne.mockResolvedValueOnce(row as any);
    const result = await UserCategoryModel.create('u1', { name: 'Side hustle', keywords: ['etsy', 'shop'] });
    const [sql, params] = mockQueries.queryOne.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO hub\.user_categories/i);
    expect(params[0]).toBe('u1');
    expect(params[1]).toBe('Side hustle');
    expect(result.toUserCategory().name).toBe('Side hustle');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/models/userCategory.test.ts`
Expected: FAIL — cannot find module `../../models/UserCategory`.

- [ ] **Step 3: Implement the model**

```typescript
// backend/api/src/models/UserCategory.ts
import { query, queryOne, queryMany } from '../db/queries';

export interface UserCategoryRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string | null;
  keywords: string[];
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface UserCategory {
  id: string;
  userId: string;
  name: string;
  color: string;
  icon: string | null;
  keywords: string[];
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export class UserCategoryModel {
  constructor(private row: UserCategoryRow) {}

  get id() { return this.row.id; }
  get userId() { return this.row.user_id; }
  get keywords() { return this.row.keywords ?? []; }

  toUserCategory(): UserCategory {
    return {
      id: this.row.id,
      userId: this.row.user_id,
      name: this.row.name,
      color: this.row.color,
      icon: this.row.icon ?? null,
      keywords: this.row.keywords ?? [],
      sortOrder: this.row.sort_order,
      createdAt: this.row.created_at,
      updatedAt: this.row.updated_at,
    };
  }

  static async findByUserId(userId: string): Promise<UserCategoryModel[]> {
    const rows = await queryMany<UserCategoryRow>(
      `SELECT * FROM hub.user_categories
       WHERE user_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [userId]
    );
    return rows.map((r) => new UserCategoryModel(r));
  }

  static async findById(id: string): Promise<UserCategoryModel | null> {
    const row = await queryOne<UserCategoryRow>(
      `SELECT * FROM hub.user_categories WHERE id = $1`,
      [id]
    );
    return row ? new UserCategoryModel(row) : null;
  }

  static async create(
    userId: string,
    input: { name: string; color?: string; icon?: string | null; keywords?: string[]; sortOrder?: number }
  ): Promise<UserCategoryModel> {
    const row = await queryOne<UserCategoryRow>(
      `INSERT INTO hub.user_categories (user_id, name, color, icon, keywords, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        userId,
        input.name,
        input.color ?? '#6b7280',
        input.icon ?? null,
        input.keywords ?? [],
        input.sortOrder ?? 0,
      ]
    );
    if (!row) throw new Error('Failed to create category');
    return new UserCategoryModel(row);
  }

  static async update(
    id: string,
    updates: Partial<{ name: string; color: string; icon: string | null; keywords: string[]; sortOrder: number }>
  ): Promise<UserCategoryModel> {
    const sets: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (updates.name !== undefined) { sets.push(`name = $${i++}`); values.push(updates.name); }
    if (updates.color !== undefined) { sets.push(`color = $${i++}`); values.push(updates.color); }
    if (updates.icon !== undefined) { sets.push(`icon = $${i++}`); values.push(updates.icon); }
    if (updates.keywords !== undefined) { sets.push(`keywords = $${i++}`); values.push(updates.keywords); }
    if (updates.sortOrder !== undefined) { sets.push(`sort_order = $${i++}`); values.push(updates.sortOrder); }
    sets.push(`updated_at = NOW()`);
    values.push(id);
    const row = await queryOne<UserCategoryRow>(
      `UPDATE hub.user_categories SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!row) throw new Error('Failed to update category');
    return new UserCategoryModel(row);
  }

  static async delete(id: string): Promise<void> {
    await query(`DELETE FROM hub.user_categories WHERE id = $1`, [id]);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/models/userCategory.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/api/src/models/UserCategory.ts backend/api/src/__tests__/models/userCategory.test.ts
git commit -m "feat(categories): UserCategory model"
```

---

### Task 9: categoryService — CRUD + ownership

**Files:**
- Create: `backend/api/src/services/categoryService.ts`
- Test: `backend/api/src/__tests__/services/categoryService.test.ts` (create)

**Interfaces:**
- Produces:
  - `listCategories(userId): Promise<UserCategory[]>`
  - `createCategory(userId, input): Promise<UserCategory>` (validates `name` non-empty via zod)
  - `updateCategory(userId, id, updates): Promise<UserCategory>` — throws `Category not found` / `Unauthorized`
  - `deleteCategory(userId, id): Promise<void>` — same ownership checks

- [ ] **Step 1: Write the failing test**

```typescript
// backend/api/src/__tests__/services/categoryService.test.ts
import { updateCategory, deleteCategory } from '../../services/categoryService';
import { UserCategoryModel } from '../../models/UserCategory';

jest.mock('../../models/UserCategory');
const mockModel = UserCategoryModel as jest.Mocked<typeof UserCategoryModel>;

describe('categoryService ownership', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updateCategory throws "Category not found" when missing', async () => {
    mockModel.findById.mockResolvedValueOnce(null as any);
    await expect(updateCategory('u1', 'c1', { name: 'x' })).rejects.toThrow('Category not found');
  });

  it('updateCategory throws "Unauthorized" for another user\'s category', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'c1', userId: 'someone-else' } as any);
    await expect(updateCategory('u1', 'c1', { name: 'x' })).rejects.toThrow('Unauthorized');
  });

  it('deleteCategory deletes when owned', async () => {
    mockModel.findById.mockResolvedValueOnce({ id: 'c1', userId: 'u1' } as any);
    mockModel.delete.mockResolvedValueOnce(undefined as any);
    await deleteCategory('u1', 'c1');
    expect(mockModel.delete).toHaveBeenCalledWith('c1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/services/categoryService.test.ts`
Expected: FAIL — cannot find module `categoryService`.

- [ ] **Step 3: Implement the service**

```typescript
// backend/api/src/services/categoryService.ts
import { z } from 'zod';
import { UserCategoryModel, UserCategory } from '../models/UserCategory';

const createCategorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  color: z.string().optional(),
  icon: z.string().nullable().optional(),
  keywords: z.array(z.string()).optional(),
  sortOrder: z.number().int().optional(),
});

export async function listCategories(userId: string): Promise<UserCategory[]> {
  const cats = await UserCategoryModel.findByUserId(userId);
  return cats.map((c) => c.toUserCategory());
}

export async function createCategory(
  userId: string,
  input: unknown
): Promise<UserCategory> {
  const parsed = createCategorySchema.parse(input);
  const cat = await UserCategoryModel.create(userId, parsed);
  return cat.toUserCategory();
}

export async function updateCategory(
  userId: string,
  id: string,
  updates: Partial<{ name: string; color: string; icon: string | null; keywords: string[]; sortOrder: number }>
): Promise<UserCategory> {
  const existing = await UserCategoryModel.findById(id);
  if (!existing) throw new Error('Category not found');
  if (existing.userId !== userId) throw new Error('Unauthorized');
  const updated = await UserCategoryModel.update(id, updates);
  return updated.toUserCategory();
}

export async function deleteCategory(userId: string, id: string): Promise<void> {
  const existing = await UserCategoryModel.findById(id);
  if (!existing) throw new Error('Category not found');
  if (existing.userId !== userId) throw new Error('Unauthorized');
  await UserCategoryModel.delete(id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/services/categoryService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/api/src/services/categoryService.ts backend/api/src/__tests__/services/categoryService.test.ts
git commit -m "feat(categories): categoryService CRUD with ownership checks"
```

---

### Task 10: categories route + registration

**Files:**
- Create: `backend/api/src/routes/categories.ts`
- Modify: `backend/api/src/index.ts` (import + `app.use`)
- Test: `backend/api/src/__tests__/routes/categories.test.ts` (create)

**Interfaces:**
- Consumes: `categoryService` (Task 9).
- Produces routes: `GET /api/v1/categories`, `POST /api/v1/categories`, `PUT /api/v1/categories/:id`, `DELETE /api/v1/categories/:id`. (`POST /:id/apply` is added in Phase 3.)

- [ ] **Step 1: Write the failing test**

```typescript
// backend/api/src/__tests__/routes/categories.test.ts
import express from 'express';
import request from 'supertest';

jest.mock('../../auth/middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => { req.user = { id: 'u1' }; next(); },
}));
jest.mock('../../services/categoryService');

import * as categoryService from '../../services/categoryService';
import categoryRoutes from '../../routes/categories';

const app = express();
app.use(express.json());
app.use('/api/v1/categories', categoryRoutes);

describe('categories routes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET / lists categories', async () => {
    (categoryService.listCategories as jest.Mock).mockResolvedValue([{ id: 'c1', name: 'A' }]);
    const res = await request(app).get('/api/v1/categories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ categories: [{ id: 'c1', name: 'A' }] });
  });

  it('POST / creates a category', async () => {
    (categoryService.createCategory as jest.Mock).mockResolvedValue({ id: 'c2', name: 'B' });
    const res = await request(app).post('/api/v1/categories').send({ name: 'B' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ category: { id: 'c2', name: 'B' } });
  });

  it('DELETE /:id maps "Category not found" to 404', async () => {
    (categoryService.deleteCategory as jest.Mock).mockRejectedValue(new Error('Category not found'));
    const res = await request(app).delete('/api/v1/categories/cX');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/routes/categories.test.ts`
Expected: FAIL — cannot find module `../../routes/categories`.

- [ ] **Step 3: Implement the route**

```typescript
// backend/api/src/routes/categories.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../services/categoryService';
import { authenticate } from '../auth/middleware';

const router = Router();
router.use(authenticate);

function handleError(error: unknown, res: Response, fallback: string) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid input', details: error.errors });
  }
  if (error instanceof Error) {
    if (error.message === 'Category not found') {
      return res.status(404).json({ error: 'NOT_FOUND', message: error.message });
    }
    if (error.message === 'Unauthorized') {
      return res.status(403).json({ error: 'FORBIDDEN', message: error.message });
    }
  }
  return res.status(500).json({ error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : fallback });
}

router.get('/', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    const categories = await listCategories(req.user.id);
    return res.json({ categories });
  } catch (error) {
    return handleError(error, res, 'Failed to list categories');
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    const category = await createCategory(req.user.id, req.body);
    return res.status(201).json({ category });
  } catch (error) {
    return handleError(error, res, 'Failed to create category');
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    const category = await updateCategory(req.user.id, req.params.id, req.body);
    return res.json({ category });
  } catch (error) {
    return handleError(error, res, 'Failed to update category');
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    await deleteCategory(req.user.id, req.params.id);
    return res.status(204).send();
  } catch (error) {
    return handleError(error, res, 'Failed to delete category');
  }
});

export default router;
```

- [ ] **Step 4: Register the route**

In `backend/api/src/index.ts`, after `import objectRoutes from './routes/objects';` add:

```typescript
import categoryRoutes from './routes/categories';
```

After `app.use('/api/v1/objects', objectRoutes);` add:

```typescript
app.use('/api/v1/categories', categoryRoutes);
```

And add `categories: '/api/v1/categories',` to the endpoints object in the `GET /api/v1` handler.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/__tests__/routes/categories.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/api/src/routes/categories.ts backend/api/src/index.ts backend/api/src/__tests__/routes/categories.test.ts
git commit -m "feat(categories): CRUD route + registration"
```

---

### Task 11: Manual category assignment via updateObject + bulk move

**Files:**
- Modify: `backend/api/src/services/objectService.ts` (`updateObject` passes through `categoryId` with lock; add `bulkMoveObjects`)
- Modify: `backend/api/src/routes/objects.ts` (`/bulk` handles `action: 'move'`)
- Test: `backend/api/src/__tests__/services/objectBulk.test.ts` (extend)

**Interfaces:**
- Produces: `bulkMoveObjects(userId, ids, categoryId: string | null): Promise<{ moved: number }>` — sets `category_id` + `category_locked = true` on owned, non-deleted rows.
- `updateObject` accepts `categoryId?: string | null`; when present, sets `category_locked = true`.

- [ ] **Step 1: Write the failing test (extend objectBulk.test.ts)**

Add to `backend/api/src/__tests__/services/objectBulk.test.ts`:

```typescript
import { bulkMoveObjects } from '../../services/objectService';

describe('bulkMoveObjects', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets category_id and locks the rows, returns moved count', async () => {
    (queries.query as jest.Mock).mockResolvedValueOnce({ rowCount: 2, rows: [] } as any);
    const result = await bulkMoveObjects('u1', ['a', 'b'], 'cat1');
    expect(result).toEqual({ moved: 2 });
    const [sql, params] = (queries.query as jest.Mock).mock.calls[0];
    expect(sql).toMatch(/SET category_id = \$1, category_locked = true/i);
    expect(sql).toMatch(/user_id = \$2/);
    expect(sql).toMatch(/id = ANY\(\$3\)/);
    expect(params).toEqual(['cat1', 'u1', ['a', 'b']]);
  });
});
```

(`queries` is already imported at the top of this file from Task 1.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/services/objectBulk.test.ts`
Expected: FAIL — `bulkMoveObjects is not a function`.

- [ ] **Step 3: Implement service changes**

Append to `objectService.ts`:

```typescript
/**
 * Bulk move: assign a category (or null) to the user's own objects and lock them
 * so keyword rules won't override the manual choice.
 */
export async function bulkMoveObjects(
  userId: string,
  ids: string[],
  categoryId: string | null
): Promise<{ moved: number }> {
  if (!ids || ids.length === 0) return { moved: 0 };
  const result = await query(
    `UPDATE hub.atomic_objects
     SET category_id = $1, category_locked = true
     WHERE user_id = $2 AND id = ANY($3) AND deleted_at IS NULL`,
    [categoryId, userId, ids]
  );
  return { moved: result.rowCount ?? 0 };
}
```

In `updateObject`, extend the `updates` param type with `categoryId?: string | null;`, and before `const updated = await object.update(updates);` translate it into a locked update:

```typescript
  const modelUpdates: any = { ...updates };
  if (updates.categoryId !== undefined) {
    modelUpdates.categoryId = updates.categoryId;
    modelUpdates.categoryLocked = true;
  }
  const updated = await object.update(modelUpdates);
```

(Replace the existing `const updated = await object.update(updates);` line with the block above.)

- [ ] **Step 4: Add `move` to the bulk route**

In `routes/objects.ts`, import `bulkMoveObjects` alongside `bulkDeleteObjects`. In the `POST /bulk` handler, before the unsupported-action fallback, add:

```typescript
    if (action === 'move') {
      const { categoryId } = req.body as { categoryId?: string | null };
      const result = await bulkMoveObjects(req.user.id, ids, categoryId ?? null);
      return res.json(result);
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/__tests__/services/objectBulk.test.ts`
Expected: PASS (delete + move suites).

- [ ] **Step 6: Commit**

```bash
git add backend/api/src/services/objectService.ts backend/api/src/routes/objects.ts backend/api/src/__tests__/services/objectBulk.test.ts
git commit -m "feat(objects): manual category assignment (updateObject + bulk move)"
```

---

### Task 12: Mobile API client + useCategories hook

**Files:**
- Modify: `mobile/src/services/api.ts` (category methods; `bulkMoveObjects`)
- Create: `mobile/src/hooks/useCategories.ts`
- Modify: `mobile/src/types/index.ts` (add `UserCategory` type)

**Interfaces:**
- Produces (api): `getCategories()`, `createCategory(input)`, `updateCategory(id, updates)`, `deleteCategory(id)`, `bulkMoveObjects(ids, categoryId)`.
- Produces (hook): `useCategories()` → `{ categories, isLoading, error, refresh, createCategory, updateCategory, deleteCategory }`.

- [ ] **Step 1: Add the `UserCategory` mobile type**

In `mobile/src/types/index.ts`:

```typescript
export interface UserCategory {
  id: string;
  userId: string;
  name: string;
  color: string;
  icon: string | null;
  keywords: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Add API client methods**

In `mobile/src/services/api.ts`, after `bulkDeleteObjects` (Task 3) add:

```typescript
  async bulkMoveObjects(ids: string[], categoryId: string | null): Promise<{ moved: number }> {
    return this.request<{ moved: number }>(`/api/v1/objects/bulk`, {
      method: 'POST',
      body: JSON.stringify({ ids, action: 'move', categoryId }),
    });
  }

  async getCategories(): Promise<{ categories: UserCategory[] }> {
    return this.request<{ categories: UserCategory[] }>(`/api/v1/categories`);
  }

  async createCategory(input: {
    name: string; color?: string; icon?: string | null; keywords?: string[];
  }): Promise<{ category: UserCategory }> {
    return this.request<{ category: UserCategory }>(`/api/v1/categories`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateCategory(id: string, updates: Partial<{
    name: string; color: string; icon: string | null; keywords: string[]; sortOrder: number;
  }>): Promise<{ category: UserCategory }> {
    return this.request<{ category: UserCategory }>(`/api/v1/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteCategory(id: string): Promise<void> {
    await this.request<void>(`/api/v1/categories/${id}`, { method: 'DELETE' });
  }
```

Ensure `UserCategory` is imported at the top of `api.ts` (it imports from `../types` — add `UserCategory` to that import, matching how `AtomicObject` is imported).

- [ ] **Step 3: Implement the hook**

```typescript
// mobile/src/hooks/useCategories.ts
import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';
import { UserCategory } from '../types';

export function useCategories() {
  const [categories, setCategories] = useState<UserCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiService.getCategories();
      setCategories(res.categories);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load categories');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createCategory = useCallback(async (input: { name: string; color?: string; icon?: string | null; keywords?: string[] }) => {
    const res = await apiService.createCategory(input);
    setCategories((prev) => [...prev, res.category]);
    return res.category;
  }, []);

  const updateCategory = useCallback(async (id: string, updates: Partial<{ name: string; color: string; icon: string | null; keywords: string[]; sortOrder: number }>) => {
    const res = await apiService.updateCategory(id, updates);
    setCategories((prev) => prev.map((c) => (c.id === id ? res.category : c)));
    return res.category;
  }, []);

  const deleteCategory = useCallback(async (id: string) => {
    await apiService.deleteCategory(id);
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { categories, isLoading, error, refresh, createCategory, updateCategory, deleteCategory };
}
```

- [ ] **Step 4: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/services/api.ts mobile/src/hooks/useCategories.ts mobile/src/types/index.ts
git commit -m "feat(mobile): category API client methods + useCategories hook"
```

---

### Task 13: CategoriesScreen (manager) + navigation

**Files:**
- Create: `mobile/src/screens/CategoriesScreen.tsx`
- Modify: `mobile/src/navigation/types.ts` (add `Categories` route)
- Modify: `mobile/src/navigation/AppNavigator.tsx` (register screen + import)
- Modify: `mobile/src/screens/ObjectsScreen.tsx` (header button to open Categories)

**Interfaces:**
- Consumes: `useCategories` (Task 12).
- Produces: a screen listing categories with name + color swatch, an "Add" affordance (name + color), edit (rename/recolor), and delete (with a confirm noting notes are un-filed, not deleted). The keyword editor is added in Phase 3 (Task 16).

- [ ] **Step 1: Add the route type**

In `mobile/src/navigation/types.ts`, add to `RootStackParamList`:

```typescript
  Categories: undefined;
```

- [ ] **Step 2: Create the screen**

```tsx
// mobile/src/screens/CategoriesScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, ActivityIndicator,
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
  const { categories, isLoading, createCategory, updateCategory, deleteCategory } = useCategories();
  const [editing, setEditing] = useState<UserCategory | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState(PALETTE[0]);
  const [showEditor, setShowEditor] = useState(false);

  const openNew = () => { setEditing(null); setDraftName(''); setDraftColor(PALETTE[0]); setShowEditor(true); };
  const openEdit = (c: UserCategory) => { setEditing(c); setDraftName(c.name); setDraftColor(c.color); setShowEditor(true); };

  const save = async () => {
    const name = draftName.trim();
    if (!name) { Alert.alert('Name required'); return; }
    try {
      if (editing) await updateCategory(editing.id, { name, color: draftColor });
      else await createCategory({ name, color: draftColor });
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
        { text: 'Delete', style: 'destructive', onPress: () => deleteCategory(c.id).catch(() => Alert.alert('Couldn\'t delete')) },
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
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(c) => c.id}
          ListEmptyComponent={<Text style={styles.empty}>No categories yet. Tap + to add one.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => openEdit(item)}>
              <View style={[styles.swatch, { backgroundColor: item.color }]} />
              <Text style={styles.rowName}>{item.name}</Text>
              <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      {showEditor && (
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
          <View style={styles.editorActions}>
            <TouchableOpacity onPress={() => setShowEditor(false)}><Text style={styles.cancel}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity onPress={save}><Text style={styles.saveBtn}>Save</Text></TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  swatch: { width: 22, height: 22, borderRadius: 11, marginRight: 12 },
  rowName: { flex: 1, fontSize: 16, color: '#111827' },
  empty: { textAlign: 'center', color: '#6b7280', marginTop: 40 },
  editor: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  paletteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  editorActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, marginTop: 16 },
  cancel: { color: '#6b7280', fontSize: 16 },
  saveBtn: { color: '#3b82f6', fontSize: 16, fontWeight: '700' },
});
```

- [ ] **Step 3: Register the screen**

In `mobile/src/navigation/AppNavigator.tsx`, import it near the other screen imports:

```typescript
import CategoriesScreen from '../screens/CategoriesScreen';
```

Add a `Stack.Screen` alongside the others (e.g. after `Objects`):

```tsx
<Stack.Screen name="Categories" component={CategoriesScreen} />
```

- [ ] **Step 4: Add a way to open it from Objects**

In `ObjectsScreen.tsx`, add a header action (e.g. a folder/pricetags icon) that calls `navigation.navigate('Categories')`:

```tsx
<TouchableOpacity onPress={() => navigation.navigate('Categories')}>
  <Ionicons name="pricetags-outline" size={22} color="#111827" />
</TouchableOpacity>
```

- [ ] **Step 5: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Manual verification**

Objects → tap the categories icon → add a category (name + color), edit it, delete it (confirm copy says notes are kept).

- [ ] **Step 7: Commit**

```bash
git add mobile/src/screens/CategoriesScreen.tsx mobile/src/navigation/types.ts mobile/src/navigation/AppNavigator.tsx mobile/src/screens/ObjectsScreen.tsx
git commit -m "feat(mobile): CategoriesScreen manager + navigation"
```

---

### Task 14: Category picker in note detail + bulk "Move to category"

**Files:**
- Modify: `mobile/src/screens/ObjectsScreen.tsx` (category picker in detail modal; "Move to" in the selection bar)

**Interfaces:**
- Consumes: `useCategories` (read categories), `updateObject` (sets `categoryId`), `apiService.bulkMoveObjects` (via a new hook method or directly).

- [ ] **Step 1: Add a `bulkMoveObjects` hook method**

In `mobile/src/hooks/useObjects.ts`, mirror `bulkDeleteObjects` (Task 3) with a move variant, after it:

```typescript
  const bulkMoveObjects = useCallback(async (ids: string[], categoryId: string | null): Promise<boolean> => {
    if (ids.length === 0) return true;
    try {
      await apiService.bulkMoveObjects(ids, categoryId);
      setState((prev) => ({
        ...prev,
        objects: prev.objects.map((obj) =>
          ids.includes(obj.id) ? { ...obj, categoryId, categoryLocked: true } : obj
        ),
      }));
      return true;
    } catch (error) {
      return false;
    }
  }, []);
```

Add `bulkMoveObjects: (ids: string[], categoryId: string | null) => Promise<boolean>;` to `UseObjectsReturn` and `bulkMoveObjects,` to the hook's return.

- [ ] **Step 2: Load categories in ObjectsScreen**

Near the top of `ObjectsScreen`, call the hook:

```typescript
  const { categories } = useCategories();
```

(Add `import { useCategories } from '../hooks/useCategories';` at the top.)

- [ ] **Step 3: Add a category picker to the detail modal**

In the detail modal's details section, render a horizontal list of category chips plus "None". Tapping a chip calls `updateObject(detailObject.id, { categoryId: <id or null> })`. Example:

```tsx
<View style={styles.categoryPickerRow}>
  <TouchableOpacity
    style={[styles.categoryChip, !detailObject?.categoryId && styles.categoryChipActive]}
    onPress={() => detailObject && updateObject(detailObject.id, { categoryId: null } as any)}
  >
    <Text style={styles.categoryChipText}>None</Text>
  </TouchableOpacity>
  {categories.map((c) => (
    <TouchableOpacity
      key={c.id}
      style={[styles.categoryChip, detailObject?.categoryId === c.id && styles.categoryChipActive, { borderColor: c.color }]}
      onPress={() => detailObject && updateObject(detailObject.id, { categoryId: c.id } as any)}
    >
      <View style={[styles.swatchSm, { backgroundColor: c.color }]} />
      <Text style={styles.categoryChipText}>{c.name}</Text>
    </TouchableOpacity>
  ))}
</View>
```

Replace `detailObject` with the screen's actual open-object variable. Add styles `categoryPickerRow`, `categoryChip`, `categoryChipActive`, `categoryChipText`, `swatchSm` to the StyleSheet (follow the existing chip styles in this file for consistency).

- [ ] **Step 4: Add "Move to category" to the selection bar**

In the selection bar from Phase 1 (Task 5, Step 6), add a button before Delete that presents the user's categories (use `Alert.alert` with one button per category for the simplest implementation):

```tsx
<TouchableOpacity
  style={styles.selectionMoveBtn}
  disabled={selectedIds.size === 0}
  onPress={() => {
    const ids = Array.from(selectedIds);
    Alert.alert('Move to category', undefined, [
      { text: 'None (uncategorize)', onPress: async () => { if (await bulkMoveObjects(ids, null)) exitSelection(); } },
      ...categories.map((c) => ({
        text: c.name,
        onPress: async () => { if (await bulkMoveObjects(ids, c.id)) exitSelection(); },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }}
>
  <Ionicons name="pricetag-outline" size={20} color="#3b82f6" />
  <Text style={styles.selectionMoveText}>Move</Text>
</TouchableOpacity>
```

Destructure `bulkMoveObjects` from `useObjects()`. Add `selectionMoveBtn` / `selectionMoveText` styles (mirror `selectionDeleteBtn` with a neutral/white background and blue text).

- [ ] **Step 5: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Manual verification**

Create 2 categories. Open a note → pick a category (chip highlights). Multi-select several notes → Move → choose a category. Reopen one to confirm it stuck.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/hooks/useObjects.ts mobile/src/screens/ObjectsScreen.tsx
git commit -m "feat(mobile): category picker in detail + bulk move to category"
```

---

### Task 15: Filter notes by category

**Files:**
- Modify: `mobile/src/hooks/useObjects.ts` (`ObjectFilters` gains `categoryId`; pass through to API)
- Modify: `mobile/src/services/api.ts` (`getObjects` accepts `categoryId`)
- Modify: `mobile/src/screens/ObjectsScreen.tsx` (category filter chips)

**Interfaces:**
- Consumes: `GET /api/v1/objects?categoryId=...` (already supported by the model filter from Task 7; verify the route forwards it — see Step 1).

- [ ] **Step 1: Forward `categoryId` in the backend route**

In `backend/api/src/routes/objects.ts` `GET /` handler, after the `objectType` parsing block add:

```typescript
    const categoryId = req.query.categoryId as string | undefined;
```

and pass `categoryId,` into the `listObjects(...)` options object. Then in `objectService.ts` `ListObjectsOptions` add `categoryId?: string;`, and in `listObjects` pass `categoryId: options.categoryId` into both the `semanticSearch` call and the `AtomicObjectModel.findByUserId` options. (The model filter already exists from Task 7.) Commit this with the mobile changes below.

- [ ] **Step 2: Add `categoryId` to the API client**

In `mobile/src/services/api.ts` `getObjects` options type add `categoryId?: string;` and, in the body, `if (options.categoryId) params.append('categoryId', options.categoryId);`.

- [ ] **Step 3: Thread through the hook**

In `mobile/src/hooks/useObjects.ts`, add `categoryId?: string;` to `ObjectFilters`, and pass `categoryId: filters.categoryId,` in both `apiService.getObjects(...)` calls (`fetchObjects` and `loadMore`).

- [ ] **Step 4: Add category filter chips to ObjectsScreen**

Render a chips row (near the existing domain/type filter chips) listing "All" + each category. Selecting one calls `setFilters({ ...filters, categoryId: <id|undefined> })`. Example:

```tsx
<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipsRow}>
  <TouchableOpacity
    style={[styles.filterChip, !filters.categoryId && styles.filterChipActive]}
    onPress={() => setFilters({ ...filters, categoryId: undefined })}
  >
    <Text style={styles.filterChipText}>All</Text>
  </TouchableOpacity>
  {categories.map((c) => (
    <TouchableOpacity
      key={c.id}
      style={[styles.filterChip, filters.categoryId === c.id && styles.filterChipActive]}
      onPress={() => setFilters({ ...filters, categoryId: c.id })}
    >
      <View style={[styles.swatchSm, { backgroundColor: c.color }]} />
      <Text style={styles.filterChipText}>{c.name}</Text>
    </TouchableOpacity>
  ))}
</ScrollView>
```

Reuse existing filter-chip styles where present; add `filterChipsRow` if needed.

- [ ] **Step 5: Typecheck + backend test sanity**

Run (from `mobile/`): `npx tsc --noEmit` → no new errors.
Run (from `backend/api/`): `npm test` → all green (no regressions).

- [ ] **Step 6: Manual verification**

Assign notes to a category, then tap that category chip — the list shows only those notes. "All" clears the filter.

- [ ] **Step 7: Commit**

```bash
git add backend/api/src/routes/objects.ts backend/api/src/services/objectService.ts mobile/src/services/api.ts mobile/src/hooks/useObjects.ts mobile/src/screens/ObjectsScreen.tsx
git commit -m "feat(notes): filter notes by custom category"
```

**Phase 2 complete — shippable.**

---

# Phase 3 — Keyword rules

### Task 16: Rule matching + apply-at-creation + apply-to-existing

**Files:**
- Modify: `backend/api/src/services/categoryService.ts` (`matchCategoryForText`, `applyRulesToObject`, `applyCategoryRules`)
- Modify: `backend/api/src/services/objectService.ts` (`createObject` runs rules after persist)
- Modify: `backend/api/src/routes/categories.ts` (`POST /:id/apply`)
- Test: `backend/api/src/__tests__/services/categoryRules.test.ts` (create)

**Interfaces:**
- Produces:
  - `matchCategoryForText(categories: { id: string; keywords: string[] }[], text: string): string | null` — pure; returns the id of the first category (input order) with any keyword as a case-insensitive substring of `text`; else null.
  - `applyRulesToObject(userId: string, objectId: string, text: string): Promise<void>` — looks up the user's categories, matches, and calls `AtomicObjectModel.assignCategoryByRule` when matched.
  - `applyCategoryRules(userId: string, categoryId: string): Promise<{ filed: number }>` — files the category's keyword matches across the user's unlocked + uncategorized notes.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/api/src/__tests__/services/categoryRules.test.ts
import { matchCategoryForText } from '../../services/categoryService';

describe('matchCategoryForText', () => {
  const cats = [
    { id: 'fit', keywords: ['gym', 'run'] },
    { id: 'work', keywords: ['invoice'] },
  ];

  it('matches case-insensitively on substring', () => {
    expect(matchCategoryForText(cats, 'Hit the GYM at 6')).toBe('fit');
  });

  it('returns the first category in order on multiple matches', () => {
    expect(matchCategoryForText(cats, 'gym then send invoice')).toBe('fit');
  });

  it('returns null when nothing matches', () => {
    expect(matchCategoryForText(cats, 'buy milk')).toBeNull();
  });

  it('ignores empty keyword lists', () => {
    expect(matchCategoryForText([{ id: 'x', keywords: [] }], 'anything')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/services/categoryRules.test.ts`
Expected: FAIL — `matchCategoryForText is not a function`.

- [ ] **Step 3: Implement rule matching in categoryService**

Add imports at the top of `categoryService.ts`:

```typescript
import { AtomicObjectModel } from '../models/AtomicObject';
import { query, queryMany } from '../db/queries';
```

Add:

```typescript
/**
 * Pure: first category (input order) with a keyword that is a case-insensitive
 * substring of `text`, else null.
 */
export function matchCategoryForText(
  categories: { id: string; keywords: string[] }[],
  text: string
): string | null {
  const haystack = (text || '').toLowerCase();
  for (const cat of categories) {
    for (const kw of cat.keywords ?? []) {
      const needle = kw.trim().toLowerCase();
      if (needle && haystack.includes(needle)) return cat.id;
    }
  }
  return null;
}

/**
 * Apply a user's keyword rules to a single object. No-op if no category matches.
 */
export async function applyRulesToObject(
  userId: string,
  objectId: string,
  text: string
): Promise<void> {
  const cats = await UserCategoryModel.findByUserId(userId);
  const matchId = matchCategoryForText(
    cats.map((c) => ({ id: c.id, keywords: c.keywords })),
    text
  );
  if (matchId) {
    await AtomicObjectModel.assignCategoryByRule(objectId, matchId);
  }
}

/**
 * Apply one category's keywords across the user's unlocked + uncategorized notes.
 */
export async function applyCategoryRules(
  userId: string,
  categoryId: string
): Promise<{ filed: number }> {
  const cat = await UserCategoryModel.findById(categoryId);
  if (!cat) throw new Error('Category not found');
  if (cat.userId !== userId) throw new Error('Unauthorized');

  const keywords = cat.keywords ?? [];
  if (keywords.length === 0) return { filed: 0 };

  // Build a case-insensitive OR of ILIKE patterns over title + content.
  const patterns = keywords.map((k) => `%${k.trim()}%`).filter((p) => p !== '%%');
  if (patterns.length === 0) return { filed: 0 };

  const ilikeClauses = patterns
    .map((_, idx) => `(COALESCE(title, '') || ' ' || content) ILIKE $${idx + 3}`)
    .join(' OR ');

  const result = await query(
    `UPDATE hub.atomic_objects
     SET category_id = $1
     WHERE user_id = $2
       AND category_id IS NULL
       AND category_locked = false
       AND deleted_at IS NULL
       AND (${ilikeClauses})`,
    [categoryId, userId, ...patterns]
  );
  return { filed: result.rowCount ?? 0 };
}
```

- [ ] **Step 4: Run unit test to verify pass**

Run: `npm test -- src/__tests__/services/categoryRules.test.ts`
Expected: PASS (4 passing).

- [ ] **Step 5: Apply rules at note creation**

In `objectService.ts` `createObject`, after the object is persisted and before the relationships `setImmediate` block, add a best-effort rule pass (non-fatal):

```typescript
  try {
    const ruleText = `${atomicObject.title ?? ''} ${atomicObject.content ?? ''}`;
    const { applyRulesToObject } = await import('./categoryService');
    await applyRulesToObject(userId, atomicObject.id, ruleText);
    const refreshed = await AtomicObjectModel.findById(atomicObject.id);
    if (refreshed) {
      atomicObject.categoryId = refreshed.categoryId;
      atomicObject.categoryLocked = refreshed.categoryLocked;
    }
  } catch (err) {
    console.warn('[objectService] Category rule application failed (non-fatal):', err);
  }
```

(The dynamic `import('./categoryService')` avoids a circular import at module load.)

- [ ] **Step 6: Add the apply endpoint**

In `routes/categories.ts`, import `applyCategoryRules` from the service and add:

```typescript
router.post('/:id/apply', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    const result = await applyCategoryRules(req.user.id, req.params.id);
    return res.json(result);
  } catch (error) {
    return handleError(error, res, 'Failed to apply category rules');
  }
});
```

- [ ] **Step 7: Run the full backend suite**

Run (from `backend/api/`): `npm test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add backend/api/src/services/categoryService.ts backend/api/src/services/objectService.ts backend/api/src/routes/categories.ts backend/api/src/__tests__/services/categoryRules.test.ts
git commit -m "feat(categories): keyword rules at creation + apply-to-existing endpoint"
```

---

### Task 17: Mobile keyword editor + "Apply to existing"

**Files:**
- Modify: `mobile/src/services/api.ts` (`applyCategory`)
- Modify: `mobile/src/hooks/useCategories.ts` (expose keyword updates via existing `updateCategory`; add `applyCategory`)
- Modify: `mobile/src/screens/CategoriesScreen.tsx` (keyword chips editor + "Apply to existing notes" button)

**Interfaces:**
- Produces (api): `applyCategory(id): Promise<{ filed: number }>`.

- [ ] **Step 1: Add the API method**

In `mobile/src/services/api.ts`, after `deleteCategory`:

```typescript
  async applyCategory(id: string): Promise<{ filed: number }> {
    return this.request<{ filed: number }>(`/api/v1/categories/${id}/apply`, { method: 'POST' });
  }
```

- [ ] **Step 2: Expose `applyCategory` from the hook**

In `mobile/src/hooks/useCategories.ts`, add:

```typescript
  const applyCategory = useCallback(async (id: string) => {
    return apiService.applyCategory(id);
  }, []);
```

and include `applyCategory` in the returned object.

- [ ] **Step 3: Add a keyword editor to the category editor**

In `CategoriesScreen.tsx`, extend the editor panel with keyword management. Add draft state:

```typescript
  const [draftKeywords, setDraftKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
```

Set `setDraftKeywords(c.keywords)` in `openEdit` and `setDraftKeywords([])` in `openNew`. In `save`, include `keywords: draftKeywords` in both `updateCategory` and `createCategory` payloads. Render below the palette row:

```tsx
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
```

Add `keywordsBlock`, `keywordsLabel`, `keywordChips`, `keywordChip`, `keywordChipText` styles (small pill chips, follow the swatch/row spacing already in the file).

- [ ] **Step 4: Add "Apply to existing notes" on each category row**

Destructure `applyCategory` from `useCategories()`. Add a button in the category row (or the edit panel) that runs it and reports the count:

```tsx
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
>
  <Ionicons name="sparkles-outline" size={18} color="#3b82f6" />
</TouchableOpacity>
```

Place it in the row before the trash icon.

- [ ] **Step 5: Typecheck**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Manual verification**

Edit a category → add keyword "gym" → save. Record/create a note mentioning "gym" → it auto-files into that category. For an old note, use "Apply to existing notes" and confirm the count, then verify the note now appears under that category's filter. Manually move a note elsewhere, re-run apply, and confirm the rule does NOT pull it back (locked).

- [ ] **Step 7: Commit**

```bash
git add mobile/src/services/api.ts mobile/src/hooks/useCategories.ts mobile/src/screens/CategoriesScreen.tsx
git commit -m "feat(mobile): keyword editor + apply-to-existing in CategoriesScreen"
```

**Phase 3 complete — feature done.**

---

## Self-Review (spec coverage)

- Custom categories as a new layer → Tasks 6–8, 12–13. ✅
- One category per note → `category_id` single FK (Task 6); picker/move set a single id (Tasks 11, 14). ✅
- Manual assignment + manual wins → `category_locked` set on manual update/move (Tasks 7, 11); `assignCategoryByRule` and `applyCategoryRules` skip locked rows (Tasks 7, 16). ✅
- Keyword rules at creation + apply-to-existing → Task 16; mobile editor + apply button → Task 17. ✅
- AI domain untouched → no changes to domain logic; categories are additive. ✅
- Single-note delete (trash icon) → Task 4. ✅
- Multi-select bulk delete → Tasks 1, 2, 3, 5. ✅
- Bulk move to category → Tasks 11, 14. ✅
- Delete category un-files notes (keeps them) → `ON DELETE SET NULL` (Task 6); confirm copy (Task 13). ✅
- Filter by category → Task 15. ✅
- Backend tests for CRUD, rule match, lock-not-overwritten, apply, bulk → Tasks 1, 2, 7, 8, 9, 10, 11, 16. ✅
