"""
Manual before/after demo for the transcript parser.

Usage (from backend/ml-service/, with OPENAI_API_KEY or ANTHROPIC_API_KEY set):
    python scripts/parse_demo.py

Prints the notes produced for a set of representative transcripts so you can
eyeball consolidation, junk-dropping, titles, and place-name preservation.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.parser import get_parser
from app.models.transcript import TranscriptParseRequest

SAMPLES = {
    "multi-topic brain dump": (
        "I need to call the pump supplier tomorrow about pricing, their quote was "
        "way too high. Also the app dashboard feels too cluttered, maybe simplify "
        "the main view. And remember to pick up Marcus from school at 3pm Thursday."
    ),
    "Honolulu jobsite dump": (
        "Set up crew to clear drainage inlets from Middle Street to Puʻuhale today, "
        "need traffic control out there too. Check the vac truck at Sand Island for "
        "dewatering tomorrow. Punch list walk at Kapālama Friday."
    ),
    "filler-heavy": (
        "Um, okay, let me think. Yeah so. Where was I. Oh remind me to email the "
        "inspector about the Sand Island permit. Yeah. That's about it I guess."
    ),
    "location reminder": (
        "Remind me to get paper towels when I get to Costco, also need a case of water."
    ),
}


async def main():
    parser = get_parser()
    for name, transcript in SAMPLES.items():
        req = TranscriptParseRequest(
            transcript=transcript, user_id="demo", session_id="demo"
        )
        objs, model, secs, _raw = await parser.parse_transcript(req)
        print(f"\n=== {name} ({len(objs)} notes, {model}, {secs:.1f}s) ===")
        for o in objs:
            print(f"  • [{o.type}/{o.domain}] {o.title}")
            print(f"      {o.cleaned_text}")


if __name__ == "__main__":
    asyncio.run(main())
