const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { execFileSync } = require('node:child_process');
const streams={};
const transpile=path=>ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
vm.runInNewContext(transpile('src/streams.ts'),{exports:streams});
const api={};
vm.runInNewContext(transpile('src/negativePreferences.ts'),{exports:api,require:name=>name.includes('negative_topics')?JSON.parse(fs.readFileSync('shared/negative_topics.json','utf8')):streams});
function rejection(title,stream='community',i=1){return {id:'https://example.com/'+i,url:'https://example.com/'+i,title,stream,source_name:'Example',rejectedAt:'2026-10-12T00:00:00Z'};}
function candidate(title,stream='community',score=70){return {title,score,source_type:stream==='news'?'media':'community',content_type:stream==='news'?'news':'community'};}
const settings={enabled:true,mode:'balanced',mutedRuleIds:[]};
test('new URLs and rewritten titles on the same learned topic are hidden',()=>{
 const rules=api.learnNegativeRules([rejection('리버풀 후반 결승골 중계')],'balanced');
 const item=candidate('리버풀 동점골 하이라이트 영상');
 assert.equal(api.applyNegativeRules([item],rules).length,0);
 assert.ok(rules.some(rule=>rule.kind==='topic'&&rule.terms[0]==='football_live'));
});
test('repeated rejection increases weights and partial overlap is demoted',()=>{
 const records=[rejection('리버풀 야유 현장', 'community',1),rejection('리버풀 야유 논란','community',2)];
 const rules=api.learnNegativeRules(records,'balanced');
 const pair=rules.find(rule=>rule.kind==='pair'&&rule.terms.includes('리버풀')&&rule.terms.includes('야유'));
 assert.equal(pair.count,2);assert.equal(pair.weight,50);
 const item=candidate('리버풀 팬미팅 일정');
 const lowered=api.applyNegativeRules([item],[pair])[0];
 assert.equal(lowered.score,52);assert.equal(lowered.negative_penalty,18);
 const restored=api.applyNegativeRules([lowered],[])[0];
 assert.equal(restored.score,70);
});
test('muting or undoing sole feedback restores inferred preferences',()=>{
 const rules=api.learnNegativeRules([rejection('리버풀 후반 결승골 중계')],'balanced');
 const muted={...settings,mutedRuleIds:rules.map(rule=>rule.id)};
 assert.equal(api.activeNegativeRules(rules,muted).length,0);
 assert.equal(api.activeNegativeRules(rules,{...settings,enabled:false}).length,0);
 assert.equal(api.learnNegativeRules([],'balanced').length,0);
});
test('broad categories are not inferred from generic words and streams do not bleed',()=>{
 assert.equal(api.learnNegativeRules([rejection('오늘 게임 뉴스와 버튜버 밈 소식')],'balanced').length,0);
 const rules=api.learnNegativeRules([rejection('리버풀 야유 현장')],'balanced');
 assert.equal(api.negativePenalty(candidate('리버풀 야유 현장','news'),rules).penalty,0);
 const strict=api.learnNegativeRules([rejection('리버풀 야유 현장')],'strict');
 assert.ok(strict.some(rule=>rule.kind==='keyword'&&rule.terms[0]==='리버풀'));
});
test('large community history cannot crowd out news learning',()=>{
 const records=[rejection('제조업 현장 구인 문제','news',1),...Array.from({length:100},(_,i)=>rejection(`주제명${i} 특이소재${i} 어떤사건${i} 별도논쟁${i}`,'community',i+2))];
 const rules=api.learnNegativeRules(records,'balanced');
 assert.ok(rules.some(rule=>rule.stream==='news'));
 assert.ok(rules.filter(rule=>rule.stream==='community').length<=300);
});
test('Python and frontend agree on learned penalties and token normalization',()=>{
 const rules=api.learnNegativeRules([rejection('리버풀 야유 현장')],'balanced');
 const items=[candidate('리버풀 야유 논란'),candidate('리버풀 팬미팅 일정'),candidate('새로운 게임 출시 소식'),{...candidate('리버풀 야유 현장'),domestic_emergency:true}];
 const script="import sys,json;sys.path.insert(0,'python');from negative_preferences import negative_penalty,preference_tokens;rules=json.loads(sys.argv[1]);items=json.loads(sys.argv[2]);print(json.dumps({'penalties':[negative_penalty(x,rules)[0] for x in items],'tokens':preference_tokens('제조업 현장에서 청년들이 안오는 이유')},ensure_ascii=True))";
 const result=JSON.parse(execFileSync('python',['-c',script,JSON.stringify(rules),JSON.stringify(items)],{encoding:'utf8'}));
 assert.deepEqual(items.map(item=>api.negativePenalty(item,rules).penalty),result.penalties);
 assert.deepEqual(Array.from(api.preferenceTokens('제조업 현장에서 청년들이 안오는 이유')),result.tokens);
});

test('generic headline grammar cannot become a broad exclusion rule',()=>{
 assert.equal(api.learnNegativeRules([rejection('이런 소식을 보고 정말 생각하는 이유')],'strict').length,0);
 assert.equal(api.learnNegativeRules([rejection('Latest new game news video update')],'strict').length,0);
});
