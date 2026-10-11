from __future__ import annotations
import sys,unittest
from pathlib import Path
from datetime import datetime,timezone
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from rejections import fingerprint, rejection_id, normalized_title, is_rejected
from agent import build_candidates,handle
from editorial import excluded_topic,emergency_scope

class RejectionTests(unittest.TestCase):
    def test_url_identity_ignores_fragment_and_trailing_slash(self):
        digest=fingerprint('u:'+rejection_id('https://example.com/post/'))
        self.assertTrue(is_rejected({'url':'https://example.com/post#comments','title':'another title'},{digest}))

    def test_same_title_repost_blocked_without_blocking_other_topics(self):
        title='새로운 게임 밈 모음.jpg'
        digest=fingerprint('t:'+normalized_title(title))
        self.assertTrue(is_rejected({'url':'https://other.example/2','title':'새로운  게임 밈 모음.JPG!'},{digest}))
        self.assertFalse(is_rejected({'url':'https://other.example/3','title':'새로운 게임 패치의 기능 안내'},{digest}))
        self.assertFalse(is_rejected({'url':'https://other.example/3','title':'안녕하세요'},{fingerprint('t:'+normalized_title('안녕하세요'))}))

    def test_exclusions_applied_before_shortlist_limit(self):
        now=datetime.now(timezone.utc).isoformat()
        items=[{'title':f'제작환경{i} 신규구독정책{i} 이용기준{i} 변경안내{i}','summary':'방송 플랫폼 정책 변경 소식','url':f'https://example.com/news/{i}','published_at':now,'source_name':'Example','tier':'professional'} for i in range(25)]
        exclusions={fingerprint('u:'+item['url']) for item in items[:20]}
        result=build_candidates(items,{'keywords':['방송'],'categories':['IT·플랫폼']},exclusions)
        self.assertEqual(len(result),5)
        self.assertEqual({item['url'] for item in result},{item['url'] for item in items[20:]})

    def test_invalid_hashes_fail_before_fetch(self):
        with patch('agent.fetch_source') as fetch:
            for hashes in ['x',['bad'],['a'*64]*2001]:
                self.assertFalse(handle({'op':'collect','sources':[{'enabled':True}], 'excluded_hashes':hashes})['ok'])
        fetch.assert_not_called()

    def test_reported_bad_examples_are_excluded(self):
        examples=["한국 길바닥에서 술처먹는 똥트남인들", "'12명 사망' 하루만에 미사일 '쾅'…사우디 리야드 공항 또 피격(종합2보)", "폴란드 총리 암살 기도 가능성…공격 계획 용의자 체포(종합)"]
        for title in examples:
            self.assertTrue(excluded_topic({'title':title}),title)
            self.assertEqual(build_candidates([{'title':title,'summary':'공개 소식','url':'https://example.com/a','published_at':datetime.now(timezone.utc).isoformat(),'source_name':'Example','tier':'professional'}]),[])

    def test_domestic_emergency_exception_remains_for_national_crisis(self):
        item={'title':'대한민국 국가 비상사태 선포…미사일 피격에 긴급 대응'}
        self.assertEqual(emergency_scope(item),'domestic')
        self.assertFalse(excluded_topic(item))

if __name__=='__main__':unittest.main()
