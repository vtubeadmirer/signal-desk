from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agent
from talk_angles import dictionary_path, engagement_profile, main_keyword, talk_angles


class TalkAngleTests(unittest.TestCase):
    def test_keyword_prefers_watchlist_then_specific_title_token(self):
        self.assertEqual(main_keyword({"title": "치지직 후원 수수료 인상 발표", "watch_matches": ["치지직"]}), "치지직")
        self.assertEqual(main_keyword({"title": "오늘 뉴스 속보 발표"}), "이 소식")
        self.assertEqual(main_keyword({"title": "홀로라이브 신규 멤버 데뷔"}), "홀로라이브")

    def test_profiles_from_community_engagement_and_news_frames(self):
        self.assertEqual(engagement_profile({"source_type": "community", "engagement": {"recommendations": 30, "comments": 40}}), "debate")
        self.assertEqual(engagement_profile({"source_type": "community", "engagement": {"recommendations": 80, "comments": 5}}), "empathy")
        self.assertEqual(engagement_profile({"source_type": "community", "engagement": {"recommendations": 2, "comments": 1}}), "info")
        self.assertEqual(engagement_profile({"frames": ["비용·과금"], "category": "IT·플랫폼"}), "debate")
        self.assertEqual(engagement_profile({"frames": [], "category": "버튜버·크리에이터"}), "empathy")
        self.assertEqual(engagement_profile({"frames": [], "category": "사회·생활", "tier": "official"}), "info")

    def test_angles_are_filled_deterministic_and_bounded(self):
        item = {"url": "https://example.com/fee", "title": "치지직 후원 수수료 인상 발표", "frames": ["비용·과금"], "category": "IT·플랫폼", "source_name": "전자신문"}
        first = talk_angles(item)
        second = talk_angles(dict(item))
        self.assertEqual(first, second, "same article must always get the same angle")
        self.assertEqual(first["profile"], "debate")
        self.assertTrue(1 <= len(first["questions"]) <= 3)
        self.assertTrue(all("{" not in q for q in first["questions"]), "all slots filled")
        self.assertTrue(any("치지직" in q or "수수료" in q for q in first["questions"]))
        self.assertIsNotNone(first["poll"])
        self.assertTrue(2 <= len(first["poll"]["options"]) <= 4)
        self.assertIn(first["keyword"], first["poll"]["question"])

    def test_different_articles_vary_and_unknown_category_still_gets_profile_angle(self):
        a = talk_angles({"url": "https://example.com/1", "title": "페이커 우승 기념 행사", "frames": [], "category": "게임·인터넷 방송"})
        b = talk_angles({"url": "https://example.com/2", "title": "확률형 아이템 규제 법안", "frames": ["게임 경험"], "category": "게임·인터넷 방송"})
        self.assertNotEqual(a["questions"], b["questions"])
        c = talk_angles({"url": "https://example.com/3", "title": "알 수 없는 분류의 기사 제목", "frames": [], "category": "기타"})
        self.assertTrue(c["questions"], "profile templates cover articles without frame/category templates")

    def test_build_candidates_attaches_talk_block(self):
        item = {"title": "치지직 후원 수수료 인상 발표", "summary": "플랫폼의 수수료 정책 변경으로 크리에이터 수익에 영향", "url": "https://example.com/fee", "published_at": datetime.now(timezone.utc).isoformat(), "source_name": "Example", "tier": "professional", "source_type": "media", "content_type": "news", "category": "IT·플랫폼"}
        out = agent.build_candidates([item])
        self.assertEqual(len(out), 1)
        talk = out[0]["talk"]
        self.assertIn(talk["profile"], {"debate", "empathy", "info"})
        self.assertTrue(talk["questions"])
        self.assertEqual(out[0]["talk"]["keyword"], "치지직")

    def test_packaged_dictionary_path(self):
        with patch.object(sys, "frozen", True, create=True), patch.object(sys, "_MEIPASS", "bundle", create=True):
            self.assertEqual(dictionary_path(), Path("bundle/shared/talk_angles.json"))


if __name__ == "__main__":
    unittest.main()
