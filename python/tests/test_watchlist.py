from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agent


def item(i: int, title: str) -> dict:
    return {"title": title, "summary": "방송 플랫폼 정책 변경 소식", "url": f"https://example.com/{i}", "published_at": datetime.now(timezone.utc).isoformat(), "source_name": "Example", "tier": "professional", "source_type": "media", "content_type": "news"}


class WatchlistTests(unittest.TestCase):
    def test_watch_hits_are_pinned_above_the_top_20_cut(self):
        items = [item(i, f"제작환경{i} 신규구독정책{i} 이용기준{i} 변경안내{i}") for i in range(25)]
        # Long enough not to be dropped as low-value; still the lowest score because it matches no category terms.
        items.append({**item(99, "페이커 팬미팅 일정과 참가 신청 방법 안내"), "summary": "팬미팅 장소와 시간, 참가 신청 방법을 정리한 안내문입니다. 현장 굿즈 판매와 사진 촬영 순서도 함께 적혀 있습니다."})
        plain = agent.build_candidates(items)
        self.assertNotIn("페이커 팬미팅 일정과 참가 신청 방법 안내", [c["title"] for c in plain], "without a watchlist the low-scoring item falls outside the top 20")
        watched = agent.build_candidates(items, watchlist=["페이커"])
        self.assertEqual(watched[0]["title"], "페이커 팬미팅 일정과 참가 신청 방법 안내")
        self.assertEqual(watched[0]["watch_matches"], ["페이커"])
        self.assertEqual(watched[0]["priority"], 1)
        self.assertEqual(len(watched), 20)

    def test_watchlist_matches_summary_case_insensitively_and_keeps_editorial_gates(self):
        out = agent.build_candidates([{**item(1, "플랫폼 공지 사항이 새로 올라왔습니다"), "summary": "ChZZK 공지가 올라왔습니다. 후원 수수료와 구독 혜택 변경 내용을 상세히 설명하는 공지이며 적용 일정도 포함되어 있습니다."}], watchlist=["chzzk"])
        self.assertEqual(out[0]["watch_matches"], ["chzzk"])
        excluded = agent.build_candidates([item(2, "페이커 살인미수 사건")], watchlist=["페이커"])
        self.assertEqual(excluded, [], "a watchlist hit never overrides crime exclusions")

    def test_invalid_watchlist_is_rejected_before_fetch(self):
        with patch("agent.fetch_source") as fetch:
            for bad in ["x", ["a"], ["  두칸  띄움"], ["t"] * 51]:
                self.assertFalse(agent.handle({"op": "collect", "stream": "news", "sources": [{"enabled": True}], "watchlist": bad})["ok"], bad)
        fetch.assert_not_called()
        with patch("agent.fetch_source", return_value=[]):
            self.assertTrue(agent.handle({"op": "collect", "stream": "news", "sources": [], "watchlist": ["페이커"]})["ok"])


if __name__ == "__main__":
    unittest.main()
