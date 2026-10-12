const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Transpile the pure modules and wire their relative imports together.
function load(file, deps, extraGlobals = {}) {
  const exportsObject = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports: exportsObject, require: (name) => { if (!(name in deps)) throw new Error('unexpected import ' + name); return deps[name]; }, URL, Date, Set, Map, JSON, TextEncoder, Math, String, Number, Array, Object, ...extraGlobals });
  return exportsObject;
}
const rejections = load('src/rejections.ts', {});
const watchlist = load('src/watchlist.ts', {});
const backup = load('src/backup.ts', { './rejections': rejections, './watchlist': watchlist });
const storage = load('src/storage.ts', { './rejections': rejections, './backup': backup }, { localStorage: { getItem: () => null } });
const state = load('src/state.ts', { './rejections': rejections, './backup': backup, './storage': storage, './watchlist': watchlist });
const streams = load('src/streams.ts', { './watchlist': watchlist });
const cuesheet = load('src/cuesheet.ts', { './streams': streams });
const youtube = load('src/youtube.ts', {});

function candidate(overrides = {}) {
  return { priority: 1, slide_order: 1, score: 70, score_raw: 12, talkability: 80, verification_cost: 40, context_required: 30, source_count: 2, category: '게임·인터넷 방송', event_id: 'news-event-1', title: '게임 업데이트 발표', summary: '요약', source_name: '연합뉴스', published_at: '2026-10-12T00:00:00Z', url: 'https://example.com/a', keywords: ['게임'], frames: [], source_ready: true, decision: 'candidate', content_type: 'news', source_type: 'media', collection_method: 'rss', usage_status: 'review_required', ...overrides };
}

test('sanitizeState falls back per field and drops only invalid rows', () => {
  const good = { id: 'https://example.com/a', candidate: candidate(), interested: true, labels: [], note: '', broadcastDates: ['2026-10-13'], savedAt: 'x', updatedAt: 'y' };
  const out = state.sanitizeState({ sources: 'nope', articles: [good, { broken: true }], rejectedItems: [{ id: 'bad' }], rejectionLearning: { enabled: 'yes' }, selectedBroadcastDate: '13/10/2026', provider: 'other' });
  assert.equal(out.sources.length, storage.DEFAULT_SOURCES.length);
  assert.equal(JSON.stringify(out.articles), JSON.stringify([good]));
  assert.equal(out.rejectedItems.length, 0);
  assert.equal(JSON.stringify(out.rejectionLearning), JSON.stringify(rejections.DEFAULT_LEARNING));
  assert.match(out.selectedBroadcastDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(out.provider, 'codex');
  assert.equal(out.version, 1);
  assert.equal(out.watchlist.length, 0);
  assert.equal(state.sanitizeState({ watchlist: ['페이커', 'bad  spacing'] }).watchlist.length, 0, 'an invalid list falls back as a whole');
  assert.equal(JSON.stringify(state.sanitizeState({ watchlist: ['페이커'] }).watchlist), JSON.stringify(['페이커']));
});

test('legacy localStorage layout migrates into one document and is detected only when present', () => {
  assert.equal(state.migrateLegacyStorage({ getItem: () => null }), null);
  const map = new Map([
    [storage.ARTICLES_KEY, JSON.stringify([{ id: 'https://example.com/a', candidate: candidate(), interested: true, labels: ['x'], note: 'n', broadcastDates: [], savedAt: 'a', updatedAt: 'b' }])],
    [storage.DATE_KEY, '2026-10-14'],
    [storage.REJECTIONS_KEY, JSON.stringify([{ id: 'https://example.com/r', url: 'https://example.com/r', title: '제외한 글 제목입니다', source_name: 'E', stream: 'news', rejectedAt: '2026-10-12T00:00:00Z' }])],
  ]);
  const migrated = state.migrateLegacyStorage({ getItem: (k) => map.get(k) ?? null });
  assert.equal(migrated.articles.length, 1);
  assert.equal(migrated.selectedBroadcastDate, '2026-10-14');
  assert.equal(migrated.rejectedItems.length, 1);
  assert.equal(migrated.communityPresetsApplied, false, 'presets flag was never set in the old layout');
  assert.equal(migrated.sources.length, storage.DEFAULT_SOURCES.length);
});

test('cue sheet lists only the selected date, highest score first, with notes and caveats', () => {
  const records = [
    { id: 'a', candidate: candidate({ title: '둘째', score: 50, url: 'https://example.com/2', discussion_points: ['포인트 A'], caveats: ['확인 필요'] }), interested: false, labels: ['내 분류'], note: '첫 줄\n둘째 줄', broadcastDates: ['2026-10-13'], savedAt: '', updatedAt: '' },
    { id: 'b', candidate: candidate({ title: '첫째', score: 90, url: 'https://example.com/1', source_type: 'community', content_type: 'community' }), interested: false, labels: [], note: '', broadcastDates: ['2026-10-13'], savedAt: '', updatedAt: '' },
    { id: 'c', candidate: candidate({ title: '다른 날', url: 'https://example.com/3' }), interested: false, labels: [], note: '', broadcastDates: ['2026-10-20'], savedAt: '', updatedAt: '' },
  ];
  const text = cuesheet.buildCueSheet(records, '2026-10-13');
  assert.ok(text.startsWith('# 방송 큐시트 — 2026-10-13'));
  assert.ok(text.indexOf('## 1. 첫째') < text.indexOf('## 2. 둘째'));
  assert.ok(!text.includes('다른 날'));
  assert.ok(text.includes('커뮤니티·밈'));
  assert.ok(text.includes('  - 포인트 A'));
  assert.ok(text.includes('- 방송 전 확인:'));
  assert.ok(text.includes('- 메모: 첫 줄 / 둘째 줄'));
  assert.ok(text.includes('- 내 분류: 내 분류'));
  assert.ok(cuesheet.buildCueSheet([], '2026-10-13').includes('담긴 기사가 없습니다'));
});

test('youtube channel input accepts IDs and channel URLs, rejects handles and other hosts', () => {
  const id = 'UC' + 'a'.repeat(22);
  assert.equal(youtube.youtubeChannelId(id), id);
  assert.equal(youtube.youtubeChannelId(`https://www.youtube.com/channel/${id}/videos`), id);
  assert.equal(youtube.youtubeChannelId(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`), id);
  assert.equal(youtube.youtubeChannelId('https://www.youtube.com/@somehandle'), null);
  assert.equal(youtube.youtubeChannelId(`https://evil.example/channel/${id}`), null);
  assert.equal(youtube.youtubeChannelId('UC-too-short'), null);
  assert.equal(youtube.youtubeFeedUrl(id), `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
});
