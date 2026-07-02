# Phase 8.3 — Person Layer: Design

**Date:** 2026-07-01
**Status:** Approved
**Roadmap:** Phase 8 Memory Layer, slice 3 ("Person layer")

## Problem

The roadmap assumed "the parser can type `person` but ingest flattens it" — investigation shows types never existed: the ml-service emits `entities: List[str]` (plain strings), and `voice.ts` assigns `type: 'other'` to every entity because that's all it has. The TS `Entity` type (`shared-types/index.ts:50`) already supports `'person' | 'place' | 'organization' | ...` but nothing populates it. Result: "what did I promise Justin?" has no person signal beyond raw content text.

## Scope (decided in brainstorm)

- **Capture + AI retrieval.** People become typed entities at ingest and the existing AI sparring/RAG can attribute notes to people. No new screens, no new endpoints.
- **Names as-is.** Person names stored as spoken, matched case-insensitively. No persons table, no alias merging — YAGNI for a single-user app until real confusion shows up.
- **One-shot LLM backfill** so person queries cover the ~166 existing notes.
- **Additive parser field** (`people: List[str]`, default `[]`) rather than restructuring `entities` — backward compatible; an LLM that omits the field still validates. This deliberately avoids the Phase 8.1 failure mode (producer schema drift → parse 500s).

### Non-goals (explicitly deferred)

- `hub.persons` table, canonical identity, alias merging
- People list screen / person aggregation endpoint
- Typing `organization`/`date`/`task` entities (stay `'other'`)
- Person-based push triggers
- Weekly-brief "People to Follow Up" section (slice 8f — builds on this)

## Design

### 1. Parser — additive `people` field (ml-service)

`backend/ml-service/app/models/transcript.py` — `AtomicObjectParsed` gains:

```python
people: List[str] = Field(
    default_factory=list,
    description="People mentioned by name (first name fine); subset of entities",
)
```

`backend/ml-service/app/prompts/transcript_parser.py`:
- One instruction line in the field guide: people = humans mentioned by name; every person in `people` also appears in `entities`.
- Add `"people": [...]` to 2–3 relevant few-shot examples (at minimum the "I told Justin I'd send the quote" commitment example, one multi-person example, and one `"people": []` example). NOT all examples — the Pydantic default covers omission.

**Contract tests (the 8.1 lesson — producer and consumer):**
- pytest: response without `people` validates to `[]`; response with `people` passes through; existing fixtures still validate.
- jest: `mlService` maps `people` through (`ParsedAtomicObject` gains `people: string[]`, mapped with `?? []` at `mlService.ts:83` region).

### 2. Ingest — stop flattening (voice.ts)

At `backend/api/src/routes/voice.ts:161`, type each entity by membership in `people` (case-insensitive):

```ts
const peopleSet = new Set((parsedObject.people ?? []).map((p) => p.toLowerCase()));
const entityObjects = parsedObject.entities.map((name) => ({
  type: peopleSet.has(name.toLowerCase()) ? ('person' as const) : ('other' as const),
  value: name,
  confidence: 1.0,
}));
```

**No DB migration** — `metadata_entities` is JSONB already shaped `{type, value, confidence}`.

### 3. Retrieval — person-aware AI context (sparringService)

- `RetrievedNote` (defined in `sparringService.ts`) gains `people: string[]`.
- `buildContextPack` populates it from the hydrated object's `metadata.entities.filter(e => e.type === 'person').map(e => e.value)`.
- The corpus rendering that feeds the spar LLM adds a `People: <names>` line for notes that have any (same style as existing type/domain/tags lines).

Semantic search already surfaces notes containing a spoken name; this makes attribution explicit so answers to "what did I promise Justin?" cite the right notes and don't confuse who promised what.

### 4. Backfill — one-shot script

New `backend/api/src/scripts/backfill-person-entities.ts` (alongside `generate-embeddings.ts`, run via tsx locally with prod `DATABASE_URL`, never deployed):

1. `SELECT` all non-deleted objects with non-empty `metadata_entities`.
2. Collect distinct entity `value` strings (expected <200).
3. One batched LLM call (existing `callLLM()` util, chunks of ~100): classify each string person / not-person. Deterministic prompt, JSON out.
4. For each object, rewrite `metadata_entities`: entries whose value classified person AND current type is `'other'` → `type: 'person'`. Everything else untouched.
5. Idempotent: re-running finds nothing left to change (already `'person'`) or reclassifies identically. Log a summary (N objects updated, M person names).

### 5. Error handling

- Parser omits `people` → default `[]` → all entities stay `'other'` (today's behavior, no failure).
- `people` contains a name not in `entities` → harmless; typing is by intersection, extra names simply don't match.
- Backfill LLM/API failure → script aborts before any UPDATE (classify fully, then write); safe to rerun.
- No changes to any hot path other than the pure typing map at ingest.

### 6. Testing

- **pytest (ml-service):** `people` default + populated + existing fixtures validate.
- **jest (backend):** mlService mapping (`people ?? []`); voice-route entity typing (person vs other, case-insensitive); `buildContextPack` extracts people and the corpus line renders.
- **On-device after ship:** record "I told Justin I'd send him the pump quote" → DB `metadata_entities` shows `{type:'person', value:'Justin'}` → AI query "what did I promise Justin?" → answer cites the note.

## Files touched

| Area | File | Change |
|---|---|---|
| Parser schema | `backend/ml-service/app/models/transcript.py` | `people` field (additive) |
| Parser prompt | `backend/ml-service/app/prompts/transcript_parser.py` | instruction + 2–3 few-shots |
| ML mapping | `backend/api/src/services/mlService.ts` | `people: string[]` through-map |
| Ingest | `backend/api/src/routes/voice.ts` | entity typing by `people` membership |
| Retrieval | `backend/api/src/services/sparringService.ts` | `RetrievedNote.people` + corpus line |
| Backfill | `backend/api/src/scripts/backfill-person-entities.ts` | new, run-once, local |
