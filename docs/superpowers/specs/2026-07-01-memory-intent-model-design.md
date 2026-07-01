# Memory Intent Model — Design Spec (Phase 8.1)

**Date:** 2026-07-01
**Status:** Approved (design), pending implementation plan
**Slice of:** Phase 8 (Memory Layer). This is slice #1 — the foundation the other five slices (time triggers, person layer, retention/lifespan, unified resurfacing, weekly memory brief) attach to.

## Summary

Enrich the atomic-object model with memory *intent* semantics so future Phase 8 work has the fields it needs. Add three memory types, an LLM-inferred "why it matters" field, and two code-derived classification fields (`retention_policy`, `trigger_context`). Surface the type + "why it matters" read-only on the note view. **No behavior is enforced from these fields in this slice** — later slices consume them.

## Goals

- Add memory types `commitment`, `preference`, `concern` to the closed ontology.
- Capture `why_it_matters` (LLM), `retention_policy` and `trigger_context` (derived) on every new object, and backfill existing rows.
- Show the type + `why_it_matters` on the note view.

## Non-Goals (this slice)

- No enforcement of `retention_policy` (no expiry/auto-archive) or `trigger_context` (no new triggers). Those are later slices.
- No `person`/`topic`/`calendar` trigger detection yet (values reserved in the enum; not populated beyond `place`/`time`/`none`).
- No editing of type/why in the UI (read-only display).
- No re-classification of historical notes by the LLM (backfill is deterministic, code-only).

## Decisions

- `why_it_matters` = **LLM-inferred** (genuine language task: "what future situation makes this useful again"). Nullable.
- `retention_policy`, `trigger_context` = **derived deterministically in code** (reliable, no LLM variance for capture-for-later data).

## Data Model (migration `014`)

Raw-SQL migration in `backend/api/src/db/migrations/014_memory_intent.sql` (idempotent; applied to prod via the documented `psql` flow).

1. **Expand `object_type` CHECK** on `hub.atomic_objects`: drop the existing constraint (defined in `000_base_schema.sql:77`) and re-add it including `commitment`, `preference`, `concern` alongside the current 8 (`task, reminder, idea, observation, question, decision, journal, reference`).
2. **Add columns** (all nullable):
   - `why_it_matters text`
   - `retention_policy text CHECK (retention_policy IN ('temporary','until_done','long_term','decay','user_confirmed'))`
   - `trigger_context text CHECK (trigger_context IN ('place','time','person','topic','calendar','manual','none'))`
3. **Backfill** existing rows deterministically (same rules as the derive functions below), so the model is uniformly populated.

## Derive Rules (code — single source of truth, reused by ingest + the migration backfill)

`retention_policy` from `object_type`:
- `task`, `reminder` → `until_done`
- `preference`, `decision` → `long_term`
- `concern` → `decay`
- `journal`, `observation` → `decay`
- `commitment` → `until_done`
- else (`idea`, `question`, `reference`) → `temporary`

`trigger_context` from existing signals (first match wins):
- has `location_places` (non-empty) OR `location_geofence_candidate` → `place`
- else `temporal_has_date` true → `time`
- else → `none`

(`person`/`topic`/`calendar`/`manual` are valid values but not produced this slice.)

## Components / Flow

1. **Parser** (`backend/ml-service/app/prompts/transcript_parser.py`): add the 3 types to the allowed `type` list + 1–2 few-shot examples that show each new type; add `why_it_matters` to the emitted JSON (short string, nullable) with guidance ("why this is worth remembering / when it'd be useful again").
2. **ML mapping** (`backend/api/src/services/mlService.ts`): map `obj.why_it_matters` → `whyItMatters` (camelCase), pass through the (now-expanded) `type`.
3. **Object creation** (the createObject path used by `routes/voice.ts`; `models/AtomicObject.ts` insert): persist `why_it_matters`; compute + persist `retention_policy` and `trigger_context` via the derive functions (a small `memoryIntent.ts` helper the migration backfill logic mirrors).
4. **TS types** (`backend/api/src/shared-types/index.ts`): extend `ObjectType`; add `whyItMatters?`, `retentionPolicy?`, `triggerContext?` to the `AtomicObject` type.
5. **Mobile UI** (`mobile/src/screens/ObjectsScreen.tsx`): render a small type badge and, when present, a "why it matters" line under the note text. Read-only.

## Error Handling / Edge Cases

- `why_it_matters` absent from LLM output → store null (no failure).
- Unknown/legacy `object_type` on old rows → backfill `retention_policy`/`trigger_context` with the `else` branches; never error.
- Migration re-run → idempotent (guard column adds with `IF NOT EXISTS`; constraint swap is safe to repeat).
- The 3 new types must be added to the DB CHECK **before** any object with a new type is inserted (migration precedes deploy of the parser change) — or the insert 500s. Order: apply migration, then deploy.

## Testing

- **Derive functions** (unit): `retentionPolicyFor(type)` — a case per type incl. new ones + `else`; `triggerContextFor(signals)` — place (via places), place (via geofence_candidate), time, none.
- **ML mapping** (unit): `why_it_matters` → `whyItMatters` passthrough; new type value passes through.
- **Object creation** (unit/integration where the repo already tests createObject): new fields persisted; retention/trigger computed.
- **Migration**: after apply, columns + CHECK exist; backfill populated non-null `retention_policy`/`trigger_context` for existing rows (spot-count).
- **Mobile**: typecheck (baseline unchanged); the badge + why line render when fields present and are absent when null.

## Files

- New: `backend/api/src/db/migrations/014_memory_intent.sql`, `backend/api/src/services/memoryIntent.ts` (derive helpers), tests under `backend/api/src/__tests__/`.
- Edit: `backend/ml-service/app/prompts/transcript_parser.py`, `backend/api/src/services/mlService.ts`, `backend/api/src/shared-types/index.ts`, the createObject path (`backend/api/src/routes/voice.ts` and/or `models/AtomicObject.ts`), `mobile/src/screens/ObjectsScreen.tsx` (+ the mobile object type if separate).

## Rollout

- Backend deploys on merge to `main` (Railway). **Apply migration 014 to prod before/with the deploy** (raw-SQL system is not auto-applied; must precede the parser change so new-type inserts don't violate the old CHECK).
- Mobile ships via `eas update` (preview) `--clear-cache`; verify bundle.
