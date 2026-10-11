import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');

// Execute the actual hook against deterministic hooks/timers and a delayed API.
// This exercises pagination, failures and overlapping searches without native UI dependencies.
let slot = 0, dirty = false, effects = [], enabled = true;
const cells = [], timers = new Map(), calls = [];
let timerId = 0;
const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const react = {
  useState(initial) {
    const i = slot++;
    cells[i] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [cells[i].value, value => { cells[i].value = typeof value === 'function' ? value(cells[i].value) : value; dirty = true; }];
  },
  useRef(value) { const i = slot++; cells[i] ??= { current: value }; return cells[i]; },
  useCallback(fn, deps) {
    const i = slot++;
    if (!equal(cells[i]?.deps, deps)) cells[i] = { fn, deps };
    return cells[i].fn;
  },
  useEffect(fn, deps) {
    const i = slot++;
    if (!equal(cells[i]?.deps, deps)) {
      const previous = cells[i]; cells[i] = { deps };
      effects.push(() => { previous?.cleanup?.(); cells[i].cleanup = fn(); });
    }
  },
};
const products = { list(businessId, query) { return new Promise((resolve, reject) => calls.push({ businessId, query, resolve, reject })); } };
const module = { exports: {} };
const code = transformSync(readFileSync(new URL('../src/lib/useProductSearch.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
}).code;
vm.runInNewContext(code, { module, exports: module.exports,
  require: name => name === 'react' ? react : { products },
  setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) });
let hook;
const render = () => {
  do { dirty = false; slot = 0; hook = module.exports.useProductSearch('test-store', enabled);
    const pending = effects; effects = []; pending.forEach(fn => fn());
  } while (dirty);
};
const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); render(); };
const fireTimers = async () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); await tick(); };
render(); await fireTimers();
assert.equal(calls.length, 1); assert.equal(calls[0].query.limit, 20);
calls[0].resolve({ items: [{ productId: 'p1' }], nextCursor: 'page2' }); await tick();
hook.loadMore(); hook.loadMore(); await tick();
assert.equal(calls.length, 2); assert.equal(calls[1].query.cursor, 'page2');
calls[1].reject(new Error('offline')); await tick();
assert.equal(hook.items.length, 1); assert.ok(hook.error);
hook.retry(); await tick(); assert.equal(calls.length, 3);
calls[2].resolve({ items: [{ productId: 'p1' }, { productId: 'p2' }], nextCursor: null }); await tick();
assert.equal(hook.items.length, 2); assert.equal(hook.error, null);
hook.setQuery('old'); render(); await fireTimers(); assert.equal(calls[3].query.q, 'old');
hook.setQuery('new'); render(); await fireTimers(); assert.equal(calls[4].query.q, 'new');
calls[4].resolve({ items: [{ productId: 'new-result' }], nextCursor: null }); await tick();
calls[3].resolve({ items: [{ productId: 'old-result' }], nextCursor: 'wrong' }); await tick();
assert.equal(hook.items[0].productId, 'new-result'); assert.equal(hook.nextCursor, null);
enabled = false; render(); await fireTimers(); assert.equal(calls.length, 5);
assert.equal(hook.loading, false);
console.log('✓ Instagram product search: bounded pages, duplicate-load guard, retry, stale-response protection and expired access.');
