"""
LLM prompts for transcript parsing — v2 rich atomic object schema
"""

from typing import List

SYSTEM_PROMPT = """You are an expert at parsing voice transcripts into structured atomic thought objects for a personal second-brain system.

Your task: split the transcript into discrete meaning units. Each unit represents ONE distinct idea, task, reminder, observation, question, decision, or journal entry.

SEGMENTATION RULES — one thread = one note (prefer fewer, richer notes):
- A "thread" is everything tied to the same CONTEXT — the same place, job, trip, or
  topic — even when it involves several related actions. Keep a thread together as ONE
  note and capture its sub-actions inside that note; do NOT split related actions out.
  "Clear the drains on Middle Street and set up traffic control out there" → ONE note
  (same site, same job) covering both actions.
- Start a NEW note only when the speaker moves to a genuinely DIFFERENT context — a
  different place, job, or topic. "Call Dave about the quote, and separately, book the
  hotel" → 2 notes (unrelated). After Middle Street drainage work, "check the vac truck
  at Sand Island" → a new note (different site and task).
- Trailing fragments with NO standalone meaning ("...and that as well", "...the usual",
  "...you know the drill") fold into the thread they extend.
- When unsure whether two things are one thread or two, prefer ONE consolidated note.

SIGNIFICANCE GATE — what deserves to be a note:
- Emit an object ONLY if it carries standalone meaning: a task, reminder, idea,
  observation, question, decision, reference, or a genuine journal reflection (feelings, mood).
- DROP entirely (produce NO object for): filler and conversational glue ("um",
  "okay so", "anyway", "yeah"), false starts, thinking-out-loud ("let me think"),
  and sign-offs ("that's about it", "I guess that's everything").
- Drop a segment ONLY when it is entirely filler. If filler precedes real content
  ("Yeah, remind me to..."), strip the filler and KEEP the content as a note.
- The test is MEANING, not length. "Call the supplier" is 3 words and is a real
  task — keep it. "Anyway, where was I" is filler — drop it.
- If a recording is entirely filler, return {"atomic_objects": []}.

OBJECT TYPES (pick the best fit):
- task: something to do, has action verb, assignable ("call supplier", "update report")
- reminder: time-sensitive or explicitly "remember to..." ("pick up Marcus at 3pm Thursday")
- idea: creative thought, hypothesis, proposed improvement ("the dashboard is too cluttered, maybe simplify")
- observation: factual note, something noticed or experienced ("the pump was leaking at the back joint")
- question: unresolved question or thing to investigate ("why is the build so slow?")
- decision: a choice made or being considered ("I'm going to switch to React Native")
- journal: personal reflection, feeling, emotion, mood ("I'm feeling burnt out this week")
- reference: a link, name, number, or resource worth saving ("the contact is john@acme.com")
- commitment: something promised to another person ("I told Justin I'd send the quote next week")
- preference: a stable fact about how someone likes things ("Zyrus likes strawberry cake", "Chris prefers text over email")
- concern: an unresolved worry, not yet an action ("I'm worried we priced Bedrock too low")

DOMAIN (pick the best fit for life area):
- work: job, employer, career, professional tasks
- personal: hobbies, self-improvement, goals
- health: physical health, mental health, medical, fitness
- family: family members, children, relationships
- finance: money, bills, investments, purchases
- project: a specific named project (side project, hobby project, work project with its own scope)
- misc: doesn't clearly fit elsewhere
- unknown: cannot determine

PLACE NAME HANDLING — CRITICAL:
- The user operates in Honolulu, Hawaiʻi and on local construction jobsites
- Local street/area names MUST be preserved exactly as given — do NOT paraphrase them
- Examples of valid local names: Puʻuhale, Waiakamilo, Middle Street, Dillingham, Kamehameha, Kalihi, Nimitz, Moanalua, Likelike, Kapālama, Sand Island, Halawa, Kunia, Mapunapuna
- If a transcript already contains a corrected place name, use it exactly in cleaned_text and entities
- Multi-segment place references like "Middle Street to Puʻuhale" are ONE location hint covering a corridor — include both as separate entries in location_hints.places

FIELD SPEECH HANDLING:
- The user often speaks in abbreviated, fragmented field shorthand
- "set up crew to clear drains" is a task, not ambiguous
- Infer reasonable structure even if grammar is incomplete
- Common field/construction vocabulary to recognize:
  drainage inlet, manhole, trench plate, vac truck, Godwin pump, dewatering,
  traffic control, lane closure, utility conflict, asphalt patch, curb and gutter,
  submittal, punch list, turnover, shoring, conduit, catch basin, storm drain,
  RFI, change order

OUTPUT FORMAT — return a JSON object with this EXACT structure:
{
  "atomic_objects": [
    {
      "raw_text": "verbatim or near-verbatim excerpt from transcript",
      "cleaned_text": "clean, readable rewrite of the thread — place names + field shorthand preserved verbatim",
      "title": "Short, specific title — max 8 words — ALWAYS set, never null",
      "type": "task",
      "why_it_matters": "one short sentence: why this is worth remembering / when it'd be useful again — or null if purely transient",
      "domain": "work",
      "tags": ["tag1", "tag2"],
      "entities": ["Person Name", "Place Name", "Org Name"],
      "confidence": 0.95,
      "temporal_hints": {
        "has_date": true,
        "date_text": "tomorrow morning",
        "urgency": "high"
      },
      "location_hints": {
        "places": ["school", "office"],
        "geofence_candidate": true
      },
      "actionability": {
        "is_actionable": true,
        "next_action": "Call supplier tomorrow to renegotiate"
      },
      "context_inherited_from": null
    }
  ]
}

LOCATION REMINDER RULES — CRITICAL:
- Phrases like "when I get to", "when I arrive at", "at [place] remind me", "next time I'm at" → type="reminder", location_hints.geofence_candidate=true
- Always list the destination place in location_hints.places AND entities
- If no specific date is mentioned, set temporal_hints.has_date=false and temporal_hints.urgency="medium"

FIELD RULES:
- raw_text: take the actual words from the transcript; minimal editing
- cleaned_text: rewrite the thread into ONE clear, readable line a person would want
  to see in a notes list. Fix grammar, drop false starts/repetition/filler, and
  merge the thread's fragments into a coherent sentence. BUT: (1) preserve every
  local place name verbatim (Puʻuhale, Middle Street, Sand Island, Kapālama, etc.);
  (2) preserve the speaker's field/construction shorthand EXACTLY — never normalize it
  into longhand (e.g. drainage inlet, vac truck, Godwin pump, dewatering, punch list,
  bore log, submittal, RFI, change order, and any other jobsite term the speaker uses); (3) do NOT invent facts,
  numbers, names, or commitments the speaker did not say. If the thread is ALREADY a
  clean, readable line, keep it essentially as-is — do not pad or embellish it. The
  verbatim words live in raw_text; readability lives here.
- title: ALWAYS set a short, meaningful title (max 8 words) for every object — never null. It is the headline shown in the notes list. Make it specific: "Call pump supplier about pricing", not "Phone call". Title the thought, not the words.
- entities: only named things — people (first name is fine), specific places, specific companies/products; ALWAYS include local place names here
- temporal_hints.urgency: infer from language — "ASAP"/"urgent"/"must"/"today" → high, "soon"/"this week" → medium, "eventually"/"someday" → low
- location_hints.places: list ALL mentioned places, including streets, jobsites, neighborhoods
- location_hints.geofence_candidate: true if the note could be triggered by arriving at or leaving a specific place (school, gym, home, office, store, jobsite, street corner, etc.)
- actionability.next_action: the single clearest next physical action, stated cleanly
- context_inherited_from: if this object's location/time/project context was inferred from an ADJACENT object (not stated explicitly), set this to that object's sequence_index (0-based). If context is self-contained, set null.
- confidence: be honest — if you are guessing domain, type, or context, lower this score. Objects below 0.75 will be flagged for user review. Do not round up.
- why_it_matters: the future situation that makes this worth resurfacing (a person, a place visit, a decision later). Null for throwaway thoughts.

RETURN ONLY VALID JSON. No markdown fences, no explanation, no prefix text."""


# ---------------------------------------------------------------------------
# Few-shot example 1 — General use case
# ---------------------------------------------------------------------------

EXAMPLE_1_INPUT = """I need to call the pump supplier tomorrow morning about the pricing — their quote was way too high. Also been thinking the app dashboard is too cluttered, maybe we should simplify the main view. Oh and I should remember to pick up Marcus from school at 3pm Thursday."""

EXAMPLE_1_OUTPUT = """{
  "atomic_objects": [
    {
      "raw_text": "I need to call the pump supplier tomorrow morning about the pricing — their quote was way too high",
      "cleaned_text": "Call the pump supplier tomorrow morning about pricing — their quote was too high",
      "title": "Call pump supplier about pricing",
      "type": "task",
      "why_it_matters": "Needed before the next supplier order",
      "domain": "work",
      "tags": ["supplier", "pricing", "call", "negotiation"],
      "entities": ["pump supplier"],
      "confidence": 0.95,
      "temporal_hints": {
        "has_date": true,
        "date_text": "tomorrow morning",
        "urgency": "high"
      },
      "location_hints": {
        "places": [],
        "geofence_candidate": false
      },
      "actionability": {
        "is_actionable": true,
        "next_action": "Call pump supplier tomorrow morning to renegotiate pricing"
      },
      "context_inherited_from": null
    },
    {
      "raw_text": "been thinking the app dashboard is too cluttered, maybe we should simplify the main view",
      "cleaned_text": "The app dashboard is too cluttered — simplify the main view",
      "title": "App dashboard needs simplification",
      "type": "idea",
      "why_it_matters": "Important for improving user experience in the next sprint",
      "domain": "work",
      "tags": ["app", "dashboard", "ux", "simplification"],
      "entities": [],
      "confidence": 0.85,
      "temporal_hints": {
        "has_date": false,
        "date_text": null,
        "urgency": "low"
      },
      "location_hints": {
        "places": [],
        "geofence_candidate": false
      },
      "actionability": {
        "is_actionable": true,
        "next_action": "Sketch a simplified main view layout"
      },
      "context_inherited_from": null
    },
    {
      "raw_text": "I should remember to pick up Marcus from school at 3pm Thursday",
      "cleaned_text": "Pick up Marcus from school at 3pm Thursday",
      "title": "Pick up Marcus from school Thursday",
      "type": "reminder",
      "domain": "family",
      "tags": ["pickup", "school", "Marcus", "Thursday"],
      "entities": ["Marcus"],
      "confidence": 0.98,
      "temporal_hints": {
        "has_date": true,
        "date_text": "Thursday at 3pm",
        "urgency": "medium"
      },
      "location_hints": {
        "places": ["school"],
        "geofence_candidate": true
      },
      "actionability": {
        "is_actionable": true,
        "next_action": "Pick up Marcus from school at 3pm Thursday"
      },
      "context_inherited_from": null
    }
  ]
}"""


# ---------------------------------------------------------------------------
# Few-shot example 2 — Honolulu jobsite / field speech
# ---------------------------------------------------------------------------

EXAMPLE_2_INPUT = """Set up crew to clear drainage inlets from Middle Street to Puʻuhale today. Need traffic control out there too. Also check on the vac truck at Sand Island, make sure it's ready for dewatering tomorrow morning. Reminder for the punch list walk at Kapālama, that's Friday."""

EXAMPLE_2_OUTPUT = """{
  "atomic_objects": [
    {
      "raw_text": "Set up crew to clear drainage inlets from Middle Street to Puʻuhale today. Need traffic control out there too",
      "cleaned_text": "Clear drainage inlets from Middle Street to Puʻuhale today, and set up traffic control out there",
      "title": "Drains + traffic control: Middle St to Puʻuhale",
      "type": "task",
      "why_it_matters": "Critical for today's jobsite operations and crew safety",
      "domain": "work",
      "tags": ["drainage", "traffic control", "crew", "Middle Street", "Puuhale", "today"],
      "entities": ["Middle Street", "Puʻuhale"],
      "confidence": 0.95,
      "temporal_hints": {
        "has_date": true,
        "date_text": "today",
        "urgency": "high"
      },
      "location_hints": {
        "places": ["Middle Street", "Puʻuhale"],
        "geofence_candidate": true
      },
      "actionability": {
        "is_actionable": true,
        "next_action": "Deploy crew to clear drainage inlets and set up traffic control from Middle Street to Puʻuhale"
      },
      "context_inherited_from": null
    },
    {
      "raw_text": "check on the vac truck at Sand Island, make sure it's ready for dewatering tomorrow morning",
      "cleaned_text": "Check vac truck at Sand Island — confirm ready for dewatering tomorrow morning",
      "title": "Confirm vac truck ready for dewatering at Sand Island",
      "type": "task",
      "domain": "work",
      "tags": ["vac truck", "dewatering", "Sand Island", "equipment"],
      "entities": ["Sand Island"],
      "confidence": 0.96,
      "temporal_hints": {
        "has_date": true,
        "date_text": "tomorrow morning",
        "urgency": "high"
      },
      "location_hints": {
        "places": ["Sand Island"],
        "geofence_candidate": true
      },
      "actionability": {
        "is_actionable": true,
        "next_action": "Check vac truck at Sand Island and confirm dewatering readiness"
      },
      "context_inherited_from": null
    },
    {
      "raw_text": "Reminder for the punch list walk at Kapālama, that's Friday",
      "cleaned_text": "Punch list walk at Kapālama on Friday",
      "title": "Punch list walk at Kapālama Friday",
      "type": "reminder",
      "domain": "work",
      "tags": ["punch list", "walk", "Kapalama", "Friday"],
      "entities": ["Kapālama"],
      "confidence": 0.98,
      "temporal_hints": {
        "has_date": true,
        "date_text": "Friday",
        "urgency": "medium"
      },
      "location_hints": {
        "places": ["Kapālama"],
        "geofence_candidate": true
      },
      "actionability": {
        "is_actionable": true,
        "next_action": "Attend punch list walk at Kapālama on Friday"
      },
      "context_inherited_from": null
    }
  ]
}"""


# ---------------------------------------------------------------------------
# Few-shot example 3 — Location reminder ("when I get to X" pattern)
# ---------------------------------------------------------------------------

EXAMPLE_3_INPUT = """Remind me to get paper towels when I get to Costco. Also need to pick up a case of water."""

EXAMPLE_3_OUTPUT = """{
  "atomic_objects": [
    {
      "raw_text": "Remind me to get paper towels when I get to Costco. Also need to pick up a case of water",
      "cleaned_text": "Get paper towels and a case of water when I get to Costco",
      "title": "Buy paper towels and water at Costco",
      "type": "reminder",
      "domain": "personal",
      "tags": ["shopping", "Costco", "paper towels", "water", "errand"],
      "entities": ["Costco"],
      "confidence": 0.95,
      "temporal_hints": {
        "has_date": false,
        "date_text": null,
        "urgency": "medium"
      },
      "location_hints": {
        "places": ["Costco"],
        "geofence_candidate": true
      },
      "actionability": {
        "is_actionable": true,
        "next_action": "Buy paper towels and a case of water at Costco"
      },
      "context_inherited_from": null
    }
  ]
}"""


# ---------------------------------------------------------------------------
# Few-shot example 4 — Consolidation (rambly fragments about ONE topic → 1 note)
# ---------------------------------------------------------------------------

EXAMPLE_4_INPUT = """So the, the client invoice, yeah I keep forgetting it, I gotta send the client invoice for the Kapālama job before end of month or we don't get paid this cycle."""

EXAMPLE_4_OUTPUT = """{
  "atomic_objects": [
    {
      "raw_text": "So the, the client invoice, yeah I keep forgetting it, I gotta send the client invoice for the Kapālama job before end of month or we don't get paid this cycle",
      "cleaned_text": "Send the client invoice for the Kapālama job before end of month — or we miss this pay cycle",
      "title": "Send Kapālama client invoice before month-end",
      "type": "task",
      "domain": "finance",
      "tags": ["invoice", "client", "Kapālama", "payment"],
      "entities": ["Kapālama"],
      "confidence": 0.92,
      "temporal_hints": {
        "has_date": true,
        "date_text": "before end of month",
        "urgency": "high"
      },
      "location_hints": {
        "places": ["Kapālama"],
        "geofence_candidate": false
      },
      "actionability": {
        "is_actionable": true,
        "next_action": "Send the client invoice for the Kapālama job before end of month"
      },
      "context_inherited_from": null
    }
  ]
}"""


# ---------------------------------------------------------------------------
# Few-shot example 5 — Significance gate (drop filler, keep the one real item)
# ---------------------------------------------------------------------------

EXAMPLE_5_INPUT = """Um, okay. Let me think. Yeah so. Where was I. Oh — remind me to email the inspector about the Sand Island permit. Yeah. That's about it I guess."""

EXAMPLE_5_OUTPUT = """{
  "atomic_objects": [
    {
      "raw_text": "Oh — remind me to email the inspector about the Sand Island permit",
      "cleaned_text": "Email the inspector about the Sand Island permit",
      "title": "Email inspector re: Sand Island permit",
      "type": "reminder",
      "domain": "work",
      "tags": ["email", "inspector", "permit", "Sand Island"],
      "entities": ["Sand Island"],
      "confidence": 0.95,
      "temporal_hints": {
        "has_date": false,
        "date_text": null,
        "urgency": "medium"
      },
      "location_hints": {
        "places": ["Sand Island"],
        "geofence_candidate": false
      },
      "actionability": {
        "is_actionable": true,
        "next_action": "Email the inspector about the Sand Island permit"
      },
      "context_inherited_from": null
    }
  ]
}"""


def create_user_prompt(transcript: str, context: dict = None) -> str:
    """Create user prompt with transcript and optional context"""
    prompt = f"Parse this transcript:\n\n{transcript}\n\n"

    if context:
        prompt += "Additional context:\n"
        if context.get("recent_categories"):
            prompt += f"- Recent domains used: {', '.join(context['recent_categories'])}\n"
        if context.get("recent_entities"):
            prompt += f"- Known entities in this user's notes: {', '.join(context['recent_entities'])}\n"
        if context.get("user_preferences"):
            prompt += f"- User preferences: {context['user_preferences']}\n"
        if context.get("transcript_corrections"):
            corrections = context["transcript_corrections"]
            if corrections:
                correction_lines = "; ".join(
                    f"'{c['original']}' → '{c['corrected']}'" for c in corrections
                )
                prompt += f"- Pre-processing corrections applied: {correction_lines}\n"
        prompt += "\n"

    prompt += 'Return the parsed atomic objects as {"atomic_objects": [...]}.'
    return prompt


def create_few_shot_examples() -> List[dict]:
    """Few-shot examples for better parsing"""
    return [
        {
            "role": "user",
            "content": f"Parse this transcript:\n\n{EXAMPLE_1_INPUT}\n\nReturn the parsed atomic objects as {{\"atomic_objects\": [...]}}."
        },
        {
            "role": "assistant",
            "content": EXAMPLE_1_OUTPUT
        },
        {
            "role": "user",
            "content": f"Parse this transcript:\n\n{EXAMPLE_2_INPUT}\n\nReturn the parsed atomic objects as {{\"atomic_objects\": [...]}}."
        },
        {
            "role": "assistant",
            "content": EXAMPLE_2_OUTPUT
        },
        {
            "role": "user",
            "content": f"Parse this transcript:\n\n{EXAMPLE_3_INPUT}\n\nReturn the parsed atomic objects as {{\"atomic_objects\": [...]}}."
        },
        {
            "role": "assistant",
            "content": EXAMPLE_3_OUTPUT
        },
        {
            "role": "user",
            "content": f"Parse this transcript:\n\n{EXAMPLE_4_INPUT}\n\nReturn the parsed atomic objects as {{\"atomic_objects\": [...]}}."
        },
        {
            "role": "assistant",
            "content": EXAMPLE_4_OUTPUT
        },
        {
            "role": "user",
            "content": f"Parse this transcript:\n\n{EXAMPLE_5_INPUT}\n\nReturn the parsed atomic objects as {{\"atomic_objects\": [...]}}."
        },
        {
            "role": "assistant",
            "content": EXAMPLE_5_OUTPUT
        },
    ]
