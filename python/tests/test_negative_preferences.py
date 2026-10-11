from __future__ import annotations
import sys,unittest
from pathlib import Path
from datetime import datetime,timezone
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from negative_preferences import preference_tokens,negative_penalty,validate_rules,dictionary_path
from agent import build_candidates,handle

def candidate(title,kind='community'):
 return {'title':title,'summary':'공개 목록의 화제입니다. 방송에서 논의할 수 있는 내용입니다.','url':'https://example.com/'+str(abs(hash(title))),'published_at':datetime.now(timezone.utc).isoformat(),'source_type':kind,'content_type':'community' if kind=='community' else 'news','source_name':'Example','category':'게임·인터넷 방송','tier':'professional'}
def pair(weight=40,stream='community'):
 return {'kind':'pair','terms':['리버풀','야유'],'weight':weight,'stream':stream,'label':'리버풀 + 야유'}

class NegativePreferenceTests(unittest.TestCase):
 def test_general_words_are_not_learning_keywords(self):
  self.assertEqual(preference_tokens('오늘의 새로운 게임 뉴스와 버튜버 밈 관련 소식'),[])
  self.assertEqual(preference_tokens('이런 소식을 보고 정말 생각하는 이유'),[])
  self.assertEqual(preference_tokens('Latest new game news video update'),[])
  self.assertEqual(preference_tokens('제조업 현장에서 청년들이 안오는 이유')[:2],['제조업','현장'])
 def test_topic_similarity_suppressed_before_ranking_and_positive_bonus(self):
  rules=validate_rules([{'kind':'topic','terms':['football_live'],'weight':40,'stream':'community'}],'community')
  stats={}
  out=build_candidates([candidate('리버풀 후반 동점골 하이라이트 영상')],{'keywords':['리버풀'],'categories':['게임·인터넷 방송']},set(),rules,stats)
  self.assertEqual(out,[]);self.assertEqual(stats['suppressed'],1)
 def test_partial_overlap_lowers_score_and_zero_overlap_is_unchanged(self):
  item=candidate('리버풀 팬미팅 행사 일정 소개')
  baseline=build_candidates([item])[0]
  out=build_candidates([item],None,None,[pair()])[0]
  self.assertEqual(out['negative_penalty'],14)
  self.assertEqual(out['score'],baseline['score']-14)
  self.assertEqual(out['score_before_negative'],baseline['score'])
  unrelated=candidate('버튜버 신규 음성 도구 출시 안내')
  self.assertEqual(negative_penalty(unrelated,[pair()])[0],0)
 def test_streams_remain_independent_and_domestic_emergency_is_protected(self):
  self.assertEqual(negative_penalty(candidate('리버풀 야유 현장 뉴스','media'),[pair()])[0],0)
  rule={'kind':'pair','terms':['미사일','피격'],'weight':80,'stream':'news','label':'미사일 + 피격'}
  self.assertEqual(negative_penalty(candidate('대한민국 국가 비상사태 선포 미사일 피격 긴급 대응','media'),[rule])[0],0)
 def test_partial_rounding_matches_javascript(self):
  item=candidate('리버풀 팬미팅 행사 안내')
  self.assertEqual([negative_penalty(item,[pair(w)])[0] for w in [40,50,60,70,80]],[14,18,21,25,28])
 def test_invalid_or_overbroad_rules_rejected_before_fetch(self):
  with patch('agent.fetch_source') as fetch:
   for rule in [pair(stream='news'),{'kind':[],'terms':[],'weight':40,'stream':'community'},{'kind':'keyword','terms':['게임'],'weight':80,'stream':'community'}]:
    self.assertFalse(handle({'op':'collect','stream':'community','sources':[{'kind':'community','enabled':True}],'negative_rules':[rule]})['ok'])
  fetch.assert_not_called()
 def test_packaged_dictionary_path(self):
  with patch.object(sys,'frozen',True,create=True),patch.object(sys,'_MEIPASS','bundle',create=True):
   self.assertEqual(dictionary_path(),Path('bundle/shared/negative_topics.json'))

if __name__=='__main__':unittest.main()
