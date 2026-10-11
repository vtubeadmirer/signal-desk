"""Compact, exact identity exclusions; no automatic keyword blacklisting."""
import hashlib
import unicodedata


def rejection_id(url: str) -> str:
    return url.strip().split("#", 1)[0].rstrip("/")


def normalized_title(title: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKC", title).lower() if c.isalnum())


def fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def is_rejected(item: dict, exclusions: set[str]) -> bool:
    if not exclusions:
        return False
    if fingerprint("u:" + rejection_id(str(item.get("url", "")))) in exclusions:
        return True
    title = normalized_title(str(item.get("title", "")))
    return len(title) >= 8 and fingerprint("t:" + title) in exclusions
