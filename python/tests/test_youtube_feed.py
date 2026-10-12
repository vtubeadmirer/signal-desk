"""YouTube channel Atom feeds go through the ordinary RSS path; make sure the shape parses."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agent

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "youtube_feed.xml"


class YouTubeFeedTests(unittest.TestCase):
    def test_channel_feed_entry_maps_to_watch_link_and_description(self):
        source = {"name": "Example Channel", "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxxxxxxxxxxxxxxxxxxxx", "tier": "official", "category": "버튜버·크리에이터"}
        out = agent.parse_feed(FIXTURE.read_bytes(), source)
        self.assertEqual(len(out), 1)
        entry = out[0]
        self.assertEqual(entry["title"], "신규 버튜버 데뷔 방송 안내")
        self.assertEqual(entry["url"], "https://www.youtube.com/watch?v=abc123DEF45")
        self.assertIn("첫 방송을 시작합니다", entry["summary"])
        self.assertEqual(entry["published_at"], "2026-10-11T09:00:00+00:00")
        self.assertEqual(entry["source_type"], "official")


if __name__ == "__main__":
    unittest.main()
