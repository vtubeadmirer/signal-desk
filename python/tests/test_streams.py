from __future__ import annotations
import sys,unittest
from datetime import datetime,timezone
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from agent import handle

class StreamCollectionTests(unittest.TestCase):
    def setUp(self):
        self.sources=[{'name':'news','enabled':True},{'name':'community','kind':'community','enabled':True}]
        now=datetime.now(timezone.utc).isoformat()
        self.news=[{'title':f'제작환경{i} 신규구독정책{i} 이용기준{i} 변경안내{i}','summary':'방송 플랫폼 정책 변경 소식','url':f'https://example.com/news/{i}','published_at':now,'source_name':'news','tier':'professional','source_type':'media','content_type':'news'} for i in range(25)]
        self.community=[{'title':f'유행밈{i} 게임문화{i} 커뮤니티소식{i} 재미있는짤{i}','summary':'공개 인기글 목록','url':f'https://example.com/community/{i}','published_at':now,'source_name':'community','source_type':'community','content_type':'community','engagement':{'recommendations':100000,'comments':10000,'views':1000000}} for i in range(25)]

    def test_news_keeps_full_quota_without_fetching_high_score_community(self):
        with patch('agent.fetch_source',side_effect=lambda source:self.community if source.get('kind')=='community' else self.news) as fetch:
            result=handle({'op':'collect','sources':self.sources})
        self.assertEqual(fetch.call_count,1)
        self.assertEqual(fetch.call_args.args[0]['name'],'news')
        self.assertEqual(len(result['candidates']),20)
        self.assertTrue(all(c['source_type']=='media' and c['event_id'].startswith('news-') for c in result['candidates']))

    def test_community_has_independent_quota_and_event_ids(self):
        with patch('agent.fetch_source',side_effect=lambda source:self.community if source.get('kind')=='community' else self.news) as fetch:
            result=handle({'op':'collect','sources':self.sources,'stream':'community'})
        self.assertEqual(fetch.call_count,1)
        self.assertEqual(fetch.call_args.args[0]['name'],'community')
        self.assertEqual(len(result['candidates']),20)
        self.assertTrue(all(c['source_type']=='community' and c['event_id'].startswith('community-') for c in result['candidates']))

    def test_invalid_stream_does_not_fetch_any_sources(self):
        with patch('agent.fetch_source') as fetch:
            for stream in ['mixed',{},None]:
                self.assertFalse(handle({'op':'collect','sources':self.sources,'stream':stream})['ok'])
        fetch.assert_not_called()

if __name__=='__main__':unittest.main()
