const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const rejectionApi = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/rejections.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:rejectionApi,URL,Date,Set,Map});
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/backup.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject,require:()=>rejectionApi,TextEncoder,URL,Date,Set,JSON});
const api=exportsObject;
function data() {
 const candidate={priority:1,slide_order:1,score:70,score_raw:12,talkability:80,verification_cost:40,context_required:30,source_count:1,category:'커뮤니티·밈',event_id:'event-1',title:'게임 밈',summary:'원문 확인',source_name:'루리웹',published_at:'2026-10-12T00:00:00Z',url:'https://bbs.ruliweb.com/best/board/1/read/2',keywords:['게임'],frames:['게임 경험'],source_ready:true,decision:'manual_review',content_type:'community',source_type:'community',collection_method:'public_list',usage_status:'review_required',confirmed_facts:['자료에 있는 내용'],caveats:['원문 확인'],discussion_points:['어떤 점이 재미있는가'],why_now:'최근 화제'};
 return {articles:[{id:candidate.url,candidate,interested:true,labels:['내 방송'],note:'내 메모',broadcastDates:['2026-10-12','2026-10-14'],savedAt:'2026-10-12T01:00:00Z',updatedAt:'2026-10-12T02:00:00Z'}],sources:[{name:'루리웹',url:'https://bbs.ruliweb.com/best/humor',kind:'community',tier:'approved_feed',category:'커뮤니티·밈',enabled:true}],provider:'codex',selectedBroadcastDate:'2026-10-14'};
}
test('backup roundtrip preserves articles, AI output, notes, dates and sources',()=>{
 const original=data(), restored=api.parseBackup(api.serializeBackup(original));
 for(const key of Object.keys(original)) assert.deepEqual(restored[key],original[key]);
 assert.equal(restored.version,1);
});
test('malformed, future-version and unsafe-link backups are rejected',()=>{
 const original=JSON.parse(api.serializeBackup(data()));
 assert.throws(()=>api.parseBackup(JSON.stringify({...original,version:2})));
 original.articles[0].candidate.url='javascript:alert(1)';
 assert.throws(()=>api.parseBackup(JSON.stringify(original)));
 original.articles[0].candidate.url=data().articles[0].candidate.url;
 original.articles[0].broadcastDates=['2026-02-31'];
 assert.throws(()=>api.parseBackup(JSON.stringify(original)));
 original.articles[0].broadcastDates=['2026-10-12'];original.articles.push(original.articles[0]);
 assert.throws(()=>api.parseBackup(JSON.stringify(original)));
});

test('backup preserves rejection preferences and accepts old backups without them',()=>{
 const original=data();
 original.rejectedItems=[{id:'https://example.com/excluded',url:'https://example.com/excluded',title:'제외한 게임 밈 제목',source_name:'Example',stream:'community',rejectedAt:'2026-10-12T00:00:00Z'}];
 const restored=api.parseBackup(api.serializeBackup(original));
 assert.deepEqual(restored.rejectedItems,original.rejectedItems);
 delete original.rejectedItems;
 assert.equal(api.parseBackup(api.serializeBackup(original)).rejectedItems,undefined);
});
test('invalid rejected-item backup does not reach restore',()=>{
 const original=JSON.parse(api.serializeBackup(data()));
 original.rejectedItems=[{id:'javascript:alert(1)',url:'javascript:alert(1)',title:'invalid',source_name:'Example',stream:'community',rejectedAt:'2026-10-12T00:00:00Z'}];
 assert.throws(()=>api.parseBackup(JSON.stringify(original)));
});

test('backup preserves learning switches and muted rule IDs',()=>{
 const original=data();original.rejectionLearning={enabled:true,mode:'strict',mutedRuleIds:['news:pair:제조업|현장']};
 const restored=api.parseBackup(api.serializeBackup(original));
 assert.deepEqual(restored.rejectionLearning,original.rejectionLearning);
 original.rejectionLearning.mode='invalid';
 assert.throws(()=>api.serializeBackup(original));
});

test('invalid learned-score metadata is rejected on import',()=>{
 const original=data();original.articles[0].candidate.negative_penalty='80';
 assert.throws(()=>api.serializeBackup(original));
});
