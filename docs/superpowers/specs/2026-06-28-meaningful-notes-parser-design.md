# Design: Meaningful Notes — Smarter Single-Pass Transcript Parser

**Date:** 2026-06-28
**Status:** Approved (design)
**Topic:** Improve the quality of notes generated from voice recordings

## Problem

Notes generated from voice recordings read like "a blob of random small sentences"
instead of meaningful, standalone notes. When testing the app, the notes list looks
messy. The user wants notes to stay **atomic but meaningful** — not a flat feed of
raw fragments.

Four specific problems were identified (all four confirmed by the user):

1. **Too fragmented** — one thought gets chopped into several tiny notes.
2. **Trivial junk becomes notes** — filler/asides ("anyway", "that's about it") become notes.
3. **Note text reads raw** — notes keep literal spoken fragments, often with no title.
4. **No structure / hierarchy** — a flat list of equal-weight blips.

## Root Cause

All four are caused by the **parser step**, and three of them are the *current spec*,
not bugs. Source: `backend/ml-service/app/prompts/transcript_parser.py`.

- **Fragmentation** — the prompt says *"split when the topic OR intent changes"* and
  gives the example *"call Dave AND book the hotel → 2 objects."*
- **Junk** — there is **no significance filter**. Every clause becomes a note.
- **Raw text** — `cleaned_text` rules are STRICT: *"ONLY remove filler... do NOT
  rephrase, expand, or normalize shorthand,"* and `title` is only set when text is
  >15 words (almost never for a quick note).
- **No hierarchy** — objects are created flat and equal.

A key UI fact compounds the problem: the notes list headline is `title || content`
(`mobile/src/screens/ObjectsScreen.tsx`, `renderNoteCard`). When `title` is null —
the common case today — the list falls back to the raw spoken `content`. **This is
the single biggest cause of the "blob of fragments" appearance.** The UI already
renders `type` + `domain` as a subtitle ("Work · Task") and already groups notes by
date (Today / Yesterday / This Week / Earlier). The structural scaffolding exists;
the parser just isn't filling it in well.

## Pipeline Context (unchanged by this work)

```
recording → Deepgram live transcript → (on save) GPT-4o-transcribe re-transcribe
  → transcript_cleaner (local place-name correction)
  → PARSER (this is what we change) → atomic objects → one note each
```

The parser is invoked from `backend/api/src/services/mlService.ts` (`parseTranscript`)
calling the Python ML service `parse_transcript()` in
`backend/ml-service/app/services/parser.py`.

## Approach (chosen: A — Smarter single parser)

Fix all four problems in **one place** — the parser prompt — plus minor default
tweaks in `parser.py`. No new LLM calls, no UI surgery, no architecture change.

Approaches B (two-stage "summarize then extract") and C (parse then polish) were
rejected: B adds latency/cost and risks losing detail in the summary step (the
opposite of the accuracy goal); C adds moving parts for the same outcome as A.

### Change 1 — Consolidate (fixes "too fragmented")

- Replace the rule *"split when topic OR intent changes"* with **"one meaningful
  thread = one note."**
- A task and its directly-related context stay together. Trailing fragments
  (e.g. "...out there too") fold into their parent note instead of spawning their own.
- Genuinely unrelated topics still separate into distinct notes.
- Replace the "call Dave AND book hotel → 2 objects" few-shot framing with examples
  that **consolidate** related content.

### Change 2 — Significance gate (fixes "trivial junk")

- Add an explicit rule: **only emit a note if it carries standalone meaning** — a
  task, reminder, idea, observation, question, decision, reference, or a genuine
  reflection (journal).
- Drop pure filler, conversational glue, false starts, and throwaway asides
  ("anyway", "let me think", "that's about it for now").
- The gate is about **meaning, not length**: "call the supplier" is 3 words and stays.
- Add a few-shot example demonstrating junk being dropped.
- **Guardrail:** must not drop short-but-real items — location reminders
  ("get paper towels when I get to Costco"), quick tasks, and dated reminders are
  meaningful and must survive.

### Change 3 — Clean readable text + always a title (fixes "raw text")

- **Always generate a short, meaningful `title`** for every note. Remove the
  ">15 words" condition. (Biggest UI win — the list shows `title || content`.)
- Loosen `cleaned_text`: allow **light rephrasing into one coherent, readable line**
  — fix grammar, drop false starts/repetition — **while preserving exact place names
  and field/construction shorthand** (drainage inlet, vac truck, Godwin pump,
  Puʻuhale, Middle Street, etc.).
- **`raw_text` stays verbatim** — the speaker's exact words are never lost. This
  preserves the original "preserve field vocabulary" intent; readability lives in
  `cleaned_text` + `title`, the verbatim record lives in `raw_text`.

### Change 4 — Hierarchy (fixes "no structure")

- Delivered by Change 3 (every note now has a clean title) plus reliable `type` /
  `domain` (already rendered as "Work · Task"). Date grouping already exists.
- **Out of scope** (explicit): a new "see all notes from one recording" grouped
  view. `recordingId` already links notes to a session, but a grouped UI is a
  separate feature for later, not part of this fix.

## Files Touched

- `backend/ml-service/app/prompts/transcript_parser.py` — primary change: system
  prompt rules + few-shot examples (consolidation, significance gate, always-title,
  readable `cleaned_text`).
- `backend/ml-service/app/services/parser.py` — only if a validation default needs
  adjusting (e.g. title no longer optional in practice). Keep minimal.

No changes to: `objectService.ts`, the AtomicObject schema, the mobile UI, or the
transcription stages. The rich schema fields (`raw_text`, `cleaned_text`, `title`,
`type`, `domain`, `actionability`, hints) all already exist and are already consumed.

## Verification

Run a handful of representative transcripts through the parser **before/after** and
confirm the output is better on every axis:

1. **Multi-topic brain-dump** — related thoughts consolidate; unrelated ones separate.
2. **Honolulu jobsite dump** — place names and field shorthand preserved exactly in
   `raw_text`; `cleaned_text`/`title` readable.
3. **Filler-heavy recording** — throwaway asides produce **no** notes.
4. **Location reminder** ("...when I get to Costco") — still produces a reminder with
   `geofence_candidate=true` (no regression on the place-reminders feature).

Pass criteria: fewer notes than today for the same input, every note has a
meaningful title, no junk notes, place names + shorthand intact, location reminders
preserved.

## Out of Scope

- Two-stage summarize-then-extract pipeline (rejected approach B).
- Any change to the transcription stages (Deepgram / GPT-4o-transcribe).
- New "notes grouped by recording" UI view.
- Re-processing of historical notes already in the database.
