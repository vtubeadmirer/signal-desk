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


    def test_creator_news_scores_above_generic_accident(self):
        base = {
            "published_at": "2026-10-10T08:00:00+00:00",
            "tier": "professional",
            "source_type": "media",
            "content_type": "news",
            "collection_method": "rss",
            "usage_status": "review_required",
        }
        items = [
            {
                **base,
                "title": "스트리머 후원 수수료 정책 변경, 창작자 수익에 영향",
                "summary": "플랫폼의 후원 수수료 변경으로 크리에이터 수익과 이용자 선택권에 관심이 모인다.",
                "url": "https://example.com/creator-policy",
                "source_name": "Example IT",
                "category": "IT·플랫폼",
            },
            {
                **base,
                "title": "도심에서 발생한 교통사고, 운전자 조사",
                "summary": "경찰은 사고 경위를 조사하고 있다.",
                "url": "https://example.com/traffic-incident",
                "source_name": "Example News",
                "category": "사회·생활",
            },
        ]

        out = build_candidates(items)
        scores = {item["title"]: item["score"] for item in out}
        creator_title = "스트리머 후원 수수료 정책 변경, 창작자 수익에 영향"
        accident_title = "도심에서 발생한 교통사고, 운전자 조사"

        self.assertIn(creator_title, scores)
        self.assertIn(accident_title, scores)
        self.assertGreater(scores[creator_title], scores[accident_title])

    def test_social_systemic_issue_is_not_automatically_excluded(self):
        items = [{
            "title": "산업 현장 안전 규정 개선 논의, 노동자 보호 대책 검토",
            "summary": "관계 기관과 전문가들이 사고 예방을 위한 제도 개선 방안을 논의했다.",
            "url": "https://example.com/safety-reform",
            "published_at": "2026-10-10T08:00:00+00:00",
            "source_name": "Example News",
            "tier": "professional",
            "category": "사회·생활",
            "source_type": "media",
            "content_type": "news",
            "collection_method": "rss",
            "usage_status": "review_required",
        }]

        out = build_candidates(items)
        self.assertEqual(len(out), 1)
        self.assertNotEqual(out[0]["decision"], "exclude")


    def test_article_content_determines_creator_relevance(self):
        base = {
            "published_at": "2026-10-10T08:00:00+00:00",
            "tier": "professional",
            "source_type": "media",
            "content_type": "news",
            "collection_method": "rss",
            "usage_status": "review_required",
        }
        items = [
            {
                **base,
                "title": "버튜버 신규 데뷔 방송 일정 공개",
                "summary": "새로운 버추얼 유튜버의 첫 방송이 다음 주 시작된다.",
                "url": "https://example.com/vtuber-debut",
                "source_name": "Example News",
                "category": "사회·생활",
            },
            {
                **base,
                "title": "AI 기업 분기 실적 발표 및 신규 모델 공개",
                "summary": "회사는 분기 매출과 영업이익을 발표했다. 신규 모델의 성능 지표도 공개했다.",
                "url": "https://example.com/ai-earnings",
                "source_name": "Example IT",
                "category": "IT·플랫폼",
            },
            {
                **base,
                "title": "AI 영상 생성 도구 업데이트 공개",
                "summary": "창작자가 영상 제작에 활용할 수 있는 생성형 도구의 기능 개선을 발표했다.",
                "url": "https://example.com/ai-video-tool",
                "source_name": "Example News",
                "category": "사회·생활",
            },
        ]

        out = build_candidates(items)
        by_title = {item["title"]: item for item in out}

        creator = by_title["버튜버 신규 데뷔 방송 일정 공개"]
        generic_ai = by_title["AI 기업 분기 실적 발표 및 신규 모델 공개"]
        ai_tool = by_title["AI 영상 생성 도구 업데이트 공개"]

        self.assertEqual(creator["category"], "버튜버·크리에이터")
        self.assertGreater(creator["score"], generic_ai["score"])
        self.assertEqual(ai_tool["category"], "IT·플랫폼")


    def test_unrelated_general_news_has_no_creator_relevance(self):
        from agent import classify

        item = {
            "title": "이탈리아 와이너리서 고급와인 3만병 도난",
            "summary": "현지 경찰이 사건을 조사하고 있다.",
            "category": "사회·생활",
            "tier": "professional",
        }

        category, frames, raw, decision = classify(item)

        self.assertEqual(category, "사회·생활")
        self.assertEqual(raw, 1)
        self.assertEqual(decision, "candidate")


    def test_direct_creator_topic_outranks_generic_policy_news(self):
        from agent import classify

        base = {
            "published_at": "2026-10-10T08:00:00+00:00",
            "tier": "professional",
        }
        creator = {
            **base,
            "title": "버튜버 신규 데뷔 방송 일정 공개",
            "summary": "버추얼 스트리머의 첫 방송 일정이 공개됐다.",
            "category": "사회·생활",
        }
        generic = {
            **base,
            "title": "지역 공공기관 운영 정책 변경 발표",
            "summary": "기관이 일반 행정 운영 정책을 변경한다고 밝혔다.",
            "category": "사회·생활",
        }

        creator_category, _, creator_raw, creator_decision = classify(creator)
        _, _, generic_raw, generic_decision = classify(generic)

        self.assertEqual(creator_category, "버튜버·크리에이터")
        self.assertNotEqual(creator_decision, "exclude")
        self.assertNotEqual(generic_decision, "exclude")
        self.assertGreater(creator_raw, generic_raw)


    def test_dedupes_same_event_across_different_categories(self):
        base = {
            "summary": "페이커 기념우표 발행 소식",
            "published_at": "2026-10-10T08:00:00+00:00",
            "tier": "professional",
            "source_type": "media",
            "content_type": "news",
            "collection_method": "rss",
            "usage_status": "review_required",
        }
        items = [
            {
                **base,
                "title": "페이커 기념우표 발행 일정 공식 발표",
                "url": "https://one.example/faker-stamp",
                "source_name": "A",
                "category": "사회·생활",
            },
            {
                **base,
                "title": "페이커 기념우표 23일 발행 일정 공개",
                "url": "https://two.example/faker-stamp",
                "source_name": "B",
                "category": "게임·인터넷 방송",
            },
        ]

        out = build_candidates(items)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["source_count"], 2)


    def test_dedupes_transitive_faker_stamp_coverage(self):
        base = {
            "summary": "페이커 이상혁 기념우표 및 전시관 관련 소식",
            "published_at": "2026-10-10T05:00:00+00:00",
            "tier": "professional",
            "source_type": "media",
            "content_type": "news",
            "collection_method": "rss",
            "usage_status": "review_required",
        }
        items = [
            {
                **base,
                "title": "전설 페이커 이상혁 기념우표 기획전시관 열린다",
                "url": "https://three.example/faker-stamp",
                "source_name": "연합뉴스",
                "category": "문화",
            },
            {
                **base,
                "title": "LoL GOAT 페이커 최고의 순간들 우표에 담긴다 페이커 전시관도 개관",
                "url": "https://one.example/faker-stamp",
                "source_name": "경향신문",
                "category": "게임",
            },
            {
                **base,
                "title": "페이커 얼굴 우표에 담긴다 이상혁 기념우표 23일 나온다",
                "url": "https://two.example/faker-stamp",
                "source_name": "동아일보",
                "category": "사회",
            },
        ]

        out = build_candidates(items)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["source_count"], 3)


    def test_dedupes_faker_stamp_compound_exhibition_title(self):
        base = {
            "summary": "페이커 이상혁 기념우표와 기획전시관 관련 소식",
            "tier": "professional",
            "source_type": "media",
            "content_type": "news",
            "collection_method": "rss",
            "usage_status": "review_required",
        }
        items = [
            {
                **base,
                "title": "'페이커' 이상혁 기념우표 나온다…기획전시관도 열려",
                "url": "https://etnews.example/faker-stamp",
                "published_at": "2026-10-11T02:39:58+00:00",
                "source_name": "전자신문 IT",
            },
            {
                **base,
                "title": "LoL GOAT 페이커 ‘최고의 순간들’ 우표에 담긴다···‘페이커 전시관’도 개관",
                "url": "https://khan.example/faker-stamp",
                "published_at": "2026-10-10T05:18:00+00:00",
                "source_name": "경향신문",
            },
        ]

        out = build_candidates(items)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["source_count"], 2)

if __name__ == "__main__":
    unittest.main()
