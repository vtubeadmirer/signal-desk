const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness() {
  let spawnCount = 0;
  let release;
  const writes = [];
  const timers = new Set();
  const handlers = {};
  const child = { write: async (line) => writes.push(JSON.parse(line)) };
  const command = {
    stdout: { on: (_, fn) => handlers.stdout = fn },
    stderr: { on: () => {} },
    on: (event, fn) => handlers[event] = fn,
    spawn: () => { spawnCount++; return new Promise((resolve) => release = () => resolve(child)); },
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('src/agent.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, require: () => ({ Command: { sidecar: () => command } }), console,
    setTimeout: (fn) => { timers.add(fn); return fn; },
    clearTimeout: (fn) => timers.delete(fn),
  });
  return { api: exports, handlers, writes, timers, release: () => release(), spawnCount: () => spawnCount };
}

test('concurrent calls share startup and correlate newline-free responses by ID', async () => {
  const h = harness();
  const first = h.api.health();
  const second = h.api.health();
  assert.equal(h.spawnCount(), 1);
  h.release();
  await new Promise(setImmediate);
  h.handlers.stdout(JSON.stringify({ ok: true, request_id: h.writes[1].request_id, message: 'second' }));
  h.handlers.stdout(JSON.stringify({ ok: true, request_id: h.writes[0].request_id, message: 'first' }));
  assert.equal((await first).message, 'first');
  assert.equal((await second).message, 'second');
  assert.equal(h.timers.size, 0);
});

test('closed process rejects waiting requests and next call starts again', async () => {
  const h = harness();
  const request = h.api.health();
  const rejection = assert.rejects(request, /종료/);
  h.release();
  await new Promise(setImmediate);
  h.handlers.close();
  await rejection;
  const retry = h.api.health();
  h.release();
  await new Promise(setImmediate);
  h.handlers.stdout(JSON.stringify({ ok: true, request_id: h.writes[1].request_id }));
  assert.equal((await retry).ok, true);
  assert.equal(h.spawnCount(), 2);
});

test('timed out responses do not get assigned to later requests', async () => {
  const h = harness();
  const request = h.api.health();
  const rejection = assert.rejects(request, /초과/);
  h.release();
  await new Promise(setImmediate);
  [...h.timers][0]();
  await rejection;
  const next = h.api.health();
  await new Promise(setImmediate);
  h.handlers.stdout(JSON.stringify({ ok: true, request_id: h.writes[0].request_id, message: 'late' }));
  h.handlers.stdout(JSON.stringify({ ok: true, request_id: h.writes[1].request_id, message: 'current' }));
  assert.equal((await next).message, 'current');
});
