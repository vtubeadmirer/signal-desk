"""Interpretable dislike weights learned from rejected titles, without provider calls."""
import json
import math
import re
import sys
import unicodedata
from pathlib import Path

from editorial import emergency_scope


def dictionary_path() -> Path:
    base = Path(sys._MEIPASS) if getattr(sys, "frozen", False) else Path(__file__).resolve().parent.parent
    return base / "shared" / "negative_topics.json"


DICTIONARY = json.loads(dictionary_path().read_text(encoding="utf-8"))
STOPWORDS = set(DICTIONARY["stopwords"])
TOPICS = {topic["id"]: topic for topic in DICTIONARY["topics"]}


def normalize(text: str) -> str:
    return unicodedata.normalize("NFKC", text).lower()


def preference_tokens(title: str) -> list[str]:
    result = []
    for word in re.findall(r"[0-9a-z가-힣]{2,}", normalize(title)):
        if word in STOPWORDS:
            continue
        for _ in range(2):
            suffix = next((ending for ending in DICTIONARY["suffixes"] if word.endswith(ending) and len(word) - len(ending) >= 2), None)
            if not suffix:
                break
            word = word[:-len(suffix)]
        if 2 <= len(word) <= 32 and not word.isdigit() and word not in STOPWORDS and not re.fullmatch(r"(.)\1+", word) and word not in result:
            result.append(word)
    return result[:6]


def topic_matches(title: str, topic_id: str) -> bool:
    topic = TOPICS.get(topic_id)
    text = normalize(title)
    return bool(topic) and all(any(term in text for term in group) for group in topic["groups"])


def validate_rules(rules: object, stream: str) -> list[dict]:
    if not isinstance(rules, list) or len(rules) > 300:
        raise ValueError("제외 성향은 최대 300개 규칙만 전달할 수 있습니다.")
    validated = []
    for rule in rules:
        if not isinstance(rule, dict) or rule.get("stream") != stream:
            raise ValueError("제외 성향의 자료 종류가 올바르지 않습니다.")
        kind, terms, weight = rule.get("kind"), rule.get("terms"), rule.get("weight")
        if not isinstance(kind, str) or kind not in {"topic", "pair", "keyword"} or type(weight) is not int or not 40 <= weight <= 80:
            raise ValueError("제외 성향의 감점 규칙이 올바르지 않습니다.")
        if not isinstance(terms, list) or len(terms) != (2 if kind == "pair" else 1) or not all(isinstance(term, str) and len(term) <= 32 for term in terms):
            raise ValueError("제외 성향의 핵심 단어가 올바르지 않습니다.")
        if kind == "topic":
            if terms[0] not in TOPICS:
                raise ValueError("알 수 없는 제외 주제입니다.")
            label = TOPICS[terms[0]]["label"]
        else:
            if len(set(terms)) != len(terms) or any(term in STOPWORDS or not re.fullmatch(r"[0-9a-z가-힣]{2,32}", term) or term.isdigit() for term in terms):
                raise ValueError("너무 일반적인 단어는 학습 제외에 사용할 수 없습니다.")
            label = " + ".join(terms)
        validated.append({"kind": kind, "terms": terms, "weight": weight, "stream": stream, "label": label})
    return validated


def negative_penalty(item: dict, rules: list[dict]) -> tuple[int, list[str]]:
    # Exact identity exclusions still apply, but inferred interests do not hide
    # explicitly domestic national emergency announcements.
    if item.get("domestic_emergency") or emergency_scope(item) == "domestic":
        return 0, []
    stream = "community" if item.get("source_type") == "community" or item.get("content_type") in {"community", "meme", "trend"} else "news"
    title = str(item.get("title", ""))
    words = set(preference_tokens(title))
    penalty, matches = 0, []
    for rule in rules:
        if rule["stream"] != stream:
            continue
        hits = int(topic_matches(title, rule["terms"][0])) if rule["kind"] == "topic" else sum(term in words for term in rule["terms"])
        full = hits == len(rule["terms"])
        amount = rule["weight"] if full else min(35, math.floor(rule["weight"] * 0.35 + 0.5)) if hits else 0
        if amount:
            penalty = max(penalty, amount)
            matches.append(rule["label"])
    return penalty, list(dict.fromkeys(matches))[:3]
