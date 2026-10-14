from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agent


def article(i: int, title: str, days_ago: float) -> dict:
    return {"title": title, "summary": "엔비디아가 GB202 칩을 워크스테이션용으로 돌리면서 소비자용 최상위 카드의 생산이 줄어든다는 보도가 이어지고 있습니다. 유통사와 커뮤니티 반응도 함께 정리했습니다.", "url": f"https://news.google.com/rss/articles/{i}", "published_at": (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat(), "source_name": "Google 뉴스 검색", "tier": "professional", "source_type": "media", "content_type": "news", "category": "IT·플랫폼"}


class ResearchTests(unittest.TestCase):
    def test_window_and_limit_parameters(self):
        # Distinct subjects so clustering does not merge them into one event.
        subjects = ["가격 급등", "재고 소진", "워크스테이션 전환", "유통사 반응", "게이머 불만", "중고 시세", "대만 공급망", "경쟁사 대응", "드라이버 지원", "리뷰어 분석",
                    "환율 영향", "보증 정책", "쿨러 업체", "메모리 수급", "채굴 수요", "데이터센터 우선", "리셀러 단속", "출시 일정", "브랜드 전략", "투자자 시각",
                    "소비자 단체", "협회 조사", "커뮤니티 반응", "유튜버 실험"]
        items = [article(i, f"{subjects[i - 1]} 기사 {i}번", i + 0.5) for i in range(1, 25)]  # 1.5, 2.5, … days old
        self.assertEqual(len(agent.build_candidates(items)), 1, "default 48h window keeps only the newest")
        self.assertEqual(len(agent.build_candidates(items, window_hours=24 * 30, limit=40)), 24)
        self.assertEqual(len(agent.build_candidates(items, window_hours=24 * 30, limit=10)), 10)

    def test_research_op_validates_and_returns_newest_first(self):
        with patch("agent.fetch_source", return_value=[article(1, "RTX 5090 생산 중단 소식 첫 보도 기사 제목", 10), article(2, "RTX 5090 단종설에 가격 급등 우려 커진다", 1)]) as fetch:
            result = agent.handle({"op": "research", "keyword": "  RTX 5090   생산 중단 ", "days": 14, "request_id": "r1"})
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["keyword"], "RTX 5090 생산 중단")
        self.assertEqual(fetch.call_count, 1)
        self.assertIn("news.google.com/rss/search?q=RTX%205090", fetch.call_args.args[0]["url"])
        titles = [c["title"] for c in result["candidates"]]
        self.assertEqual(titles[0], "RTX 5090 단종설에 가격 급등 우려 커진다", "newest first")
        self.assertTrue(all(c["event_id"].startswith("research-") for c in result["candidates"]))
        self.assertTrue(all(c["watch_matches"] == ["RTX 5090 생산 중단"] or c["watch_matches"] == [] for c in result["candidates"]))
        self.assertIn("talk", result["candidates"][0])

    def test_research_rejects_bad_input_before_fetch(self):
        with patch("agent.fetch_source") as fetch:
            self.assertFalse(agent.handle({"op": "research", "keyword": "x", "days": 14})["ok"])
            self.assertFalse(agent.handle({"op": "research", "keyword": "RTX 5090", "days": 3})["ok"])
            self.assertFalse(agent.handle({"op": "research", "keyword": 5, "days": 7})["ok"])
        fetch.assert_not_called()

    def test_research_window_excludes_old_articles(self):
        with patch("agent.fetch_source", return_value=[article(1, "RTX 5090 생산 중단 오래된 기사 제목입니다", 20), article(2, "RTX 5090 생산 중단 최근 기사 제목입니다", 2)]):
            result = agent.handle({"op": "research", "keyword": "RTX 5090", "days": 7})
        self.assertEqual([c["title"] for c in result["candidates"]], ["RTX 5090 생산 중단 최근 기사 제목입니다"])


if __name__ == "__main__":
    unittest.main()
