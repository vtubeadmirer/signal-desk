"""Rule-based just-chatting angles: chat questions and a poll per candidate, no provider call.

Templates live in shared/talk_angles.json (bundled into the sidecar next to
negative_topics.json). Selection is deterministic per article so the same story
gets the same angle on every collection and on every machine.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path


def dictionary_path() -> Path:
    base = Path(sys._MEIPASS) if getattr(sys, "frozen", False) else Path(__file__).resolve().parent.parent
    return base / "shared" / "talk_angles.json"


TEMPLATES = json.loads(dictionary_path().read_text(encoding="utf-8"))
STOPWORDS = set(TEMPLATES.get("stopwords", []))
DEBATE_FRAMES = {"공정성", "비용·과금", "플랫폼 운영", "창작·권리"}
EMPATHY_CATEGORIES = {"버튜버·크리에이터", "커뮤니티·밈"}
MAX_QUESTIONS = 3


def _stable_index(seed: str, size: int) -> int:
    if size <= 0:
        return 0
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") % size


def main_keyword(item: dict) -> str:
    """Watchlist hit first, otherwise the longest specific token from the title."""
    watch = item.get("watch_matches") or []
    if watch:
        return str(watch[0])
    title = str(item.get("title", ""))
    candidates = [t for t in re.findall(r"[0-9A-Za-z가-힣]{2,}", title) if t.lower() not in STOPWORDS and not t.isdigit()]
    if not candidates:
        return "이 소식"
    # Prefer longer tokens (proper nouns, compounds); stable tie-break by position.
    return max(candidates, key=lambda t: (len(t), -candidates.index(t)))


def engagement_profile(item: dict) -> str:
    """debate / empathy / info — drives which template family and which chat opener."""
    engagement = item.get("engagement") or {}
    if item.get("source_type") == "community" and isinstance(engagement, dict):
        recs = max(0, int(engagement.get("recommendations", 0) or 0))
        comments = max(0, int(engagement.get("comments", 0) or 0))
        if comments >= 10 and comments >= 0.8 * (recs + 1):
            return "debate"
        if recs >= 20 and comments <= 0.3 * (recs + 1):
            return "empathy"
        return "info" if recs + comments < 10 else "empathy"
    frames = set(item.get("frames") or [])
    if frames & DEBATE_FRAMES:
        return "debate"
    if item.get("category") in EMPATHY_CATEGORIES:
        return "empathy"
    if item.get("tier") == "official" and not frames:
        return "info"
    return "info" if not frames else "debate"


def _fill(text: str, item: dict, keyword: str) -> str:
    return text.replace("{keyword}", keyword).replace("{source}", str(item.get("source_name", "") or "출처"))


def talk_angles(item: dict) -> dict:
    """Return {"profile", "intro", "questions": [...], "poll": {"question", "options"} | None}."""
    seed = str(item.get("url") or item.get("event_id") or item.get("title") or "")
    keyword = main_keyword(item)
    profile = engagement_profile(item)
    frames = [f for f in (item.get("frames") or []) if f in TEMPLATES.get("frames", {})]
    category = str(item.get("category", ""))

    sources: list[dict] = []
    if frames:
        # One frame per article, chosen deterministically, keeps angles varied across the list.
        sources.append(TEMPLATES["frames"][frames[_stable_index(seed + ":frame", len(frames))]])
    category_templates = TEMPLATES.get("categories", {}).get(category)
    if category_templates:
        sources.append(category_templates)
    profile_templates = TEMPLATES.get("profiles", {}).get(profile, {})

    questions: list[str] = []
    for family in sources:
        pool = family.get("questions", [])
        if pool:
            start = _stable_index(seed + ":q", len(pool))
            for offset in range(len(pool)):
                text = _fill(pool[(start + offset) % len(pool)], item, keyword)
                if text not in questions:
                    questions.append(text)
    for text in profile_templates.get("questions", []):
        filled = _fill(text, item, keyword)
        if filled not in questions:
            questions.insert(0, filled) if profile == "debate" else questions.append(filled)
    questions = questions[:MAX_QUESTIONS]

    poll = None
    poll_pool = [p for family in sources for p in family.get("polls", [])]
    if profile == "debate" and profile_templates.get("polls"):
        poll_pool = profile_templates["polls"] + poll_pool
    if poll_pool:
        chosen = poll_pool[_stable_index(seed + ":poll", len(poll_pool))]
        poll = {"question": _fill(chosen["question"], item, keyword), "options": [str(o) for o in chosen.get("options", [])][:4]}

    return {
        "profile": profile,
        "intro": profile_templates.get("intro", ""),
        "keyword": keyword,
        "questions": questions,
        "poll": poll,
    }
