"""Regression tests for v0.4.0 collection hardening: parallel fetch, link selection, URL identity."""
from __future__ import annotations

import sys
import threading
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agent
from community import robots_allowed


class AtomLinkSelectionTests(unittest.TestCase):
    source = {"url": "https://example.com/feed", "name": "Example", "tier": "professional"}

    def test_alternate_link_wins_over_self_and_enclosure(self):
        xml = b"""<feed xmlns="http://www.w3.org/2005/Atom">
          <entry><title>article</title>
            <link rel="self" href="https://example.com/feed/entry/1"/>
            <link rel="enclosure" href="https://cdn.example.com/audio.mp3"/>
            <link rel="alternate" href="https://example.com/posts/1"/>
            <published>2026-10-11T10:00:00Z</published></entry></feed>"""
        out = agent.parse_feed(xml, self.source)
        self.assertEqual([x["url"] for x in out], ["https://example.com/posts/1"])

    def test_link_without_rel_is_treated_as_article_link(self):
        xml = b"""<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>t</title>
            <link href="https://example.com/posts/2"/></entry></feed>"""
        self.assertEqual(agent.parse_feed(xml, self.source)[0]["url"], "https://example.com/posts/2")

    def test_entry_with_only_self_link_is_skipped(self):
        xml = b"""<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>t</title>
            <link rel="self" href="https://example.com/feed/3"/></entry></feed>"""
        self.assertEqual(agent.parse_feed(xml, self.source), [])


class UrlIdentityTests(unittest.TestCase):
    def test_tracking_parameters_do_not_split_duplicates(self):
        a = agent.normalize_url("https://news.example/story?id=7&utm_source=rss&utm_medium=feed#top")
        b = agent.normalize_url("https://news.example/story?id=7/")
        self.assertEqual(a, b)
        self.assertEqual(a, "https://news.example/story?id=7")

    def test_meaningful_query_is_preserved(self):
        self.assertEqual(agent.normalize_url("https://news.example/view?no=12&fbclid=abc"), "https://news.example/view?no=12")

    def test_rejection_identity_is_unchanged(self):
        from rejections import rejection_id
        self.assertEqual(rejection_id("https://news.example/story?utm_source=x/"), "https://news.example/story?utm_source=x")


class LowValueTests(unittest.TestCase):
    def test_official_short_headline_without_summary_is_kept(self):
        base = {"url": "https://gov.example/1", "published_at": datetime.now(timezone.utc).isoformat(), "source_name": "기관", "summary": ""}
        self.assertFalse(agent.is_low_value_news({**base, "title": "청년 정책 개편", "tier": "official"}))
        self.assertTrue(agent.is_low_value_news({**base, "title": "청년 정책 개편", "tier": "professional"}))


class ParallelCollectionTests(unittest.TestCase):
    def test_sources_are_fetched_concurrently(self):
        started = []
        gate = threading.Barrier(4, timeout=5)

        def fetch(source):
            started.append(source["name"])
            gate.wait()  # all four must be in flight at once, or the barrier times out
            return [{"title": source["name"]}]

        sources = [{"name": f"s{i}", "enabled": True} for i in range(4)]
        with patch("agent.fetch_source", side_effect=fetch):
            items, errors = agent.collect_sources(sources)
        self.assertEqual(len(items), 4)
        self.assertEqual(errors, [])
        self.assertEqual(sorted(started), ["s0", "s1", "s2", "s3"])

    def test_one_failing_source_reports_its_reason_and_others_succeed(self):
        def fetch(source):
            if source["name"] == "bad":
                raise ValueError("피드 서버가 HTTP 404를 반환했습니다.")
            if source["name"] == "xml":
                import xml.etree.ElementTree as ET
                raise ET.ParseError("bad xml")
            return [{"title": "ok"}]

        with patch("agent.fetch_source", side_effect=fetch):
            items, errors = agent.collect_sources([{"name": "good"}, {"name": "bad"}, {"name": "xml"}])
        self.assertEqual(len(items), 1)
        self.assertEqual(errors, ["bad: 피드 서버가 HTTP 404를 반환했습니다.", "xml: 피드 XML을 해석하지 못했습니다."])

    def test_slow_source_is_skipped_after_budget(self):
        def fetch(source):
            if source["name"] == "slow":
                time.sleep(1.5)
            return [{"title": source["name"]}]

        with patch("agent.fetch_source", side_effect=fetch):
            items, errors = agent.collect_sources([{"name": "fast"}, {"name": "slow"}], budget=0.3)
        self.assertEqual([x["title"] for x in items], ["fast"])
        self.assertEqual(errors, ["slow: 수집 시간이 초과되어 건너뛰었습니다."])

    def test_handle_still_filters_sources_by_stream(self):
        with patch("agent.fetch_source", return_value=[]) as fetch:
            result = agent.handle({"op": "collect", "stream": "news", "sources": [
                {"name": "n", "enabled": True}, {"name": "c", "kind": "community", "enabled": True}, {"name": "off", "enabled": False}]})
        self.assertTrue(result["ok"])
        self.assertEqual([call.args[0]["name"] for call in fetch.call_args_list], ["n"])


class RobotsAgentMatchingTests(unittest.TestCase):
    def test_partial_or_empty_agent_names_do_not_claim_signaldesk_group(self):
        robots = "User-agent: s\nDisallow: /\nUser-agent: *\nAllow: /\n"
        self.assertTrue(robots_allowed(robots, "https://example.com/best"))
        robots = "User-agent:\nDisallow: /\nUser-agent: *\nAllow: /\n"
        self.assertTrue(robots_allowed(robots, "https://example.com/best"))
        robots = "User-agent: SignalDesk\nDisallow: /\nUser-agent: *\nAllow: /\n"
        self.assertFalse(robots_allowed(robots, "https://example.com/best"))


class ProviderDriftTests(unittest.TestCase):
    def test_unknown_flag_errors_become_update_guidance(self):
        self.assertTrue(agent._looks_like_cli_option_drift("error: unexpected argument '--ephemeral' found"))
        self.assertFalse(agent._looks_like_cli_option_drift("network error"))


if __name__ == "__main__":
    unittest.main()
