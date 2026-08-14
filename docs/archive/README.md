# Archive

Superseded planning documents, kept for history. **Nothing in this folder
describes the system as it is today** — several of these files confidently
describe components that were never built or were later replaced.

Current documentation:

- [`/CLAUDE.md`](../../CLAUDE.md) — how the system works
- [`/ARCHITECTURE.md`](../../ARCHITECTURE.md) — components and design rationale
- [`/plans/current-phase.md`](../../plans/current-phase.md) — living project state

## What's in here, and how it went stale

| File | Written | Since superseded by |
|---|---|---|
| `project-context.md` | 2026-03-08 | `/CLAUDE.md`. Described Deepgram-only transcription, claimed synthesis was unbuilt, and listed screens that no longer exist. |
| `HANDOFF.md`, `NEXT_STEPS.md`, `EXECUTIVE_SUMMARY.md` | 2026-01 | `/plans/current-phase.md` |
| `PHASE5_SETUP.md`, `PHASE5_IMPLEMENTATION_SUMMARY.md` | 2026-01 | Phase 5 shipped; see `/ARCHITECTURE.md` |
| `PHASE_6_QUICKSTART.md`, `PHASE_6_PLAN.md`, `PHASE_6_HANDOFF.md` | 2026-01 | Phase 6 shipped; see `/ARCHITECTURE.md` |
| `PHASE_1_REPORT.md`, `phase-3-voice-pipeline.md` | 2026-01 | historical only |
| `TECH_STACK.md` | 2026-01 | `/ARCHITECTURE.md` |
| `plans-handoff.md` | 2026-03 | `/plans/current-phase.md` (was `plans/handoff.md`) |

Notable things these documents get wrong about the current system: a
self-hosted Weaviate and Redis (neither is used), MinIO for storage, Android
back-tap and background-listening triggers, a web dashboard, and end-to-end
encryption.
