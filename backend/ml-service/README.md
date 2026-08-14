# ml-service

**The name is misleading. This service does no machine learning.**

No model is trained here, and none runs here. It is a small FastAPI app whose
whole job is to turn one raw voice transcript into a list of structured notes,
using a carefully-built prompt sent to OpenAI or Anthropic over HTTP. The
intelligence is rented, not resident.

The name is a fossil from the original plan, when Whisper and sentence
embeddings were going to run locally in this process. Transcription moved to
Deepgram + OpenAI, embeddings moved to the Node API, and this was left holding
one job. It kept the name — and, until August 2026, kept installing torch, CUDA,
transformers and spaCy for nothing, which is why its deploys took twenty minutes.

## Its one job

```
backend/api                      ml-service                    OpenAI / Anthropic
     │                                │                                │
     │  POST /api/v1/parse-transcript │                                │
     ├───────────────────────────────►│                                │
     │   { transcript, user_id,       │  Layer B: clean the text       │
     │     session_id, location }     │  (local, deterministic)        │
     │                                │                                │
     │                                │  build prompt, call the LLM    │
     │                                ├───────────────────────────────►│
     │                                │◄───────────────────────────────┤
     │                                │  parse JSON → typed objects    │
     │◄───────────────────────────────┤                                │
     │   { atomic_objects[], … }      │                                │
```

You say: *"Pick up chicken from Costco, remind me to call the accountant Tuesday
at 3, my knee's been bothering me."*

It returns three separate objects, each with a `type`, a `domain`, tags,
entities, people, temporal hints, location hints, actionability, a confidence
score, and a `why_it_matters`. The Node API takes it from there — deciding
retention policy, arming geofences and reminders, and generating embeddings.

## The two layers

### Layer B — transcript cleanup (local, no LLM)

`app/services/transcript_cleaner.py` + `app/data/vocabulary.json`

Pure string matching against a hand-built Hawaii/Honolulu vocabulary: 19 place
names and 20 construction terms, each with the ways speech-to-text tends to
mangle them.

- **Exact alias match** — `"pooholly"`, `"poohale"`, `"pu uhale"` → `Puʻuhale`
- **Fuzzy single-word match** — words ≥6 chars at ≥0.88 similarity, catching
  ASR variants not explicitly listed

This is the part that makes the app usable for your actual work vocabulary:
`Waiakamilo`, `Dillingham`, `trench plate`, `drainage inlet` (which ASR loves to
hear as *"draining let"*). Corrections are returned alongside the cleaned text so
they can be audited.

There is a companion **Layer A** that lives in the *Node API*, not here:
`backend/api/src/config/keywords.ts` feeds a keyterm list into the Deepgram
WebSocket URL so the recognizer is biased toward these words *while you speak*.
Layer A prevents the error; Layer B repairs what slips through.

### The LLM parse

`app/services/parser.py` + `app/prompts/transcript_parser.py`

- Model from `LLM_MODEL` (default `gpt-4o`); a value starting with `claude`
  switches it to the Anthropic API.
- Transcripts over **1200 characters are split** and parsed as up to **4
  parallel chunks**, then stitched back with `sequence_index` and
  `context_inherited_from` preserved — so a five-minute ramble doesn't blow the
  latency budget or the context window.
- **90-second LLM timeout.** The Node API's client timeout is deliberately
  higher at 105s: nested budgets that don't decrease inward can never surface
  the inner error, which was a real bug when both sat at 60s.
- Objects scoring **confidence < 0.75** are flagged `needs_review`, and the
  response carries a `needs_review_count`.

## The output shape

Per object: `raw_text`, `cleaned_text`, `title`, `type`, `domain`, `tags`,
`entities`, `people`, `confidence`, `temporal_hints` (has_date, date_text,
urgency), `location_hints` (places, geofence_candidate), `actionability`
(is_actionable, next_action), `sequence_index`, `why_it_matters`, `needs_review`.

The `type` literal must stay in sync with the TypeScript `ObjectType` union in
`backend/api` — there's a comment in `app/models/transcript.py` marking it.

## Endpoints

| Endpoint | Does |
|---|---|
| `POST /api/v1/parse-transcript` | The real one. Transcript → atomic objects. |
| `GET /health` | Railway healthcheck |
| `GET /` | Service info |

All non-health routes require an `X-Service-Key` header matching
`ML_SERVICE_API_KEY`. The service has a public Railway domain, so that
middleware is the only thing in front of it.

Correction feedback used to live here too, appending JSONL to
`CORRECTIONS_LOG_PATH`. It moved to the Node API (`POST /api/v1/corrections`,
migration 022): corrections are user data about atomic objects, so they belong
with the service that owns those objects, their per-user auth, and a durable
database. This one stays stateless.

## Running it

```bash
pip install -r requirements-dev.txt        # runtime deps + pytest/black/ruff
uvicorn main:app --reload                  # or: python main.py
pytest                                     # 72 tests
```

Deploys to Railway on push to `main` when `backend/ml-service/**` changes
(`watchPatterns` in `railway.toml`). Builds with nixpacks — there is no
Dockerfile.

**Environment:** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `LLM_MODEL`,
`ML_SERVICE_API_KEY` (checked as `X-Service-Key`), `ALLOWED_ORIGINS`, `PORT`.

## One thing to know

**Keep `requirements.txt` honest.** Everything in it should be imported. The
whole local-inference stack sat here unused for months, costing a 6.3GB image
and ~20-minute deploys. Current imports: `fastapi`, `uvicorn`, `pydantic`,
`httpx`, `python-dotenv`, and stdlib. The `httpx<0.28` cap is load-bearing —
see the comment above it before raising it.

## If you ever want real ML here

This is the natural home for it, and the training data now has somewhere to
land: `hub.object_corrections` in the API stores `(original_value,
corrected_value)` pairs per field, durably. Nothing produces them yet — the app
has no correction UI — and nothing consumes them. Build the UI first; the
labelled pairs will accumulate on their own after that.
