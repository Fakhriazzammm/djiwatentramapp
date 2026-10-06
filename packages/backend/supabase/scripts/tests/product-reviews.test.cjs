// Isolated regression tests. Validation dependencies live outside the repo:
// REVIEW_TEST_TOOLS=/tmp/product-reviews-tools/node_modules node --test <this file>
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../../../..');
const tools = process.env.REVIEW_TEST_TOOLS;
if (!tools) throw new Error('Set REVIEW_TEST_TOOLS to isolated validation node_modules');
const ts = require(path.join(root, 'node_modules/typescript'));
function compile(file, imports) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  } });
  return exports;
}

test('migration is repeatable, constraints and public privileges protect private rows', async () => {
  const { PGlite } = require(path.join(tools, '@electric-sql/pglite'));
  const { pgcrypto } = require(path.join(tools, '@electric-sql/pglite/dist/contrib/pgcrypto.cjs'));
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
    const sql = fs.readFileSync(path.join(root, 'packages/backend/supabase/migrations/20261003000007_product_reviews.sql'), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    const insert = `INSERT INTO pos.product_reviews(product_source_id,order_source_id,customer_user_id,rating,status,comment,moderation_note) VALUES ('test-product','test-order','test-owner',5,'published','Public comment','Private note')`;
    await db.exec(insert);
    await db.exec(`INSERT INTO pos.product_reviews(product_source_id,order_source_id,customer_user_id,rating,status) VALUES ('test-product','test-other-order','test-owner',1,'pending')`);
    await assert.rejects(db.exec(insert), /duplicate key/);
    await assert.rejects(db.exec(`INSERT INTO pos.product_reviews(product_source_id,order_source_id,rating) VALUES ('x','y',6)`), /rating_check/);
    await assert.rejects(db.exec(`INSERT INTO pos.product_reviews(product_source_id,order_source_id,rating,verified_purchase) VALUES ('x','y',3,false)`), /verified_purchase_check/);
    await assert.rejects(db.exec(`INSERT INTO pos.product_reviews(product_source_id,order_source_id,rating,comment) VALUES ('x','y',3,repeat('x',501))`), /comment_length_check/);
    const tableColumns = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='pos' AND table_name='product_reviews' ORDER BY ordinal_position`)).rows.map(r => r.column_name);
    assert.deepEqual(tableColumns, ['id','source_id','product_source_id','order_source_id','customer_user_id','customer_display_name','rating','comment','status','verified_purchase','moderation_note','moderated_by','moderated_at','created_at','updated_at']);
    await db.exec('SET ROLE service_role');
    await db.exec(`INSERT INTO pos.product_reviews(product_source_id,order_source_id,customer_user_id,rating,status) VALUES ('test-product','service-order','service-owner',3,'hidden')`);
    await db.exec('RESET ROLE');
    const before = await db.query('SELECT count(*) AS count FROM pos.product_reviews');
    await db.exec(sql);
    assert.deepEqual((await db.query('SELECT count(*) AS count FROM pos.product_reviews')).rows, before.rows);
    const columns = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_product_reviews' ORDER BY ordinal_position`)).rows.map(r => r.column_name);
    assert.deepEqual(columns, ['id','product_source_id','rating','comment','customer_display_name','created_at']);
    const rls = (await db.query(`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='pos.product_reviews'::regclass`)).rows[0];
    assert.equal(rls.relrowsecurity, true); assert.equal(rls.relforcerowsecurity, true);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      const summary = (await db.query('SELECT * FROM public.pos_product_review_summary')).rows[0];
      assert.equal(Number(summary.published_count), 1); assert.equal(Number(summary.rating_average), 5);
      assert.equal((await db.query('SELECT * FROM public.pos_product_reviews')).rows.length, 1);
      await assert.rejects(db.query('SELECT * FROM pos.product_reviews'), /permission denied/);
      await assert.rejects(db.exec(`INSERT INTO public.pos_product_reviews(id) VALUES(gen_random_uuid())`), /permission denied/);
      await db.exec('RESET ROLE');
    }
  } finally { await db.close(); }
});

test('helper sends and reads the cursor pagination contract', async () => {
  const calls = [];
  const helper = compile('apps/customer/src/lib/product-reviews.ts', { '@/lib/api-helper': { invokeEdgeFunction: async (...args) => { calls.push(args); return { reviews: [{ id: 'primary-id', product_source_id: 'p', rating: 4 }], hasMore: true, nextCursor: '10' }; } } });
  const result = await helper.listProductReviews('p', '10');
  assert.equal(calls[0][1].cursor, '10'); assert.equal(result.nextCursor, '10'); assert.equal(result.hasMore, true); assert.equal(result.reviews[0].id, 'primary-id');
});

test('hooks hide old products, ignore late responses, reset, and append pages', async () => {
  const React = require(path.join(tools, 'react'));
  const { act, create } = require(path.join(tools, 'react-test-renderer'));
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const pending = [];
  const hooks = compile('apps/customer/src/hooks/use-product-reviews.ts', { react: React, '@/lib/product-reviews': {
    getProductReviewSummary: product => new Promise(resolve => pending.push({ product, resolve, kind: 'summary' })),
    listProductReviews: (product, cursor) => new Promise(resolve => pending.push({ product, cursor, resolve, kind: 'list' })),
  } });
  let state;
  function Harness({ product, enabled = true }) { state = { summary: hooks.useProductReviewSummary(product, enabled), list: hooks.useProductReviews(product) }; return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Harness, { product: 'a' })); });
  await act(async () => { void state.list.load(); });
  await act(async () => { renderer.update(React.createElement(Harness, { product: 'b' })); });
  assert.equal(state.summary.summary, null); assert.equal(state.list.reviews.length, 0); assert.equal(state.list.hasLoaded, false);
  await act(async () => { for (const request of pending.filter(r => r.product === 'a')) request.resolve(request.kind === 'summary' ? { productSourceId: 'a', publishedCount: 1 } : { reviews: [{ id: 'a' }], hasMore: false, nextCursor: null }); });
  assert.equal(state.summary.summary, null); assert.equal(state.list.reviews.length, 0);
  await act(async () => { void state.list.load(); });
  await act(async () => { pending.find(r => r.product === 'b' && r.kind === 'list').resolve({ reviews: [{ id: 'b1' }], hasMore: true, nextCursor: '10' }); });
  await act(async () => { void state.list.load(); });
  assert.equal(pending.at(-1).cursor, '10');
  await act(async () => { pending.at(-1).resolve({ reviews: [{ id: 'b2' }], hasMore: false, nextCursor: null }); });
  assert.deepEqual(Array.from(state.list.reviews, r => r.id), ['b1','b2']);
  await act(async () => { void state.list.load(true); });
  assert.equal(pending.at(-1).cursor, null);
  await act(async () => { pending.at(-1).resolve({ reviews: [{ id: 'b3' }], hasMore: false, nextCursor: null }); });
  assert.deepEqual(Array.from(state.list.reviews, r => r.id), ['b3']);
  await act(async () => { state.list.reset(); renderer.update(React.createElement(Harness, { product: null, enabled: false })); });
  assert.equal(state.list.reviews.length, 0); assert.equal(state.summary.summary, null); assert.equal(state.summary.isLoading, false);
  await act(async () => renderer.unmount());
});

function edgeHarness(results) {
  const queries = [];
  const db = { schema: () => db, from(table) {
    const query = { table, filters: [] }; queries.push(query);
    const result = results.shift() ?? { data: null, error: null };
    const chain = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
    for (const method of ['select','update','insert','eq','gt','or','order','limit','range','in','ilike']) chain[method] = (...args) => { query.filters.push([method, ...args]); return chain; };
    chain.maybeSingle = chain.single = async () => result;
    return chain;
  }, auth: { getUser: async () => ({ data: { user: null }, error: new Error('invalid') }) } };
  let handler;
  let source = fs.readFileSync(path.join(root, 'supabase/functions/product-reviews/index.ts'), 'utf8').replace(/^import .*;\n/gm, '');
  source += '\nexports.api = { listPublic, reportReview, moderate, adminReview, createReview, adminList };';
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, createClient: () => db, Deno: { env: { get: () => 'test-only' }, serve: fn => { handler = fn; } }, Response, console, crypto: require('node:crypto').webcrypto });
  return { ...exports.api, handler, queries };
}

test('admin list maps product names and never returns customer identity or order IDs', async () => {
  const edge = edgeHarness([
    { data: [{ id: 'r1', product_source_id: 'p1', customer_user_id: 'private', order_source_id: 'private', status: 'pending' }], error: null },
    { data: [{ source_id: 'p1', name: 'Es Kopi Susu' }], error: null },
  ]);
  const result = await edge.adminList({ status: 'pending' });
  assert.equal(result.reviews[0].product_name, 'Es Kopi Susu');
  for (const key of ['customer_user_id','customer_display_name','order_source_id']) assert.equal(key in result.reviews[0], false);
});

test('admin search is applied server-side before the 200-row cap and includes product names', async () => {
  const edge = edgeHarness([
    { data: [{ id: 'older-match', product_source_id: 'p1', comment: 'needle in older review', created_at: '2025-01-01', status: 'pending' }], error: null },
    { data: [], error: null },
    { data: [{ source_id: 'p1' }], error: null },
    { data: [{ id: 'older-match', product_source_id: 'p1', comment: 'needle in older review', created_at: '2025-01-01', status: 'pending' }], error: null },
    { data: [{ source_id: 'p1', name: 'Needle Product' }], error: null },
  ]);
  const result = await edge.adminList({ status: 'pending', search: 'needle' });
  assert.equal(result.reviews.length, 1);
  assert.equal(result.reviews[0].id, 'older-match');
  assert.equal(result.reviews[0].product_name, 'Needle Product');
  assert.ok(edge.queries[0].filters.some(f => f[0] === 'ilike' && f[1] === 'comment'));
  assert.ok(edge.queries[2].filters.some(f => f[0] === 'ilike' && f[1] === 'name'));
  await assert.rejects(edge.adminList({ search: 'x'.repeat(101) }), /maksimal 100/);
});
test('admin search resolves a valid review primary id directly', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const edge = edgeHarness([
    { data: [], error: null },
    { data: [], error: null },
    { data: [], error: null },
    { data: [{ id, product_source_id: 'p1', created_at: '2025-01-01', status: 'pending' }], error: null },
    { data: [{ source_id: 'p1', name: 'Kopi' }], error: null },
  ]);
  const result = await edge.adminList({ search: id });
  assert.equal(result.reviews[0].id, id);
  assert.ok(edge.queries[3].filters.some(f => f[0] === 'eq' && f[1] === 'id' && f[2] === id));
});
test('public pagination orders ties and uses one extra row for accurate hasMore', async () => {
  const edge = edgeHarness([{ data: [{ id: 'a' }, { id: 'b' }], error: null }]);
  const result = await edge.listPublic({ productSourceId: 'p', limit: 1, cursor: '10' });
  assert.equal(result.reviews.length, 1); assert.equal(result.hasMore, true); assert.equal(result.nextCursor, '11');
  assert.deepEqual(Array.from(edge.queries[0].filters.filter(f => f[0] === 'order'), f => f[1]), ['created_at','id']);
  assert.deepEqual(Array.from(edge.queries[0].filters.find(f => f[0] === 'range')), ['range',10,11]);
  const last = await edgeHarness([{ data: [{ id: 'last' }], error: null }]).listPublic({ productSourceId: 'p', limit: 1 });
  assert.equal(last.hasMore, false); assert.equal(last.nextCursor, null);
  await assert.rejects(edge.listPublic({ productSourceId: 'p', cursor: 'not-a-number' }), /Pagination/);
});

test('moderation updates use the primary id and never return customer identity or order ids', async () => {
  const edge = edgeHarness([{ data: { id: 'primary', status: 'hidden' }, error: null }]);
  await edge.moderate({ review_id: 'primary', status: 'hidden' }, { sourceId: 'admin' });
  assert.ok(edge.queries[0].filters.some(f => f[0] === 'eq' && f[1] === 'id' && f[2] === 'primary'));
  const sanitized = edge.adminReview({ id: 'r', customer_user_id: 'secret', customer_display_name: 'Secret', order_source_id: 'secret' });
  for (const key of ['customer_user_id','customer_display_name','order_source_id']) assert.equal(key in sanitized, false);
});

test('moderation_list requires a valid active privileged Yumi session', async () => {
  const req = token => new Request('http://test-only.invalid', { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: JSON.stringify({ action: 'moderation_list' }) });
  assert.equal((await edgeHarness([]).handler(req())).status, 401);
  const inactive = edgeHarness([{ data: { user_source_id: 'a' } }, { data: { is_active: false } }]);
  assert.equal((await inactive.handler(req('test-token'))).status, 401);
  const unauthorized = edgeHarness([{ data: { user_source_id: 'a' } }, { data: { source_id: 'a', role_source_id: 'role', is_active: true } }, { data: { name: 'cashier', permissions: [] } }]);
  assert.equal((await unauthorized.handler(req('test-token'))).status, 401);
  const authorized = edgeHarness([{ data: { user_source_id: 'a' } }, { data: { source_id: 'a', role_source_id: 'role', is_active: true } }, { data: { name: 'admin', permissions: [] } }, { data: [{ id: 'r', status: 'pending' }] }]);
  const response = await authorized.handler(req('test-token'));
  assert.equal(response.status, 200); assert.equal((await response.json()).reviews[0].status, 'pending');
  assert.ok(authorized.queries[0].filters.some(f => f[0] === 'gt' && f[1] === 'expires_at'));
});

test('customer review writes are accepted only by the authenticated auth-server API', async () => {
  for (const action of ['create', 'report']) {
    const edge = edgeHarness([]);
    const response = await edge.handler(new Request('http://test-only.invalid', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'UNKNOWN_ACTION');
    assert.equal(edge.queries.length, 0);
  }
});
