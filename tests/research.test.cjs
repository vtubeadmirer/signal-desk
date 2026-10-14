const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, deps, extraGlobals = {}) {
  const exportsObject = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports: exportsObject, require: (name) => { if (!(name in deps)) throw new Error('unexpected import ' + name); return deps[name]; }, URL, Date, Set, Map, JSON, Math, String, Number, Array, Object, Boolean, ...extraGlobals });
  return exportsObject;
}
const dictionary = JSON.parse(fs.readFileSync('shared/negative_topics.json', 'utf8'));
const rejections = load('src/rejections.ts', {});
const watchlist = load('src/watchlist.ts', {});
const streams = load('src/streams.ts', { './watchlist': watchlist });
const negative = load('src/negativePreferences.ts', { '../shared/negative_topics.json': { default: dictionary }, './streams': streams });
const history = load('src/history.ts', { './negativePreferences': negative, './rejections': rejections });
const cuesheet = load('src/cuesheet.ts', { './streams': streams, './history': history });
const research = load('src/research.ts', { './negativePreferences': negative, './cuesheet': cuesheet, './watchlist': watchlist });

function cand(i, title, published, extra = {}) {
  return { title, url: `https://example.com/${i}`, event_id: `n-${i}`, category: 'IT·플랫폼', score: 40, source_name: 'S', summary: '', source_type: 'media', content_type: 'news', frames: [], source_count: 1, published_at: published, ...extra };
}

test('google titles split into title and source', () => {
  assert.equal(JSON.stringify(research.splitGoogleTitle('RTX 5090 단종설 확산 - 보드나라')), JSON.stringify({ title: 'RTX 5090 단종설 확산', source: '보드나라' }));
  assert.equal(research.splitGoogleTitle('제목에 하이픈 - 없는 - 경우도 처리').source, '경우도 처리');
  assert.equal(research.splitGoogleTitle('그냥 제목').source, '');
  assert.equal(research.normalizeKeyword('  RTX   5090  '), 'RTX 5090');
});

test('research view merges remote hits with local candidates, log and archive, newest day first', () => {
  const remote = [
    cand(1, 'RTX 5090 생산 중단 보도 - 쿨엔조이', '2026-10-11T08:00:00Z', { source_count: 3, talk: { profile: 'debate', intro: '', keyword: 'RTX 5090', questions: ['가격 오를까요?'], poll: { question: '살 건가요?', options: ['네', '아니오'] } } }),
    cand(2, '엔비디아 RTX 5090 단종? - 보드나라', '2026-10-13T08:00:00Z'),
  ];
  const candidates = [cand(3, 'RTX 5090 가격 급등 전망', '2026-10-13T09:00:00Z'), cand(4, '전혀 다른 기사', '2026-10-13T09:00:00Z')];
  const log = [{ date: '2026-10-09', stream: 'news', id: 'https://example.com/5', title: 'RTX 5090 재고 소진 임박', url: 'https://example.com/5', category: 'IT·플랫폼', score: 30, source_count: 1, watch: false }];
  const records = [{ id: 'https://example.com/6', candidate: cand(6, 'RTX 5090 출시 당시 반응', '2026-10-01T00:00:00Z'), interested: false, labels: [], note: '', broadcastDates: ['2026-10-02'], savedAt: '', updatedAt: '' }];
  const view = research.buildResearchView('RTX 5090', remote, candidates, log, records);
  assert.equal(view.total, 5);
  assert.equal(view.days[0].date, '2026-10-13');
  assert.equal(view.first, '2026-10-01');
  assert.equal(view.last, '2026-10-13');
  const origins = view.days.flatMap((d) => d.hits.map((h) => h.origin));
  assert.ok(origins.includes('search') && origins.includes('candidate') && origins.includes('log') && origins.includes('archive'));
  assert.ok(!view.days.flatMap((d) => d.hits).some((h) => h.title === '전혀 다른 기사'));
  assert.ok(view.sources.some((s) => s.source === '보드나라'));
  const archived = view.days.flatMap((d) => d.hits).find((h) => h.origin === 'archive');
  assert.equal(JSON.stringify(archived.aired), JSON.stringify(['2026-10-02']));
  assert.ok(view.related.every((r) => !/rtx|5090/i.test(r.term)), 'keyword tokens are not suggested as related terms');
  const md = research.researchMarkdown(view);
  assert.ok(md.startsWith('# 리서치 — RTX 5090'));
  assert.ok(md.includes('## 2026-10-13'));
  assert.ok(md.includes('투표: 살 건가요? 1 네  2 아니오'));
  assert.ok(md.includes('방송 2026-10-02'));
});

test('duplicate titles across origins collapse to one hit, keeping the richer origin', () => {
  const remote = [cand(1, '같은 기사 제목입니다 - 매체', '2026-10-13T08:00:00Z')];
  const records = [{ id: 'x', candidate: cand(9, '같은 기사 제목입니다', '2026-10-13T08:00:00Z'), interested: true, labels: [], note: '', broadcastDates: [], savedAt: '', updatedAt: '' }];
  const view = research.buildResearchView('기사', remote, [], [], records);
  assert.equal(view.total, 1);
  assert.equal(view.days[0].hits[0].origin, 'archive');
});
