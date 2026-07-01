# Memory Intent Model Implementation Plan (Phase 8.1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add memory-intent semantics to atomic objects — new types (commitment/preference/concern), an LLM-inferred `why_it_matters`, and code-derived `retention_policy`/`trigger_context` — captured and displayed, not enforced.

**Architecture:** A pure `memoryIntent.ts` derive module is the single source of truth for `retention_policy`/`trigger_context`, reused by ingest and mirrored by the migration backfill. Migration 014 adds columns + an (expanded) object_type CHECK + backfill. `AtomicObjectModel.create` persists all three fields; the parser + mlService add `why_it_matters`; the mobile note view shows the type + why line.

**Tech Stack:** Node/Express + Postgres (`src/db/queries`), Jest; Python (ml-service prompt); React Native/Expo.

## Global Constraints

- New object types: `commitment`, `preference`, `concern` (added to the existing 8: task, reminder, idea, observation, question, decision, journal, reference).
- `why_it_matters`: LLM-inferred, nullable text.
- `retention_policy` ∈ `temporary|until_done|long_term|decay|user_confirmed` — DERIVED in code (never LLM).
- `trigger_context` ∈ `place|time|person|topic|calendar|manual|none` — DERIVED in code; this slice only ever produces `place|time|none`.
- Derive rules (authoritative): retention — task/reminder/commitment→`until_done`, preference/decision→`long_term`, concern/journal/observation→`decay`, else (idea/question/reference/null)→`temporary`. trigger — non-empty `location_places` OR `location_geofence_candidate`→`place`, else `temporal_has_date`→`time`, else `none`.
- No enforcement of these fields this slice (no expiry, no new triggers). Display is read-only.
- Migration: raw-SQL in `backend/api/src/db/migrations/` (next number `014`), idempotent, applied to prod via `PGSSLMODE=require psql "$DATABASE_PUBLIC_URL" -f <file>` BEFORE deploying the parser change. **Prod currently has NO object_type CHECK** (drift) — the migration drops-if-exists then adds the expanded one.
- Backend deploys via push to `main`; mobile via `eas update --branch preview --clear-cache`.

---

### Task 1: `memoryIntent.ts` derive helpers

**Files:**
- Create: `backend/api/src/services/memoryIntent.ts`
- Test: `backend/api/src/__tests__/services/memoryIntent.test.ts`

**Interfaces:**
- Produces:
  - `type RetentionPolicy = 'temporary'|'until_done'|'long_term'|'decay'|'user_confirmed'`
  - `type TriggerContext = 'place'|'time'|'person'|'topic'|'calendar'|'manual'|'none'`
  - `retentionPolicyFor(objectType?: string | null): RetentionPolicy`
  - `triggerContextFor(signals: { places?: string[] | null; geofenceCandidate?: boolean | null; hasDate?: boolean | null }): TriggerContext`

- [ ] **Step 1: Write the failing test**

Create `backend/api/src/__tests__/services/memoryIntent.test.ts`:

```typescript
import { retentionPolicyFor, triggerContextFor } from '../../services/memoryIntent';

describe('retentionPolicyFor', () => {
  it.each([
    ['task', 'until_done'], ['reminder', 'until_done'], ['commitment', 'until_done'],
    ['preference', 'long_term'], ['decision', 'long_term'],
    ['concern', 'decay'], ['journal', 'decay'], ['observation', 'decay'],
    ['idea', 'temporary'], ['question', 'temporary'], ['reference', 'temporary'],
  ])('%s -> %s', (type, expected) => {
    expect(retentionPolicyFor(type)).toBe(expected);
  });
  it('null/unknown -> temporary', () => {
    expect(retentionPolicyFor(null)).toBe('temporary');
    expect(retentionPolicyFor('weird')).toBe('temporary');
  });
});

describe('triggerContextFor', () => {
  it('non-empty places -> place', () => {
    expect(triggerContextFor({ places: ['Costco'] })).toBe('place');
  });
  it('geofenceCandidate -> place', () => {
    expect(triggerContextFor({ geofenceCandidate: true })).toBe('place');
  });
  it('hasDate (no place) -> time', () => {
    expect(triggerContextFor({ hasDate: true })).toBe('time');
  });
  it('place wins over time', () => {
    expect(triggerContextFor({ places: ['Costco'], hasDate: true })).toBe('place');
  });
  it('nothing -> none', () => {
    expect(triggerContextFor({})).toBe('none');
    expect(triggerContextFor({ places: [], geofenceCandidate: false, hasDate: false })).toBe('none');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `cd backend/api && npx jest memoryIntent -v`
Expected: FAIL — "Cannot find module '../../services/memoryIntent'".

- [ ] **Step 3: Implement**

Create `backend/api/src/services/memoryIntent.ts`:

```typescript
/**
 * Derived memory-intent classification. Single source of truth for
 * retention_policy and trigger_context — reused at ingest and mirrored by the
 * migration 014 backfill. Captured now; enforced in later Phase 8 slices.
 */
export type RetentionPolicy = 'temporary' | 'until_done' | 'long_term' | 'decay' | 'user_confirmed';
export type TriggerContext = 'place' | 'time' | 'person' | 'topic' | 'calendar' | 'manual' | 'none';

export function retentionPolicyFor(objectType?: string | null): RetentionPolicy {
  switch (objectType) {
    case 'task':
    case 'reminder':
    case 'commitment':
      return 'until_done';
    case 'preference':
    case 'decision':
      return 'long_term';
    case 'concern':
    case 'journal':
    case 'observation':
      return 'decay';
    default: // idea, question, reference, null, unknown
      return 'temporary';
  }
}

export function triggerContextFor(signals: {
  places?: string[] | null;
  geofenceCandidate?: boolean | null;
  hasDate?: boolean | null;
}): TriggerContext {
  if ((signals.places && signals.places.length > 0) || signals.geofenceCandidate) return 'place';
  if (signals.hasDate) return 'time';
  return 'none';
}
```

- [ ] **Step 4: Run test — verify pass**

Run: `cd backend/api && npx jest memoryIntent -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/api/src/services/memoryIntent.ts backend/api/src/__tests__/services/memoryIntent.test.ts
git commit -m "feat(api): memory-intent derive helpers (retention_policy, trigger_context)"
```

---

### Task 2: Migration 014 — columns, CHECK, backfill

**Files:**
- Create: `backend/api/src/db/migrations/014_memory_intent.sql`

**Interfaces:**
- Produces columns `why_it_matters text`, `retention_policy text`, `trigger_context text` on `hub.atomic_objects`; expanded `object_type` CHECK; backfilled retention/trigger.

- [ ] **Step 1: Write the migration**

Create `backend/api/src/db/migrations/014_memory_intent.sql`:

```sql
-- 014_memory_intent.sql — Phase 8.1 memory-intent fields (additive, idempotent)

ALTER TABLE hub.atomic_objects ADD COLUMN IF NOT EXISTS why_it_matters  text;
ALTER TABLE hub.atomic_objects ADD COLUMN IF NOT EXISTS retention_policy text;
ALTER TABLE hub.atomic_objects ADD COLUMN IF NOT EXISTS trigger_context  text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='hub.atomic_objects'::regclass AND conname='atomic_objects_retention_policy_check') THEN
    ALTER TABLE hub.atomic_objects ADD CONSTRAINT atomic_objects_retention_policy_check
      CHECK (retention_policy IS NULL OR retention_policy IN
        ('temporary','until_done','long_term','decay','user_confirmed'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='hub.atomic_objects'::regclass AND conname='atomic_objects_trigger_context_check') THEN
    ALTER TABLE hub.atomic_objects ADD CONSTRAINT atomic_objects_trigger_context_check
      CHECK (trigger_context IS NULL OR trigger_context IN
        ('place','time','person','topic','calendar','manual','none'));
  END IF;
END $$;

-- object_type CHECK: drop whatever exists (prod currently has none — drift), add expanded list
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid='hub.atomic_objects'::regclass AND contype='c'
    AND pg_get_constraintdef(oid) LIKE '%object_type%';
  IF c IS NOT NULL THEN EXECUTE 'ALTER TABLE hub.atomic_objects DROP CONSTRAINT ' || quote_ident(c); END IF;
END $$;
ALTER TABLE hub.atomic_objects ADD CONSTRAINT atomic_objects_object_type_check
  CHECK (object_type IS NULL OR object_type IN
    ('task','reminder','idea','observation','question','decision','journal','reference',
     'commitment','preference','concern'));

-- Backfill (mirrors memoryIntent.ts derive rules)
UPDATE hub.atomic_objects SET retention_policy = CASE
  WHEN object_type IN ('task','reminder','commitment') THEN 'until_done'
  WHEN object_type IN ('preference','decision')        THEN 'long_term'
  WHEN object_type IN ('concern','journal','observation') THEN 'decay'
  ELSE 'temporary' END
WHERE retention_policy IS NULL;

UPDATE hub.atomic_objects SET trigger_context = CASE
  WHEN (location_places IS NOT NULL AND array_length(location_places, 1) > 0)
       OR location_geofence_candidate THEN 'place'
  WHEN temporal_has_date THEN 'time'
  ELSE 'none' END
WHERE trigger_context IS NULL;
```

- [ ] **Step 2: Apply to prod + verify**

```bash
cd backend/api
PGURL=$(railway variables --json | jq -r '.DATABASE_PUBLIC_URL')
PGSSLMODE=require psql "$PGURL" -v ON_ERROR_STOP=1 -f src/db/migrations/014_memory_intent.sql
PGSSLMODE=require psql "$PGURL" -tAc "select
  (select count(*) from information_schema.columns where table_schema='hub' and table_name='atomic_objects' and column_name in ('why_it_matters','retention_policy','trigger_context')),
  (select count(*) from hub.atomic_objects where retention_policy is null),
  (select count(*) from hub.atomic_objects where trigger_context is null);"
```
Expected: `3|0|0` (3 columns exist; no null retention/trigger after backfill).

- [ ] **Step 3: Commit**

```bash
git add backend/api/src/db/migrations/014_memory_intent.sql
git commit -m "feat(db): memory-intent columns + expanded object_type CHECK + backfill (migration 014)"
```

---

### Task 3: TS types (shared) for new type + fields

**Files:**
- Modify: `backend/api/src/shared-types/index.ts`

**Interfaces:**
- Produces: `ObjectType` includes `'commitment'|'preference'|'concern'`; `AtomicObject` has `whyItMatters?: string | null`, `retentionPolicy?: string | null`, `triggerContext?: string | null`; `AtomicObjectCreateRequest` has `whyItMatters?: string | null`.

- [ ] **Step 1: Extend `ObjectType`**

In `backend/api/src/shared-types/index.ts`, the `ObjectType` union (starts line 25) currently ends `| 'reference';`. Change its tail to include the three new types:

```typescript
  | 'reference'
  | 'commitment'
  | 'preference'
  | 'concern';
```

- [ ] **Step 2: Add fields to `AtomicObject`**

In the `AtomicObject` interface, beside `objectType?` (line ~101), add:

```typescript
  whyItMatters?: string | null;
  retentionPolicy?: string | null;
  triggerContext?: string | null;
```

- [ ] **Step 3: Add field to `AtomicObjectCreateRequest`**

In `AtomicObjectCreateRequest` (the create-input interface, near line ~189 where `objectType?` also appears), add:

```typescript
  whyItMatters?: string | null;
```

- [ ] **Step 4: Verify build**

Run: `cd backend/api && npx tsc --noEmit 2>&1 | grep -E "shared-types" || echo "no shared-types errors"`
Expected: `no shared-types errors`.

- [ ] **Step 5: Commit**

```bash
git add backend/api/src/shared-types/index.ts
git commit -m "feat(types): add memory types + why/retention/trigger fields"
```

---

### Task 4: Persist new fields in `AtomicObjectModel.create`

**Files:**
- Modify: `backend/api/src/models/AtomicObject.ts` (INSERT at ~288-320; the row→object mapper)
- Test: `backend/api/src/__tests__/models/atomicObjectMemoryIntent.test.ts`

**Interfaces:**
- Consumes: `retentionPolicyFor`, `triggerContextFor` from `../services/memoryIntent`; `AtomicObjectCreateRequest.whyItMatters`.
- Produces: persisted `why_it_matters` (from input), `retention_policy`/`trigger_context` (computed at insert); the returned `AtomicObject` exposes `whyItMatters`, `retentionPolicy`, `triggerContext`.

- [ ] **Step 1: Write the failing test**

Create `backend/api/src/__tests__/models/atomicObjectMemoryIntent.test.ts`:

```typescript
import { AtomicObjectModel } from '../../models/AtomicObject';
import * as queries from '../../db/queries';

jest.mock('../../db/queries');
const mockQ = queries as jest.Mocked<typeof queries>;

// Minimal row the mapper needs; create() returns a model built from this row.
function rowFrom(params: any[]) {
  return {
    id: 'o1', user_id: 'u1', content: params[1], category: [],
    created_at: new Date(), updated_at: new Date(),
    object_type: params[21],
    why_it_matters: params[33], retention_policy: params[34], trigger_context: params[35],
  };
}

describe('AtomicObjectModel.create — memory intent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('persists whyItMatters and derives retention/trigger for a commitment with a place', async () => {
    mockQ.queryOne.mockImplementation(async (_sql: string, params?: any[]) => rowFrom(params!) as any);

    const obj = await AtomicObjectModel.create('u1', {
      content: 'I told Justin I would send the quote',
      source: { type: 'voice' },
      objectType: 'commitment',
      whyItMatters: 'Promised to a client; follow up',
      locationHints: { places: ['office'], geofenceCandidate: false },
      temporalHints: { hasDate: false, dateText: null, urgency: null },
    } as any);

    const params = (mockQ.queryOne.mock.calls[0][1]) as any[];
    // $22 object_type, $34 why, $35 retention, $36 trigger (1-indexed → array idx 21/33/34/35)
    expect(params[21]).toBe('commitment');
    expect(params[33]).toBe('Promised to a client; follow up');
    expect(params[34]).toBe('until_done');   // commitment
    expect(params[35]).toBe('place');        // has places
    expect(obj.toAtomicObject().whyItMatters).toBe('Promised to a client; follow up');
    expect(obj.toAtomicObject().retentionPolicy).toBe('until_done');
    expect(obj.toAtomicObject().triggerContext).toBe('place');
  });

  it('derives time trigger + temporary retention for an idea with a date', async () => {
    mockQ.queryOne.mockImplementation(async (_sql: string, params?: any[]) => rowFrom(params!) as any);
    await AtomicObjectModel.create('u1', {
      content: 'maybe refactor parser next Friday',
      source: { type: 'voice' },
      objectType: 'idea',
      temporalHints: { hasDate: true, dateText: 'Friday', urgency: null },
    } as any);
    const params = (mockQ.queryOne.mock.calls[0][1]) as any[];
    expect(params[34]).toBe('temporary'); // idea
    expect(params[35]).toBe('time');      // hasDate, no place
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `cd backend/api && npx jest atomicObjectMemoryIntent -v`
Expected: FAIL (params[33..35] undefined — columns not inserted yet).

- [ ] **Step 3: Implement**

In `backend/api/src/models/AtomicObject.ts`:

(a) add the import near the top:
```typescript
import { retentionPolicyFor, triggerContextFor } from '../services/memoryIntent';
```

(b) In `create()`, before building the INSERT params, compute:
```typescript
    const retentionPolicy = retentionPolicyFor(input.objectType);
    const triggerContext = triggerContextFor({
      places: input.locationHints?.places,
      geofenceCandidate: input.locationHints?.geofenceCandidate,
      hasDate: input.temporalHints?.hasDate,
    });
```

(c) Extend the INSERT column list — after `linked_object_ids, sequence_index, embedding_status` add three columns:
```
        , why_it_matters, retention_policy, trigger_context
```
Extend the `VALUES (...)` list to add three positional params `$34, $35, $36` after `$33`.
Append these three values to the params array, in this exact order, immediately after the current last value (the `$33` embedding_status value):
```typescript
        input.whyItMatters ?? null,   // $34 why_it_matters
        retentionPolicy,              // $35 retention_policy (computed in step (b))
        triggerContext,               // $36 trigger_context  (computed in step (b))
```

(d) In the row→object mapper (the function that builds the returned object / `toAtomicObject`, where `objectType: row.object_type` is set), add:
```typescript
      whyItMatters: row.why_it_matters ?? null,
      retentionPolicy: row.retention_policy ?? null,
      triggerContext: row.trigger_context ?? null,
```
(Also add these three to the `AtomicObjectRow` type and the row interface so TS is satisfied.)

- [ ] **Step 4: Run — verify pass**

Run: `cd backend/api && npx jest atomicObjectMemoryIntent -v`
Expected: PASS (2 tests). Also `npx tsc --noEmit 2>&1 | grep -E "AtomicObject.ts" || echo ok`.

- [ ] **Step 5: Commit**

```bash
git add backend/api/src/models/AtomicObject.ts backend/api/src/__tests__/models/atomicObjectMemoryIntent.test.ts
git commit -m "feat(api): persist why_it_matters + derived retention/trigger on create"
```

---

### Task 5: mlService mapping + voice passthrough for `why_it_matters`

**Files:**
- Modify: `backend/api/src/services/mlService.ts` (interface at :15, mapping at :75-95)
- Modify: `backend/api/src/routes/voice.ts` (the `createObject({...})` call — pass `whyItMatters`)
- Test: `backend/api/src/__tests__/services/mlServiceWhy.test.ts`

**Interfaces:**
- Consumes: parser JSON field `why_it_matters`.
- Produces: `ParsedAtomicObject.whyItMatters: string | null`; `mapMlObject` (or the existing mapping fn) sets it; voice route forwards it into `createObject`.

- [ ] **Step 1: Write the failing test**

Create `backend/api/src/__tests__/services/mlServiceWhy.test.ts`. Import the mapping function used at mlService.ts:75 (find its exported name; if the mapping is inline/not exported, export it or test via the public parse entry). Example assuming an exported `mapParsedObject(raw)`:

```typescript
import { mapParsedObject } from '../../services/mlService';

describe('mlService why_it_matters mapping', () => {
  it('maps snake_case why_it_matters to whyItMatters', () => {
    const out = mapParsedObject({ content: 'x', type: 'commitment', why_it_matters: 'promised to Justin' } as any);
    expect(out.whyItMatters).toBe('promised to Justin');
  });
  it('defaults missing why_it_matters to null', () => {
    const out = mapParsedObject({ content: 'x', type: 'task' } as any);
    expect(out.whyItMatters).toBeNull();
  });
  it('passes through a new type', () => {
    const out = mapParsedObject({ content: 'x', type: 'preference' } as any);
    expect(out.type).toBe('preference');
  });
});
```
If the mapping function is not currently exported, add `export` to it as part of this task.

- [ ] **Step 2: Run — verify fail**

Run: `cd backend/api && npx jest mlServiceWhy -v`
Expected: FAIL (whyItMatters undefined / import missing).

- [ ] **Step 3: Implement**

(a) `mlService.ts` — add to the `ParsedAtomicObject` interface (near line 15-20, beside `type`):
```typescript
  whyItMatters: string | null;
```
(b) In the mapping object (line ~79, beside `type:`), add:
```typescript
    whyItMatters: obj.why_it_matters ?? null,
```
(c) Ensure the mapping function is exported (for the test).
(d) `routes/voice.ts` — in the `createObject(userId, { ... })` call, add:
```typescript
      whyItMatters: parsedObject.whyItMatters,
```
(place it beside the other `parsedObject.*` fields like `objectType`, `locationHints`).

- [ ] **Step 4: Run — verify pass**

Run: `cd backend/api && npx jest mlServiceWhy -v`
Expected: PASS. Also `npx tsc --noEmit 2>&1 | grep -E "mlService|voice.ts" || echo ok`.

- [ ] **Step 5: Commit**

```bash
git add backend/api/src/services/mlService.ts backend/api/src/routes/voice.ts backend/api/src/__tests__/services/mlServiceWhy.test.ts
git commit -m "feat(api): map why_it_matters from parser through to createObject"
```

---

### Task 6: Parser prompt — new types + why_it_matters

**Files:**
- Modify: `backend/ml-service/app/prompts/transcript_parser.py`

**Interfaces:**
- Produces: LLM output may use `commitment|preference|concern` and includes `why_it_matters` in each object.

- [ ] **Step 1: Add the three types to the OBJECT TYPES list**

In `transcript_parser.py`, after the `- reference:` line (~line 45) in the `OBJECT TYPES` block, add:

```
- commitment: something promised to another person ("I told Justin I'd send the quote next week")
- preference: a stable fact about how someone likes things ("Zyrus likes strawberry cake", "Chris prefers text over email")
- concern: an unresolved worry, not yet an action ("I'm worried we priced Bedrock too low")
```

- [ ] **Step 2: Add `why_it_matters` to the OUTPUT FORMAT**

In the JSON structure block (starting ~line 74, near `"title"`/`"type"`), add a field:

```
      "why_it_matters": "one short sentence: why this is worth remembering / when it'd be useful again — or null if purely transient",
```

Add a matching guidance bullet near the other field guidance (~line 126):

```
- why_it_matters: the future situation that makes this worth resurfacing (a person, a place visit, a decision later). Null for throwaway thoughts.
```

- [ ] **Step 3: Add `why_it_matters` to the few-shot examples**

In `EXAMPLE_1_OUTPUT` (~line 139) add `"why_it_matters"` to at least the task and idea objects, e.g. for the pump-supplier task:
```
      "why_it_matters": "Needed before the next supplier order",
```
and for one object add a new-type example if natural (optional). In `EXAMPLE_2_OUTPUT` add `why_it_matters` to at least one object. Keep every example object's JSON valid.

- [ ] **Step 4: Verify the file still parses**

Run: `cd backend/ml-service && python -c "import ast; ast.parse(open('app/prompts/transcript_parser.py').read()); print('OK')"`
Expected: `OK`. (If the repo has ml-service tests: `pytest -q` and confirm no new failures; otherwise this AST check + a manual read of the JSON example strings is the verification.)

- [ ] **Step 5: Commit**

```bash
git add backend/ml-service/app/prompts/transcript_parser.py
git commit -m "feat(ml): parser emits commitment/preference/concern + why_it_matters"
```

---

### Task 7: Mobile — carry + display type and why_it_matters

**Files:**
- Modify: `mobile/src/services/api.ts` (the backend→mobile object mapper — add `whyItMatters`)
- Modify: mobile `AtomicObject` type (in `mobile/src/types/index.ts` if present) — add `whyItMatters?`
- Modify: `mobile/src/screens/ObjectsScreen.tsx` (`TYPE_LABELS` + note render)

**Interfaces:**
- Consumes: backend object JSON now includes `whyItMatters`.
- Produces: `TYPE_LABELS` covers the 3 new types; the note view shows the type (already via `buildCardSubtitle`) and a why line when present.

- [ ] **Step 1: Carry `whyItMatters` through the mobile mapper + type**

In `mobile/src/services/api.ts`, find where a backend atomic object is mapped to the mobile shape (the object list/detail mapping). Add `whyItMatters: raw.whyItMatters ?? null` to that mapper. Add `whyItMatters?: string | null;` to the mobile `AtomicObject` type (search for the interface with `objectType`).

- [ ] **Step 2: Add new types to `TYPE_LABELS`**

In `ObjectsScreen.tsx`, `TYPE_LABELS` (used by `getFriendlyType`, line ~134) — add:

```typescript
  commitment: 'Commitment',
  preference: 'Preference',
  concern: 'Concern',
```

- [ ] **Step 3: Render the why line**

In the note detail/card render (the block using `item.title || item.content` and `buildCardSubtitle`, ~line 623-650), add below the subtitle, guarded on presence:

```tsx
{item.whyItMatters ? (
  <Text style={styles.noteWhy} numberOfLines={2}>Why: {item.whyItMatters}</Text>
) : null}
```

Add a `noteWhy` style beside the existing note styles:
```typescript
  noteWhy: { color: '#6B7280', fontSize: 12, fontStyle: 'italic', marginTop: 2 },
```

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep -E "ObjectsScreen|api.ts|types/index" || echo "no new errors"` and `npx tsc --noEmit 2>&1 | grep -cE "error TS"` → must equal the current baseline (5).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/services/api.ts mobile/src/screens/ObjectsScreen.tsx mobile/src/types/index.ts
git commit -m "feat(mobile): show memory type + why-it-matters on the note view"
```

---

### Task 8: Ship + verify

**Files:** none (deploy + verification).

- [ ] **Step 1: Confirm migration 014 live** (done in Task 2; re-verify)

```bash
PGURL=$(cd backend/api && railway variables --json | jq -r '.DATABASE_PUBLIC_URL')
PGSSLMODE=require psql "$PGURL" -tAc "select column_name from information_schema.columns where table_schema='hub' and table_name='atomic_objects' and column_name in ('why_it_matters','retention_policy','trigger_context') order by 1;"
```
Expected: the 3 column names.

- [ ] **Step 2: Deploy backend + ship mobile**

```bash
git push origin <branch>   # after merge to main
cd mobile && eas update --branch preview --message "feat: memory intent model" --clear-cache
```
Confirm backend deploy SUCCESS + `/health` 200; verify OTA bundle has no `localhost` in the `.hbc` files.

- [ ] **Step 3: End-to-end**

Record a note that is a clear commitment/preference (e.g. "I told Justin I'd send the quote next week"). Then verify in prod:
```bash
PGSSLMODE=require psql "$PGURL" -P pager=off -c "select object_type, why_it_matters, retention_policy, trigger_context, left(coalesce(cleaned_text,content),40) from hub.atomic_objects order by created_at desc limit 3;"
```
Expected: the new note classified (ideally `commitment`), `why_it_matters` populated, `retention_policy`/`trigger_context` derived. On device, open the note and confirm the type + "Why:" line render.

---

## Notes for the implementer

- **Task ordering matters:** Task 2 (migration) must be applied to prod BEFORE Task 6's parser change is deployed, so a `commitment`/`preference`/`concern` insert doesn't hit the (post-migration) CHECK before columns/constraint exist. Within this plan the migration is applied in Task 2, well before deploy in Task 8 — fine.
- **Derive rules live once** in `memoryIntent.ts`; the migration backfill (Task 2) intentionally mirrors them in SQL. If you change one, change both.
- **AtomicObjectRow type:** Task 4 adds `why_it_matters`/`retention_policy`/`trigger_context` to the row interface so the mapper compiles.
- The mobile note view already shows the type via `buildCardSubtitle(objectType, domain)`; Task 7 only adds the new labels + the why line.
