from __future__ import annotations
import sys, unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from editorial import emergency_scope, excluded_topic
from community import parse_community, community_site, robots_allowed
from agent import build_candidates

class EditorialTests(unittest.TestCase):
    def test_domestic_emergency_requires_clear_country(self):
        self.assertEqual(emergency_scope({'title':'대한민국 대통령, 비상계엄 선포'}),'domestic')
        self.assertEqual(emergency_scope({'title':'대한민국 국가 비상사태 선언, 해외 반응'}),'domestic')
        for title in ['페루 국가 비상사태 선포, 한국 여행객 주의','한국 정부, 페루 국가 비상사태 관련 여행 경보','이스라엘 국가 비상사태 선포','에콰도르 9개 주 비상사태 선포','대통령 비상계엄 선포']:
            self.assertEqual(emergency_scope({'title':title}),'foreign_or_unknown',title)

    def test_crime_exclusion_precedes_personalization(self):
        for title in ['스트리머 살인미수 사건','학생 실종 사건','가해자 살해 사건','유튜버 흉기 폭행','피해자 신상털기','후방주의 야짤']:
            self.assertTrue(excluded_topic({'title':title}),title)
            item={'title':title,'url':'https://example.com/post','published_at':datetime.now(timezone.utc).isoformat(),'summary':'게임 관련 사건','category':'게임·인터넷 방송'}
            self.assertEqual(build_candidates([item],{'keywords':['게임'],'categories':['게임·인터넷 방송']}),[])

    def test_foreign_emergency_not_returned_as_low_score_candidate(self):
        item={'title':'파키스탄 국가 비상사태 선언','summary':'한국 여행객 주의','url':'https://example.com/post','published_at':datetime.now(timezone.utc).isoformat()}
        self.assertEqual(build_candidates([item]),[])

class CommunityTests(unittest.TestCase):
    now=datetime(2026,10,12,1,0,tzinfo=timezone.utc)
    def test_dc_list_metadata_and_canonical_url(self):
        html='''<table><tr class="ub-content" data-type="icon_notice"><td class="gall_tit"><a href="/mini/board/view/?id=virtual_streamer&no=1">공지</a></td></tr><tr class="ub-content"><td class="gall_tit"><a href="/mini/board/view/?id=virtual_streamer&no=2&page=1"><em></em>버튜버 새 밈 모음</a><a class="reply_numbox"><span class="reply_num">[7]</span></a></td><td class="gall_date" title="2026-10-12 09:40:00"></td><td class="gall_recommend">25</td><td class="gall_count">1,200</td></tr></table>'''
        out=parse_community(html.encode(),{'url':'https://gall.dcinside.com/mini/board/lists/?id=virtual_streamer'},self.now)
        self.assertEqual(len(out),1);self.assertEqual(out[0]['engagement']['views'],1200)
        self.assertEqual(out[0]['url'],'https://gall.dcinside.com/mini/board/view/?id=virtual_streamer&no=2')
        self.assertEqual(out[0]['title'],'버튜버 새 밈 모음')
        candidates=build_candidates([{**out[0],'published_at':datetime.now(timezone.utc).isoformat()}])
        self.assertEqual(candidates[0]['decision'],'manual_review')
        self.assertEqual(candidates[0]['source_type'],'community')

    def test_fm_relative_date_and_external_link_rejection(self):
        html='''<li class="li"><h3 class="title"><a href="/best/123"><span class="ellipsis-target">새로운 게임 밈</span><span class="comment_count">[14]</span></a></h3><span class="count">40</span><span class="regdate">30 분 전</span></li><li class="li"><h3 class="title"><a href="https://evil.example/456"><span class="ellipsis-target">외부 광고</span></a></h3><span class="regdate">10 분 전</span></li>'''
        out=parse_community(html.encode(),{'url':'https://www.fmkorea.com/best2'},self.now)
        self.assertEqual(len(out),1);self.assertEqual(out[0]['url'],'https://www.fmkorea.com/123')
        self.assertEqual(out[0]['published_at'],'2026-10-12T00:30:00+00:00')

    def test_ruli_midnight_and_missing_dates(self):
        html='''<tr class="table_body"><td><a class="subject_link" href="/best/board/300143/read/123?m=humor"><strong>유행하는 게임 짤</strong><span class="num_reply">(12)</span></a></td><td class="time">23:50</td><td class="recomd">55</td><td class="hit">2,000</td></tr><tr class="table_body"><a class="subject_link" href="/read/124"><strong>날짜 없음</strong></a></tr>'''
        out=parse_community(html.encode(),{'url':'https://bbs.ruliweb.com/best/humor'},self.now)
        self.assertEqual(len(out),1);self.assertEqual(out[0]['published_at'],'2026-10-11T23:50:00+09:00')

    def test_list_allowlist_does_not_fetch_article_or_private_host(self):
        for url in ['https://127.0.0.1/best','https://www.fmkorea.com/123','https://gall.dcinside.com/board/view/?id=game&no=1']:
            with self.assertRaises(ValueError):community_site(url)

    def test_robots_longest_match_wildcards_and_named_groups(self):
        robots='User-agent: GPTBot\nDisallow: /\nUser-agent: *\nDisallow: /\nAllow: /best\nDisallow: /*search_key=\n'
        self.assertTrue(robots_allowed(robots,'https://www.fmkorea.com/best2'))
        self.assertFalse(robots_allowed(robots,'https://www.fmkorea.com/best?search_key=x'))
        self.assertFalse(robots_allowed(robots,'https://www.fmkorea.com/123'))
        self.assertTrue(robots_allowed('User-agent: *\nDisallow: /\nAllow: /$','https://example.com/'))
        self.assertFalse(robots_allowed('User-agent: *\nDisallow: /\nAllow: /$','https://example.com/posts'))

if __name__=='__main__':unittest.main()
