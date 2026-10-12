const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const api={};
const watchlist={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/watchlist.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:watchlist,String,Array});
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/streams.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,require:()=>watchlist,Number});
function item(type,i,score=10) {return {source_type:type==='news'?'media':'community',content_type:type==='news'?'news':'community',title:type+i,event_id:type+i,score,category:'게임·인터넷 방송'};}
test('popular community candidates cannot consume the news quota',()=>{
 const news=Array.from({length:25},(_,i)=>item('news',i,i));
 const community=Array.from({length:25},(_,i)=>item('community',i,100));
 const combined=[...community,...news];
 const selected=api.streamCandidates(combined,'news');
 assert.equal(selected.length,20);assert.ok(selected.every(c=>c.source_type==='media'));
 assert.equal(selected[0].event_id,'news24');assert.equal(combined[0].event_id,'community0');
 assert.equal(api.streamCandidates(combined,'community').length,20);
});
test('refreshing or clearing one stream preserves the other results',()=>{
 const news=item('news',1), community=item('community',1), replacement=item('news',2);
 const refreshed=api.replaceStream([news,community],[replacement],'news');
 assert.equal(refreshed.length,2);assert.ok(refreshed.includes(community));assert.ok(refreshed.includes(replacement));
 const cleared=api.replaceStream(refreshed,[],'community');
 assert.equal(cleared.length,1);assert.equal(cleared[0],replacement);
});
test('legacy RSS sources remain news and categorized community posts remain separate',()=>{
 assert.equal(api.sourceStream({name:'RSS'}),'news');
 assert.equal(api.sourceStream({kind:'community'}),'community');
 assert.equal(api.candidateStream(item('community',1)),'community');
 assert.equal(api.streamCandidates([item('news',1),item('community',2)],'news','게임·인터넷 방송').length,1);
});
