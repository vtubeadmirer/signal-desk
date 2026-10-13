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
const briefing = load('src/briefing.ts', { './history': history, './streams': streams, './cuesheet': cuesheet, './watchlist': watchlist });

function cand(i, title, extra = {}) {
  return { title, url: `https://example.com/${i}`, event_id: `news-${i}`, category: '사회·생활', score: 50 - i, source_name: 'S', summary: '', source_type: 'media', content_type: 'news', frames: [], published_at: '2026-10-13T08:00:00Z', ...extra };
}

test('briefing fixes watchlist first, keeps one follow-up, one community story and the category cap', () => {
  const candidates = [
    cand(1, '사회 기사 하나'), cand(2, '사회 기사 둘'), cand(3, '사회 기사 셋'),
    cand(4, '페이커 팬미팅 안내', { category: '게임·인터넷 방송', score: 5 }),
    cand(5, '페이커 기념우표 23일 발행 확정', { category: '게임·인터넷 방송', score: 10 }),
    cand(6, '유행 밈 모음', { category: '커뮤니티·밈', score: 1, source_type: 'community', content_type: 'community', talk: { profile: 'empathy', intro: '', keyword: '밈', questions: ['공감?'], poll: null } }),
    cand(7, '이미 방송한 기사 제목입니다', { score: 49 }),
  ];
  const records = [
    { id: 'https://example.com/7', candidate: cand(7, '이미 방송한 기사 제목입니다'), interested: false, labels: [], note: '', broadcastDates: ['2026-10-12'], savedAt: '', updatedAt: '' },
    { id: 'old', candidate: cand(99, '페이커 기념우표 발행 일정 공식 발표'), interested: false, labels: [], note: '그때 채팅 반응 좋았음', broadcastDates: ['2026-10-10'], savedAt: '', updatedAt: '' },
  ];
  const b = briefing.buildBriefing(candidates, records, ['페이커'], '2026-10-13', 5);
  const titles = b.picks.map((p) => p.item.title);
  assert.equal(b.picks.length, 5);
  assert.equal(titles[0], '페이커 기념우표 23일 발행 확정', 'watchlist hit with the higher score comes first');
  assert.equal(titles[1], '페이커 팬미팅 안내');
  assert.ok(titles.includes('유행 밈 모음'), 'at least one community story');
  assert.ok(!titles.includes('이미 방송한 기사 제목입니다'), 'already aired story is skipped');
  assert.equal(titles.filter((t) => t.startsWith('사회 기사')).length, 2, 'category cap of two');
  const stamp = b.picks.find((p) => p.item.title === '페이커 기념우표 23일 발행 확정');
  assert.equal(stamp.prior.followUp, true);
  assert.equal(stamp.prior.note, '그때 채팅 반응 좋았음');
  const md = briefing.briefingMarkdown(b, '2026-10-13');
  assert.ok(md.startsWith('# 오늘의 토크 5 — 2026-10-13'));
  assert.ok(md.includes('- 이어서: 2026-10-10 「페이커 기념우표 발행 일정 공식 발표」 / 내 메모: 그때 채팅 반응 좋았음'));
  assert.ok(md.includes('- 투표:') || md.includes('- 질문: 공감?'));
});

test('carried-over stories lead, and replacePick swaps with an alternate', () => {
  const candidates = [cand(1, '첫 기사'), cand(2, '둘째 기사'), cand(3, '셋째 기사', { category: 'IT·플랫폼' }), cand(4, '넷째 기사', { category: 'IT·플랫폼' })];
  const records = [{ id: 'https://example.com/2', candidate: cand(2, '둘째 기사'), interested: false, labels: [], note: '', broadcastDates: ['2026-10-12'], reactions: { '2026-10-12': 'skipped' }, savedAt: '', updatedAt: '' }];
  const b = briefing.buildBriefing(candidates, records, [], '2026-10-13', 2);
  assert.equal(b.picks[0].item.title, '둘째 기사');
  assert.ok(b.picks[0].reason.includes('못 다룬'));
  assert.equal(b.picks.length, 2);
  assert.equal(b.alternates.length, 2);
  const swapped = briefing.replacePick(b, b.picks[1].item.event_id);
  assert.notEqual(swapped.picks[1].item.event_id, b.picks[1].item.event_id);
  assert.ok(swapped.alternates.some((item) => item.event_id === b.picks[1].item.event_id), 'the replaced pick becomes an alternate');
  assert.equal(briefing.buildBriefing([], [], [], '2026-10-13').picks.length, 0);
});
