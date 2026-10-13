const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, deps, extraGlobals = {}) {
  const exportsObject = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports: exportsObject, require: (name) => { if (!(name in deps)) throw new Error('unexpected import ' + name); return deps[name]; }, URL, Date, Set, Map, JSON, TextEncoder, Math, String, Number, Array, Object, console, ...extraGlobals });
  return exportsObject;
}
const dictionary = JSON.parse(fs.readFileSync('shared/negative_topics.json', 'utf8'));
const rejections = load('src/rejections.ts', {});
const watchlist = load('src/watchlist.ts', {});
const streams = load('src/streams.ts', { './watchlist': watchlist });
const negative = load('src/negativePreferences.ts', { '../shared/negative_topics.json': { default: dictionary }, './streams': streams });
const history = load('src/history.ts', { './negativePreferences': negative, './rejections': rejections });
const persist = load('src/persist.ts', { '@tauri-apps/plugin-fs': { BaseDirectory: {} }, './state': {} }, { window: {}, setTimeout, clearTimeout });

function candidate(i, overrides = {}) {
  return { title: `기사 ${i}`, summary: '', url: `https://example.com/${i}`, score: i, event_id: `news-${i}`, source_type: 'media', content_type: 'news', category: '게임·인터넷 방송', ...overrides };
}

test('watchlist terms are normalized, deduplicated and bounded', () => {
  let list = watchlist.addWatchTerm([], '  페이커  ');
  list = watchlist.addWatchTerm(list, '페이커');
  list = watchlist.addWatchTerm(list, 'x');
  list = watchlist.addWatchTerm(list, 'Chzzk');
  assert.equal(JSON.stringify(list), JSON.stringify(['페이커', 'Chzzk']));
  assert.ok(watchlist.watchlistValid(list));
  assert.ok(!watchlist.watchlistValid(['  spaced']));
  assert.ok(!watchlist.watchlistValid(Array.from({ length: 51 }, (_, i) => `t${i}`)));
  assert.equal(JSON.stringify(watchlist.watchMatches({ title: '치지직 공지', summary: 'chzzk update' }, list)), JSON.stringify(['Chzzk']));
});

test('watchlist hits float above higher-scoring candidates in the stream view', () => {
  const items = Array.from({ length: 25 }, (_, i) => candidate(i));
  items.push(candidate(99, { title: '페이커 팬미팅', score: 0 }));
  const plain = streams.streamCandidates(items, 'news');
  assert.ok(!plain.some((item) => item.title === '페이커 팬미팅'));
  const watched = streams.streamCandidates(items, 'news', '전체', ['페이커']);
  assert.equal(watched[0].title, '페이커 팬미팅');
  assert.equal(watched[1].score, 24, 'the rest stays score-ordered');
  assert.equal(watched.length, 20);
});

test('prior broadcast is found by url, exact title, or strong topic overlap within the window', () => {
  const records = [
    { id: 'a', candidate: candidate(1, { url: 'https://news.example/story', title: '페이커 기념우표 발행 일정 공식 발표' }), interested: false, labels: [], note: '', broadcastDates: ['2026-10-05', '2026-10-10'], savedAt: '', updatedAt: '' },
    { id: 'b', candidate: candidate(2, { title: '오래된 기사 제목입니다' }), interested: false, labels: [], note: '', broadcastDates: ['2026-09-01'], savedAt: '', updatedAt: '' },
    { id: 'c', candidate: candidate(3, { title: '저장만 하고 방송 안 함 페이커 기념우표' }), interested: true, labels: [], note: '', broadcastDates: [], savedAt: '', updatedAt: '' },
  ];
  const today = '2026-10-13';
  const byUrl = history.findPriorBroadcast({ url: 'https://news.example/story#x', title: '다른 제목' }, records, today);
  assert.equal(JSON.stringify([byUrl.date, byUrl.reason, byUrl.followUp]), JSON.stringify(['2026-10-10', 'url', false]));
  const newer = history.findPriorBroadcast({ url: 'https://other.example/9', title: '페이커 기념우표 발행 23일 확정', published_at: '2026-10-12T09:00:00Z' }, records, today);
  assert.equal(newer.reason, 'topic');
  assert.equal(newer.followUp, true, 'a newer article on an aired topic is a follow-up');
  const older = history.findPriorBroadcast({ url: 'https://other.example/9', title: '페이커 기념우표 발행 23일 확정', published_at: '2026-10-09T09:00:00Z' }, records, today);
  assert.equal(older.followUp, false, 'an article older than the broadcast is a repeat, not a follow-up');
  assert.equal(history.findPriorBroadcast({ url: 'https://other.example/1', title: '페이커 기념우표 발행 일정 공식 발표!' }, records, today).reason, 'title');
  assert.equal(history.findPriorBroadcast({ url: 'https://other.example/2', title: '페이커 기념우표 발행 23일 확정' }, records, today).reason, 'topic');
  assert.equal(history.findPriorBroadcast({ url: 'https://other.example/3', title: '오래된 기사 제목입니다' }, records, today), null, 'outside the 14-day window');
  assert.equal(history.findPriorBroadcast({ url: 'https://other.example/4', title: '전혀 다른 신작 게임 출시 소식' }, records, today), null);
});

test('snapshot pruning keeps the newest seven dated copies', () => {
  const names = ['state-2026-10-01.json', 'state-2026-10-02.json', 'state-2026-10-02-migration.json', 'state-2026-10-03.json', 'state-2026-10-04.json', 'state-2026-10-05.json', 'state-2026-10-06.json', 'state-2026-10-07.json', 'state-2026-10-08.json', 'notes.txt'];
  assert.equal(JSON.stringify(persist.snapshotsToPrune(names)), JSON.stringify(['state-2026-10-01.json', 'state-2026-10-02-migration.json']));
  assert.equal(persist.snapshotsToPrune(['state-2026-10-08.json']).length, 0);
});
