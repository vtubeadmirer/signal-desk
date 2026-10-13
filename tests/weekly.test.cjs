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
const weekly = load('src/weekly.ts', { './negativePreferences': negative, './rejections': rejections, './streams': streams });

function cand(i, title, extra = {}) {
  return { title, url: `https://example.com/${i}`, category: '게임·인터넷 방송', score: 50, source_count: 1, source_type: 'media', content_type: 'news', event_id: `news-${i}`, ...extra };
}

test('appendRun records top candidates once per day and prunes beyond 30 days', () => {
  let log = weekly.appendRun([], [cand(1, '페이커 기념우표 발행 일정 공식 발표', { watch_matches: ['페이커'] })], 'news', '2026-10-13');
  assert.equal(log.length, 1);
  assert.equal(log[0].watch, true);
  log = weekly.appendRun(log, [cand(1, '페이커 기념우표 발행 일정 공식 발표 (수정)')], 'news', '2026-10-13');
  assert.equal(log.length, 1, 'same story same day is replaced');
  assert.equal(log[0].title, '페이커 기념우표 발행 일정 공식 발표 (수정)');
  log = weekly.appendRun(log, [cand(2, '오래된 기사 제목입니다')], 'news', '2026-09-01');
  assert.equal(weekly.pruneLog(log, '2026-10-13').length, 1, '42-day-old entry is pruned');
  assert.ok(weekly.collectionEntryValid(log[0]));
  assert.ok(!weekly.collectionEntryValid({ ...log[0], date: '13/10/2026' }));
});

test('weekly report finds persistent, rising and new terms plus missed stories', () => {
  let log = [];
  // "페이커 기념우표" appears 4 days this week, 1 day last week; "홀로라이브 콘서트" is brand new for 2 days.
  for (const d of ['2026-10-08', '2026-10-10', '2026-10-11', '2026-10-13']) log = weekly.appendRun(log, [cand(d, `페이커 기념우표 발행 소식 ${d}`)], 'news', d);
  log = weekly.appendRun(log, [cand('old', '페이커 기념우표 처음 발표')], 'news', '2026-10-02');
  for (const d of ['2026-10-12', '2026-10-13']) log = weekly.appendRun(log, [cand('h' + d, `홀로라이브 콘서트 티켓 예매 안내 ${d}`, { score: 70 })], 'news', d);
  const records = [{ id: 'https://example.com/2026-10-10', candidate: cand('2026-10-10', '페이커 기념우표 발행 소식'), interested: false, labels: [], note: '', broadcastDates: ['2026-10-10'], savedAt: '', updatedAt: '2026-10-10T00:00:00Z' }];
  const report = weekly.weeklyReport(log, records, '2026-10-13');
  assert.equal(report.from, '2026-10-07');
  assert.equal(report.runs, 5);
  assert.ok(report.persistent.some((t) => t.term === '기념우표' && t.days === 4));
  assert.ok(report.risers.some((t) => t.term === '기념우표' && t.lastWeek === 1 && t.thisWeek === 4));
  assert.ok(report.newcomers.some((t) => t.term === '홀로라이브' && t.days === 2));
  assert.ok(!report.newcomers.some((t) => t.term === '기념우표'), 'seen last week, so not a newcomer');
  assert.equal(report.aired.length, 1);
  assert.ok(report.missed.some((e) => e.title.startsWith('홀로라이브')), 'high-scoring story never saved is a miss');
  assert.ok(!report.missed.some((e) => e.id === 'https://example.com/2026-10-10'), 'aired story is not a miss');
  const md = weekly.weeklyRecapMarkdown(report);
  assert.ok(md.includes('# 이번 주 정리 — 2026-10-07 ~ 2026-10-13'));
  assert.ok(md.includes('## 이번 주 계속 올라온 이야기'));
  assert.ok(md.includes('홀로라이브'));
  const terms = weekly.persistentTerms(log, '2026-10-13');
  assert.equal(weekly.persistentHit({ title: '페이커 기념우표 23일 발행' }, terms).days, 4);
  assert.equal(weekly.persistentHit({ title: '전혀 다른 신작 게임' }, terms), null);
});
