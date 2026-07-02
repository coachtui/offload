# Phase 8.3 Person Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Person names become typed entities at ingest and the AI sparring corpus attributes notes to people, so "what did I promise Justin?" answers correctly — plus a one-shot backfill over existing notes.

**Architecture:** Additive `people: List[str]` field on the ml-service parser output (default `[]` — omission-safe, avoiding the Phase 8.1 producer-drift 500s); a pure `entityTyping.ts` service types entities by membership in `people` at voice ingest (no DB migration — `metadata_entities` JSONB already fits); `buildContextPack`/`formatNotesForPrompt` carry a `People:` line into the spar LLM prompt; a run-once local script LLM-classifies existing entity strings.

**Tech Stack:** Python/Pydantic + pytest (ml-service), Node/TypeScript + jest (backend/api), PostgreSQL JSONB, existing `callLLM` (Anthropic/OpenAI fallback). **No mobile changes, no migration, no OTA needed this slice.**

**Spec:** `docs/superpowers/specs/2026-07-01-person-layer-design.md`

## Global Constraints

- Work on branch `feature/person-layer` off `main`.
- Parser field is ADDITIVE: `people: List[str]` with `default_factory=list` — an LLM response omitting it MUST still validate.
- Every name in `people` also appears in `entities` (prompt rule); typing is by case-insensitive intersection, so extra/missing names degrade gracefully (stay `'other'`), never error.
- Only `person` typing this slice — all other entities remain `'other'`. No persons table, no new screens/endpoints.
- The parser model class is `AtomicObjectParsed` (`backend/ml-service/app/models/transcript.py`); the few-shot EXAMPLE_*_OUTPUT constants are spec-by-example — pytest auto-validates them.
- Baselines: jest 197 tests pass (1 pre-existing suite-level compile failure in `voiceSessionService.test.ts` — out of scope); backend `npx tsc --noEmit` has exactly 5 pre-existing errors (`voiceSessionService.ts`); ml-service pytest 58 pass. "Clean" = no NEW failures/errors.
- ml-service and backend/api deploy as separate Railway services — both redeploy from main on merge; ship order doesn't matter (backend tolerates missing `people`, parser emitting `people` to an old backend is ignored harmlessly).

---

### Task 1: ml-service — `people` field, prompt, pytest contract

**Files:**
- Modify: `backend/ml-service/app/models/transcript.py` (the `AtomicObjectParsed` class — `entities` field is at ~line 43)
- Modify: `backend/ml-service/app/prompts/transcript_parser.py` (schema template ~line 88; field guide ~line 126; `EXAMPLE_6_OUTPUT` at ~line 424)
- Test: `backend/ml-service/tests/test_transcript_parser.py` (append)

**Interfaces:**
- Produces: `AtomicObjectParsed.people: List[str]` (default `[]`) in the parser's JSON output (snake_case `"people"`). Task 2 maps it into the backend.

- [ ] **Step 1: Write the failing tests**

Append to `backend/ml-service/tests/test_transcript_parser.py`:

```python
# ─── Phase 8.3: people field ──────────────────────────────────────────────

def test_people_defaults_to_empty_list_when_omitted():
    """An LLM response without `people` must still validate (additive contract)."""
    data = json.loads(tp.EXAMPLE_6_OUTPUT)["atomic_objects"][0].copy()
    data.pop("people", None)
    obj = AtomicObjectParsed(**data)
    assert obj.people == []


def test_people_passes_through_when_present():
    data = json.loads(tp.EXAMPLE_6_OUTPUT)["atomic_objects"][0].copy()
    data["people"] = ["Justin", "Chris"]
    obj = AtomicObjectParsed(**data)
    assert obj.people == ["Justin", "Chris"]


def test_example_6_commitment_lists_justin_as_person():
    """The Justin commitment few-shot is the people-field spec-by-example."""
    objs = _load(tp.EXAMPLE_6_OUTPUT)
    assert objs[0].people == ["Justin"]
    assert "Justin" in objs[0].entities  # people ⊆ entities rule
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/tui/offload/backend/ml-service && python3 -m pytest tests/test_transcript_parser.py -q 2>&1 | tail -5`
Expected: the two assertion tests FAIL (`AtomicObjectParsed` has no attribute `people`); `test_example_6...` FAILS (`people` missing from example).

- [ ] **Step 3: Add the model field**

In `backend/ml-service/app/models/transcript.py`, in `AtomicObjectParsed`, directly after the `entities` field:

```python
    people: List[str] = Field(
        default_factory=list,
        description="People mentioned by name (first name fine); subset of entities",
    )
```

- [ ] **Step 4: Update the prompt**

In `backend/ml-service/app/prompts/transcript_parser.py`:

1. **Schema template** (the JSON block near line 88 that shows `"entities": ["Person Name", "Place Name", "Org Name"],`) — add directly below that line:
```
      "people": ["Person Name"],
```

2. **Field guide** (near line 126, after the `- entities:` instruction line) — add:
```
- people: humans mentioned by name (first name fine) — every name here MUST also appear in entities; use [] when no people are mentioned
```

3. **EXAMPLE_6_OUTPUT** (~line 424, the "I told Justin…" example) — add a `"people"` line after each `"entities"` line:
   - first object (`"entities": ["Justin"]`) → `"people": ["Justin"],`
   - second object (`"entities": []`, daughter/AAC) → `"people": [],`
   - third object (Bedrock concern) → `"people": [],`

4. Pick ONE more example that contains a person name in `entities` (search the EXAMPLE_*_OUTPUT constants; e.g. any example whose entities include a first name) and add the matching `"people": [...]` lines to ALL objects in that example (names for person entities, `[]` otherwise). If no other example has a person entity, skip — EXAMPLE_6 plus the `[]` cases suffice; note which you did in your report.

Do NOT add `"people"` to every example — the Pydantic default covers omission, and the omission case is itself part of the contract.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/tui/offload/backend/ml-service && python3 -m pytest tests/ -q 2>&1 | tail -5`
Expected: all pass (58 baseline + 3 new = 61; the existing example-validation tests re-validate every EXAMPLE_*_OUTPUT you touched).

- [ ] **Step 6: Commit**

```bash
cd /Users/tui/offload && git add backend/ml-service/app/models/transcript.py backend/ml-service/app/prompts/transcript_parser.py backend/ml-service/tests/test_transcript_parser.py && git commit -m "feat(person-layer): additive people field in parser output + few-shot spec"
```

---

### Task 2: Backend mapping — `people` through mlService

**Files:**
- Modify: `backend/api/src/services/mlService.ts` (`ParsedAtomicObject` interface ~line 15-30; `mapParsedObject` ~line 75-95)
- Test: `backend/api/src/__tests__/services/mlServicePeople.test.ts` (create; mirrors `mlServiceWhy.test.ts` style)

**Interfaces:**
- Consumes: parser JSON with optional `people: string[]` (snake_case `"people"` — same word, no case mapping needed).
- Produces: `ParsedAtomicObject.people: string[]` (never undefined — `?? []`). Task 3's voice ingest reads `parsedObject.people`.

- [ ] **Step 1: Write the failing test**

Create `backend/api/src/__tests__/services/mlServicePeople.test.ts`:

```ts
import { mapParsedObject } from '../../services/mlService';

describe('mlService mapping — people field', () => {
  it('maps people through when the parser provides it', () => {
    const mapped = mapParsedObject(
      { cleaned_text: 'Send Justin the quote', type: 'commitment', entities: ['Justin'], people: ['Justin'], confidence: 0.9 },
      0
    );
    expect(mapped.people).toEqual(['Justin']);
  });

  it('defaults people to [] when the parser omits it (old parser tolerance)', () => {
    const mapped = mapParsedObject(
      { cleaned_text: 'buy milk', type: 'task', entities: [], confidence: 0.9 },
      0
    );
    expect(mapped.people).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/tui/offload/backend/api && npx jest mlServicePeople --verbose 2>&1 | tail -10`
Expected: FAIL — `mapped.people` is `undefined` (property doesn't exist yet). If TypeScript blocks compilation instead, that's the same RED signal.

- [ ] **Step 3: Add the field and mapping**

In `backend/api/src/services/mlService.ts`:

1. `ParsedAtomicObject` interface — after `entities: string[]; // Named entity strings`:
```ts
  people: string[]; // Names from entities that are people (parser-typed)
```

2. `mapParsedObject` — after `entities: obj.entities ?? [],`:
```ts
    people: obj.people ?? [],
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd /Users/tui/offload/backend/api && npx jest mlServicePeople mlServiceWhy --verbose 2>&1 | tail -10 && npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: both suites pass; tsc error count is exactly `5` (pre-existing baseline).

- [ ] **Step 5: Commit**

```bash
cd /Users/tui/offload && git add backend/api/src/services/mlService.ts backend/api/src/__tests__/services/mlServicePeople.test.ts && git commit -m "feat(person-layer): map parser people field into ParsedAtomicObject"
```

---

### Task 3: Entity typing at ingest — `entityTyping.ts` + voice.ts

**Files:**
- Create: `backend/api/src/services/entityTyping.ts`
- Modify: `backend/api/src/routes/voice.ts:160-165` (the `entityObjects` mapping)
- Test: `backend/api/src/__tests__/services/entityTyping.test.ts`

**Interfaces:**
- Consumes: `ParsedAtomicObject.people: string[]` from Task 2; `Entity` type from `../shared-types` (`{ type: 'person' | 'place' | 'organization' | 'task' | 'date' | 'other'; value: string; confidence: number }`).
- Produces: `typeEntities(names: string[], people: string[]): Entity[]` and `extractPeople(entities?: Entity[] | null): string[]`. Task 4 uses `extractPeople`.

- [ ] **Step 1: Write the failing test**

Create `backend/api/src/__tests__/services/entityTyping.test.ts`:

```ts
import { typeEntities, extractPeople } from '../../services/entityTyping';

describe('typeEntities', () => {
  it('types an entity person when it appears in people', () => {
    const result = typeEntities(['Justin', 'Costco'], ['Justin']);
    expect(result).toEqual([
      { type: 'person', value: 'Justin', confidence: 1.0 },
      { type: 'other', value: 'Costco', confidence: 1.0 },
    ]);
  });

  it('matches case-insensitively but preserves the spoken casing', () => {
    const result = typeEntities(['justin'], ['Justin']);
    expect(result).toEqual([{ type: 'person', value: 'justin', confidence: 1.0 }]);
  });

  it('types everything other when people is empty', () => {
    expect(typeEntities(['Justin'], []).every((e) => e.type === 'other')).toBe(true);
  });

  it('ignores people names that are not in entities', () => {
    expect(typeEntities(['Costco'], ['Justin'])).toEqual([
      { type: 'other', value: 'Costco', confidence: 1.0 },
    ]);
  });
});

describe('extractPeople', () => {
  it('returns person entity values only', () => {
    expect(
      extractPeople([
        { type: 'person', value: 'Justin', confidence: 1 },
        { type: 'other', value: 'Costco', confidence: 1 },
      ])
    ).toEqual(['Justin']);
  });

  it('handles undefined/null/empty', () => {
    expect(extractPeople(undefined)).toEqual([]);
    expect(extractPeople(null)).toEqual([]);
    expect(extractPeople([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/tui/offload/backend/api && npx jest entityTyping --verbose 2>&1 | tail -10`
Expected: FAIL — "Cannot find module '../../services/entityTyping'"

- [ ] **Step 3: Write the service**

Create `backend/api/src/services/entityTyping.ts`:

```ts
/**
 * Entity typing from the parser's people list. The parser emits entities as
 * plain strings plus a `people` subset; membership (case-insensitive) is what
 * makes an entity a 'person' — everything else stays 'other' this slice.
 */
import type { Entity } from '../shared-types';

export function typeEntities(names: string[], people: string[]): Entity[] {
  const peopleSet = new Set(people.map((p) => p.toLowerCase()));
  return names.map((name) => ({
    type: peopleSet.has(name.toLowerCase()) ? ('person' as const) : ('other' as const),
    value: name,
    confidence: 1.0,
  }));
}

export function extractPeople(entities?: Entity[] | null): string[] {
  return (entities ?? []).filter((e) => e.type === 'person').map((e) => e.value);
}
```

(If the `Entity` import path `'../shared-types'` doesn't resolve, check how `backend/api/src/routes/voice.ts` or `models/AtomicObject.ts` imports `Entity` and match it.)

- [ ] **Step 4: Wire into voice ingest**

In `backend/api/src/routes/voice.ts`, replace the flattening block (~line 160):

```ts
            // Convert entity names to Entity[] for metadata storage
            const entityObjects = parsedObject.entities.map((name) => ({
              type: 'other' as const,
              value: name,
              confidence: 1.0,
            }));
```

with:

```ts
            // Type entities using the parser's people list (person vs other)
            const entityObjects = typeEntities(parsedObject.entities, parsedObject.people);
```

and add the import alongside the other service imports at the top of the file:

```ts
import { typeEntities } from '../services/entityTyping';
```

- [ ] **Step 5: Run tests + typecheck**

Run: `cd /Users/tui/offload/backend/api && npx jest entityTyping --verbose 2>&1 | tail -10 && npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 6 tests pass; tsc count exactly `5`.

- [ ] **Step 6: Commit**

```bash
cd /Users/tui/offload && git add backend/api/src/services/entityTyping.ts backend/api/src/__tests__/services/entityTyping.test.ts backend/api/src/routes/voice.ts && git commit -m "feat(person-layer): type person entities at voice ingest"
```

---

### Task 4: Person-aware AI context — sparringService

**Files:**
- Modify: `backend/api/src/services/sparringService.ts` (`RetrievedNote` interface at ~line 19; the `retrieved` mapping at ~line 128-143; `formatNotesForPrompt` at ~line 224)
- Test: `backend/api/src/__tests__/services/sparringPeople.test.ts`

**Interfaces:**
- Consumes: `extractPeople` from Task 3 (`import { extractPeople } from './entityTyping';`).
- Produces: `RetrievedNote.people: string[]`; `formatNotesForPrompt` becomes exported and renders a `People: <names>` line.

- [ ] **Step 1: Write the failing test**

Create `backend/api/src/__tests__/services/sparringPeople.test.ts`:

```ts
import { formatNotesForPrompt, RetrievedNote } from '../../services/sparringService';

function note(overrides: Partial<RetrievedNote>): RetrievedNote {
  return {
    objectId: 'o1',
    score: 0.9,
    title: 'Send Justin the quote',
    cleanedText: 'Send Justin the quote by next week (promised)',
    rawText: null,
    type: 'commitment',
    domain: 'work',
    tags: ['quote'],
    createdAt: '2026-07-01T00:00:00.000Z',
    sourceTranscriptId: null,
    isActionable: true,
    nextAction: null,
    people: [],
    ...overrides,
  } as RetrievedNote;
}

describe('formatNotesForPrompt — people line', () => {
  it('renders a People line when the note has person entities', () => {
    const text = formatNotesForPrompt([note({ people: ['Justin', 'Chris'] })]);
    expect(text).toContain('People: Justin, Chris');
  });

  it('omits the People line when there are none', () => {
    const text = formatNotesForPrompt([note({ people: [] })]);
    expect(text).not.toContain('People:');
  });
});
```

Note: `RetrievedNote` has more fields than `formatNotesForPrompt` uses; the `note()` helper's `as RetrievedNote` cast keeps the fixture honest for the fields that matter. If the interface has fields not listed here, add them to the fixture rather than loosening the cast further.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/tui/offload/backend/api && npx jest sparringPeople --verbose 2>&1 | tail -10`
Expected: FAIL — `formatNotesForPrompt` is not exported (and `people` not on `RetrievedNote`).

- [ ] **Step 3: Implement**

In `backend/api/src/services/sparringService.ts`:

1. `RetrievedNote` interface (~line 19) — add after the `tags` field:
```ts
  people: string[];
```

2. Import at top, with the other service imports:
```ts
import { extractPeople } from './entityTyping';
```

3. The `retrieved` mapping inside `buildContextPack` (~line 137, after `tags: obj.metadata?.tags ?? [],`):
```ts
      people: extractPeople(obj.metadata?.entities),
```

4. `formatNotesForPrompt` (~line 224): change `function formatNotesForPrompt` to `export function formatNotesForPrompt`, and in its `lines` array add after the Tags line:
```ts
        note.people.length > 0 ? `People: ${note.people.join(', ')}` : null,
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd /Users/tui/offload/backend/api && npx jest sparringPeople --verbose 2>&1 | tail -10 && npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: 2 tests pass; tsc exactly `5`. If other files construct `RetrievedNote` literals and now fail compilation, add `people: []` (or a real extraction) there and report it.

- [ ] **Step 5: Commit**

```bash
cd /Users/tui/offload && git add backend/api/src/services/sparringService.ts backend/api/src/__tests__/services/sparringPeople.test.ts && git commit -m "feat(person-layer): People line in spar context pack"
```

---

### Task 5: One-shot backfill script

**Files:**
- Modify: `backend/api/src/services/sparringService.ts` (export `callLLM`, ~line 250)
- Modify: `backend/api/package.json` (add script entry)
- Create: `backend/api/src/scripts/backfill-person-entities.ts`

**Interfaces:**
- Consumes: `callLLM(systemPrompt: string, userMessage: string): Promise<string>` (currently private in sparringService — this task exports it); `pool` from `../db/connection`.
- Produces: `npm run backfill-person-entities` — run-once, local only, never deployed. No test file (run-once script; codebase precedent: `generate-embeddings.ts` has none). Verification is the run itself plus a SQL check.

- [ ] **Step 1: Export callLLM**

In `backend/api/src/services/sparringService.ts` (~line 250): `async function callLLM(` → `export async function callLLM(`.

- [ ] **Step 2: Add the npm script**

In `backend/api/package.json` scripts, after `"generate-embeddings"`:
```json
    "backfill-person-entities": "tsx src/scripts/backfill-person-entities.ts"
```

- [ ] **Step 3: Write the script**

Create `backend/api/src/scripts/backfill-person-entities.ts`:

```ts
/**
 * One-shot backfill: LLM-classify existing entity strings and retype
 * metadata_entities entries from 'other' to 'person'.
 *
 * Usage (local only, never deployed):
 *   DATABASE_URL=<prod-public-url> npm run backfill-person-entities
 * Requires ANTHROPIC_API_KEY or OPENAI_API_KEY in the environment.
 *
 * Safe to re-run: classification happens fully BEFORE any write; entries
 * already typed 'person' are left alone.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { pool } from '../db/connection';
import { callLLM } from '../services/sparringService';

interface EntityEntry {
  type: string;
  value: string;
  confidence: number;
}

interface Row {
  id: string;
  metadata_entities: EntityEntry[];
}

const SYSTEM_PROMPT =
  'You classify strings. Reply with ONLY a JSON array (no prose) containing the subset of the input strings that are names of individual people — first names, full names, or nicknames. Exclude companies, places, products, job roles, and generic words.';

const CHUNK_SIZE = 100;

async function main(): Promise<void> {
  const { rows } = await pool.query<Row>(
    `SELECT id, metadata_entities
     FROM hub.atomic_objects
     WHERE deleted_at IS NULL
       AND metadata_entities IS NOT NULL
       AND jsonb_array_length(metadata_entities) > 0`
  );

  const distinct = [...new Set(rows.flatMap((r) => r.metadata_entities.map((e) => e.value)))];
  console.log(`${rows.length} objects with entities; ${distinct.length} distinct strings`);
  if (distinct.length === 0) {
    await pool.end();
    return;
  }

  // Classify everything BEFORE writing anything — an LLM failure aborts cleanly.
  const persons = new Set<string>();
  for (let i = 0; i < distinct.length; i += CHUNK_SIZE) {
    const chunk = distinct.slice(i, i + CHUNK_SIZE);
    const reply = await callLLM(SYSTEM_PROMPT, JSON.stringify(chunk));
    const match = reply.match(/\[[\s\S]*\]/);
    if (!match) throw new Error(`Unparseable LLM reply: ${reply.slice(0, 200)}`);
    for (const name of JSON.parse(match[0]) as string[]) {
      persons.add(name.toLowerCase());
    }
  }
  console.log(`Classified ${persons.size} person names:`, [...persons].sort().join(', '));

  let updated = 0;
  for (const row of rows) {
    let changed = false;
    const next = row.metadata_entities.map((e) => {
      if (e.type === 'other' && persons.has(e.value.toLowerCase())) {
        changed = true;
        return { ...e, type: 'person' };
      }
      return e;
    });
    if (changed) {
      await pool.query(
        'UPDATE hub.atomic_objects SET metadata_entities = $1 WHERE id = $2',
        [JSON.stringify(next), row.id]
      );
      updated++;
    }
  }
  console.log(`Updated ${updated} objects`);
  await pool.end();
}

main().catch((err) => {
  console.error('[backfill-person-entities] failed:', err);
  process.exit(1);
});
```

Verify the column really is jsonb before running (`jsonb_array_length` fails on json/text): `psql "<prod-public-url>" -c "SELECT data_type FROM information_schema.columns WHERE table_schema='hub' AND table_name='atomic_objects' AND column_name='metadata_entities';"` — if it reports `json` (not `jsonb`), use `json_array_length` in the SELECT instead and report the substitution.

- [ ] **Step 4: Typecheck + run against prod**

```bash
cd /Users/tui/offload/backend/api && npx tsc --noEmit 2>&1 | grep -c "error TS"
```
Expected: exactly `5`.

Then run (prod DB public URL is in `plans/handoff.md` §Database Connection; the LLM key comes from Railway since there is no local `.env`):

```bash
cd /Users/tui/offload/backend/api && \
DATABASE_URL="postgresql://postgres:NXUQcCsnJqrLfsCxzGSbdnVfRuluXLCu@metro.proxy.rlwy.net:57046/railway" \
ANTHROPIC_API_KEY="$(railway variables --service brain-dump --kv 2>/dev/null | grep '^ANTHROPIC_API_KEY=' | cut -d= -f2-)" \
npm run backfill-person-entities
```

Expected: logs `N objects with entities; M distinct strings`, the classified person list, `Updated K objects`. If the railway CLI produces no key, STOP and report BLOCKED (the controller/user provides the key) — do not skip the run silently.

- [ ] **Step 5: Verify in prod**

```bash
psql "postgresql://postgres:NXUQcCsnJqrLfsCxzGSbdnVfRuluXLCu@metro.proxy.rlwy.net:57046/railway" -c "SELECT count(*) FROM hub.atomic_objects, jsonb_array_elements(metadata_entities) e WHERE e->>'type'='person' AND deleted_at IS NULL;"
```
Expected: a positive count (matching the run's summary). Spot-check one row: `SELECT left(content,60), metadata_entities FROM hub.atomic_objects, jsonb_array_elements(metadata_entities) e WHERE e->>'type'='person' AND deleted_at IS NULL LIMIT 3;`

- [ ] **Step 6: Commit**

```bash
cd /Users/tui/offload && git add backend/api/src/services/sparringService.ts backend/api/package.json backend/api/src/scripts/backfill-person-entities.ts && git commit -m "feat(person-layer): one-shot LLM backfill for person entities (run against prod)"
```

---

### Task 6: Whole-branch verification

**Files:** none new.

- [ ] **Step 1: Full suites + typechecks**

Run: `cd /Users/tui/offload/backend/api && npx tsc --noEmit 2>&1 | grep -c "error TS" && npm test 2>&1 | tail -5`
Expected: tsc exactly `5`; all tests pass (197 baseline + ~10 new; the 1 pre-existing suite-level failure unchanged).

Run: `cd /Users/tui/offload/backend/ml-service && python3 -m pytest tests/ -q 2>&1 | tail -3`
Expected: all pass (61).

- [ ] **Step 2: Scope check**

Run: `cd /Users/tui/offload && git diff main --stat -- backend/ml-service mobile`
Expected: ml-service shows ONLY `app/models/transcript.py`, `app/prompts/transcript_parser.py`, `tests/test_transcript_parser.py`; mobile shows NOTHING.

- [ ] **Step 3: Report**

Summarize test counts, the backfill run results (N/M/K numbers), and any deviations. Do NOT merge/deploy — handled by finishing-a-development-branch, followed by on-device verification: record "I told Justin I'd send him the pump quote" → `metadata_entities` shows `{type:'person', value:'Justin'}` in prod DB → ask the AI "what did I promise Justin?" → answer cites the note.
