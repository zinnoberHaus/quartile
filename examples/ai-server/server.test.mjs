import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { test } from 'node:test';
import { createAnalysisContext } from '../../packages/react/dist/ai/index.js';
import { createAnalysisServer, parseRequest, providerSchema, readConfig } from './server.mjs';

const origin = 'http://localhost:5173';
const context = createAnalysisContext({
  schema: { amount: { name: 'amount', label: 'Amount', type: 'quantitative', format: 'number' } },
  source: { id: 'sample', version: 'v1' },
});
const payload = { requestId: 'test', prompt: 'Show a distribution', context };
const plan = {
  version: 1,
  title: 'Distribution',
  summary: 'Inspect amount distribution.',
  actions: [{ type: 'chart', chart: 'histogram', x: 'amount' }],
};
const complete = (value) =>
  new Response(
    JSON.stringify({
      status: 'completed',
      output: [
        { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] },
      ],
    }),
  );
const settings = { apiKey: 'test-only-not-a-secret', model: 'test-model', allowedOrigin: origin };

async function withServer(run, fetchImpl, extra = {}) {
  const server = createAnalysisServer({ ...settings, fetchImpl, ...extra });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/analysis`;
  try {
    await run(url);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
const post = (url, body = payload, headers = {}) =>
  fetch(url, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

test('configuration requires server credentials, model and one exact origin', () => {
  assert.throws(() => readConfig({}), /OPENAI_API_KEY/);
  assert.throws(() => readConfig({ OPENAI_API_KEY: 'test' }), /OPENAI_MODEL/);
  assert.throws(
    () => readConfig({ OPENAI_API_KEY: 'test', OPENAI_MODEL: 'model', ALLOWED_ORIGIN: '*' }),
    /ALLOWED_ORIGIN/,
  );
  assert.throws(
    () =>
      readConfig({
        OPENAI_API_KEY: 'test',
        OPENAI_MODEL: 'model',
        ALLOWED_ORIGIN: `${origin}/path`,
      }),
    /ALLOWED_ORIGIN/,
  );
  assert.equal(
    readConfig({ OPENAI_API_KEY: 'test', OPENAI_MODEL: 'model', ALLOWED_ORIGIN: origin }).port,
    8787,
  );
});

test('request boundary rejects raw rows, unknown fields and inconsistent profiles', () => {
  assert.deepEqual(parseRequest(payload), payload);
  for (const invalid of [
    { ...payload, rows: [{ secret: 1 }] },
    { ...payload, prompt: 'x'.repeat(8001) },
    { ...payload, context: { ...context, raw: [{ secret: 1 }] } },
    { ...payload, context: { ...context, fields: [...context.fields, context.fields[0]] } },
    { ...payload, context: { ...context, selection: [{ field: 'secret', op: 'eq', value: 'x' }] } },
    {
      ...payload,
      context: { ...context, fields: [{ ...context.fields[0], format: () => 'code' }] },
    },
    {
      ...payload,
      context: {
        ...context,
        profile: { totalRows: 1, scannedRows: 2, complete: true, fields: [] },
      },
    },
  ])
    assert.throws(() => parseRequest(invalid));
});

test('provider schema is a strict root object with supported union branches', () => {
  const schema = providerSchema();
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.properties.actions.items.anyOf.length > 1);
  assert.ok(!JSON.stringify(schema).includes('oneOf'));
  assert.ok(!JSON.stringify(schema).includes('uniqueItems'));
  const actions = schema.properties.actions.items.anyOf;
  const sort = actions.find((action) => action.properties.type.enum[0] === 'sort');
  const multiChart = actions.find((action) => action.properties.chart?.enum.includes('scatter'));
  assert.deepEqual(sort.properties.direction, { type: 'string', enum: ['asc', 'desc'] });
  assert.deepEqual(multiChart.properties.chart, {
    type: 'string',
    enum: ['scatter', 'bar', 'line'],
  });
  const checkEnums = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.enum)) {
      assert.ok(node.type, 'Every translated enum needs an explicit type.');
      assert.ok(node.enum.every((value) => typeof value === node.type));
    }
    for (const child of Object.values(node)) checkEnums(child);
  };
  checkEnums(schema);
});

test('valid browser request calls the real provider endpoint contract and returns only a validated plan', async () => {
  let calls = 0;
  await withServer(
    async (url) => {
      const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: origin } });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
      const response = await post(url);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), plan);
      assert.equal(calls, 1);
    },
    async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(options.headers.Authorization, 'Bearer test-only-not-a-secret');
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'test-model');
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      assert.equal(body.max_output_tokens, 4096);
      assert.equal(body.input[0].role, 'system');
      assert.deepEqual(JSON.parse(body.input[1].content).context, context);
      return complete(plan);
    },
  );
});

test('origin, media type, unknown path, malformed context and excessive bytes fail before provider calls', async () => {
  let calls = 0;
  await withServer(
    async (url) => {
      assert.equal((await post(url, payload, { Origin: 'https://untrusted.example' })).status, 403);
      assert.equal((await post(url, payload, { 'Content-Type': 'text/plain' })).status, 415);
      assert.equal((await post(`${url}/extra`)).status, 404);
      assert.equal(
        (
          await post(url, {
            ...payload,
            context: { ...context, selection: [{ field: 'unknown', op: 'eq', value: 1 }] },
          })
        ).status,
        400,
      );
      assert.equal((await post(url, { ...payload, prompt: 'x'.repeat(70000) })).status, 413);
      assert.equal(calls, 0);
    },
    async () => {
      calls++;
      return complete(plan);
    },
  );
});

test('untrusted provider output, refusal, incomplete response, and upstream secrets never reach the browser', async () => {
  for (const response of [
    complete({ ...plan, actions: [{ type: 'sql', query: 'DROP TABLE users' }] }),
    complete({ ...plan, actions: [{ type: 'chart', chart: 'histogram', x: 'secret' }] }),
    new Response(JSON.stringify({ status: 'incomplete', output: [] })),
    new Response(
      JSON.stringify({
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'refusal', refusal: 'provider private detail' }] },
        ],
      }),
    ),
    new Response('sk-pretend-sensitive-key private error detail', { status: 401 }),
    new Response('not JSON'),
    new Response('x'.repeat(262145)),
  ]) {
    await withServer(
      async (url) => {
        const result = await post(url);
        assert.ok(result.status >= 400);
        const text = await result.text();
        assert.ok(!text.includes('private'));
        assert.ok(!text.includes('sensitive-key'));
        assert.ok(!text.includes('DROP TABLE'));
      },
      async () => response,
    );
  }
});

test('deadline aborts the provider request and releases the single-flight slot', async () => {
  let calls = 0;
  let aborted = false;
  await withServer(
    async (url) => {
      assert.equal((await post(url)).status, 504);
      assert.equal(aborted, true);
      assert.equal((await post(url)).status, 200);
    },
    async (_url, { signal }) => {
      if (++calls === 2) return complete(plan);
      return new Promise((_, reject) =>
        signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(signal.reason);
          },
          { once: true },
        ),
      );
    },
    { timeoutMs: 25 },
  );
});

test('concurrent request is rejected and disconnect cancels the active provider fetch', async () => {
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  let cancelled;
  const aborted = new Promise((resolve) => {
    cancelled = resolve;
  });
  await withServer(
    async (url) => {
      const pending = httpRequest(url, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
      });
      pending.on('error', () => {});
      pending.end(JSON.stringify(payload));
      await ready;
      assert.equal((await post(url)).status, 429);
      pending.destroy();
      await aborted;
    },
    async (_url, { signal }) =>
      new Promise((_, reject) => {
        started();
        signal.addEventListener(
          'abort',
          () => {
            cancelled();
            reject(signal.reason);
          },
          { once: true },
        );
      }),
  );
});
