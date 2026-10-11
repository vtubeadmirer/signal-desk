const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const api={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/rejections.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,TextEncoder,URL,crypto:webcrypto,Date,Map,Set,Uint8Array});
const record=(url='https://example.com/post',title='새로운 게임 밈 모음.jpg')=>({id:api.rejectionId(url),url,title,source_name:'Example',stream:'community',rejectedAt:'2026-10-12T00:00:00Z'});
test('rejections survive serialization and block exact reposts, not related topics',()=>{
 const restored=JSON.parse(JSON.stringify([record()]));
 assert.equal(restored.every(api.rejectionValid),true);
 const index=api.rejectionIndex(restored);
 assert.equal(api.isRejected({url:'https://example.com/post#comments',title:'다른 제목'},index),true);
 assert.equal(api.isRejected({url:'https://other.example/2',title:'새로운 게임 밈 모음.JPG!'},index),true);
 assert.equal(api.isRejected({url:'https://other.example/3',title:'새로운 게임 패치 안내'},index),false);
 assert.equal(api.isRejected({url:'https://other.example/2',title:record().title},api.rejectionIndex([])),false);
});
test('duplicates are retained once and unsafe records are rejected',()=>{
 assert.equal(api.addRejections([record()],[record()]).length,1);
 assert.throws(()=>api.addRejections([],[record('javascript:alert(1)')]));
 assert.equal(api.rejectionValid({...record(),stream:'wrong'}),false);
});
test('front-end and Python fingerprints agree for URL and normalized Korean title',async()=>{
 const hashes=await api.exclusionHashes([record('https://example.com/post/#reply')]);
 const script="import sys;sys.path.insert(0,'python');from rejections import fingerprint,rejection_id,normalized_title;print(fingerprint('u:'+rejection_id(sys.argv[1])));print(fingerprint('t:'+normalized_title(sys.argv[2])))";
 const expected=execFileSync('python',['-c',script,'https://example.com/post/#reply',record().title],{encoding:'utf8'}).trim().split(/\r?\n/);
 assert.deepEqual(Array.from(hashes),expected);
});
test('short generic titles do not hide unrelated URLs',async()=>{
 const entry=record('https://example.com/short','안녕하세요');
 assert.equal(api.isRejected({url:'https://other.example/2',title:'안녕하세요'},api.rejectionIndex([entry])),false);
 assert.equal((await api.exclusionHashes([entry])).length,1);
});
