from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from agent import build_candidates, strip_html
from security import validate_public_url, validate_https_resource_url


class SignalDeskSecurityTests(unittest.TestCase):
    def test_rejects_private_urls(self):
        with self.assertRaises(ValueError):
            validate_public_url("https://127.0.0.1/feed.xml")
        with self.assertRaises(ValueError):
            validate_public_url("http://example.com/feed.xml")

    def test_rejects_unsafe_resource_urls(self):
        self.assertEqual(validate_https_resource_url("https://example.com/news"), "https://example.com/news")
        with self.assertRaises(ValueError):
            validate_https_resource_url("http://example.com/news")
        with self.assertRaises(ValueError):
            validate_https_resource_url("javascript:alert(1)")
        with self.assertRaises(ValueError):
            validate_https_resource_url("https://user:pass@example.com/news")

    def test_parse_feed_drops_unsafe_links(self):
        from agent import parse_feed
        xml = b"<rss><channel><item><title>safe</title><link>https://example.com/safe</link><description>x</description></item><item><title>bad</title><link>javascript:alert(1)</link><description>x</description></item></channel></rss>"
        out = parse_feed(xml, {"url": "https://example.com/feed.xml", "name": "Example"})
        self.assertEqual([x["title"] for x in out], ["safe"])

    def test_strips_script_and_markup(self):
        cleaned = strip_html("<p>Hello</p><script>alert(1)</script><b>world</b>")
        self.assertEqual(cleaned, "Hello world")

    def test_sensitive_topic_is_excluded(self):
        items = [{
            "title": "피해자 신상과 주소가 퍼졌다는 글",
            "summary": "사생활 관련 내용",
            "url": "https://example.com/a",
            "published_at": "2026-09-19T06:00:00+00:00",
            "source_name": "Example",
            "tier": "professional",
            "category": "사회·생활",
            "source_type": "media",
            "content_type": "news",
            "collection_method": "rss",
            "usage_status": "review_required",
        }]
        out = build_candidates(items)
        self.assertEqual(out, [])

    def test_dedupes_same_story(self):
        base = {
            "summary": "게임 업데이트 내용",
            "published_at": "2026-09-19T06:00:00+00:00",
            "tier": "professional",
            "category": "게임·인터넷 방송",
            "source_type": "media",
            "content_type": "news",
            "collection_method": "rss",
            "usage_status": "review_required",
        }
        items = [
            {**base, "title":"신작 게임 대규모 업데이트 발표", "url":"https://one.example/a", "source_name":"A"},
            {**base, "title":"신작 게임 대규모 업데이트 발표", "url":"https://two.example/b", "source_name":"B"},
        ]
        out = build_candidates(items)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["source_count"], 2)


if __name__ == "__main__":
    unittest.main()
