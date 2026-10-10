# Local analysis backend

This runnable Node 22+ example calls the OpenAI Responses API with server-held credentials. It returns a validated Quartile `AnalysisPlan`; the browser still requires **Apply changes**. It has no deterministic fallback, tools, SQL execution, generated code execution, database access, or model SDK dependency. Quartile's AI entry remains provider-agnostic: replace this server when using another provider.

## Run

From the repository root:

```sh
pnpm install
pnpm build:lib
cp examples/ai-server/.env.example examples/ai-server/.env
```

Edit the ignored `.env` file with your own API key, model, and the exact origin displayed by your local gallery dev server. `http://localhost:5173` and `http://127.0.0.1:5173` are different origins. The example model, [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), supports structured outputs; set `OPENAI_MODEL` to another compatible model available to your account as needed. Requests use your provider account and its billing.

```sh
node --env-file=examples/ai-server/.env examples/ai-server/server.mjs
```

The server binds only to `127.0.0.1:8787` by default. Missing credentials, model, or allowed origin fail at startup. In a separate terminal run `pnpm dev` and open the data science workspace. Configure its own-backend mode with `http://127.0.0.1:8787/api/analysis`. Use the local gallery to avoid HTTPS-to-local-HTTP browser restrictions.

In an application, keep the adapter stable across renders:

```tsx
const adapter = createHttpAssistantAdapter({
  endpoint: 'http://127.0.0.1:8787/api/analysis',
  label: 'Your OpenAI backend',
  mode: 'live',
});
```

## Contract and boundaries

`POST /api/analysis`, `Content-Type: application/json`, and an `Origin` header exactly matching `ALLOWED_ORIGIN` are required. The request is `{ requestId, prompt, context }`, matching `createHttpAssistantAdapter`. Context contains version 1, an immutable source revision, allowed fields, active selection, optional bounded profile counters/ranges, and provenance. No raw records or nominal sample values are added. Field labels, active filter values and profile ranges can still contain sensitive information; only configure data you intend to send to the provider.

The server validates the request and reconstructs context through `createAnalysisContext`. It translates the exported JSON Schema to OpenAI's supported strict-output subset, calls `POST https://api.openai.com/v1/responses` with `store: false`, and accepts only completed, non-refusal text output. `validateAnalysisPlan` then checks semantic types, field names, dates, action limits and view bounds. A valid plan is returned directly as JSON. The client validates again and rejects proposals made obsolete by a new context or request. Structured schema adherence alone is not evidence that an analysis is correct.

Requests and plans are bounded to 64 KiB, provider response envelopes to 256 KiB, output generation to 4,096 tokens, and processing to 30 seconds. Only one request runs at a time. Client disconnects abort the provider fetch. A cancellation stops this example's wait/request; it is not a guarantee that the provider has stopped computation or billing. Invalid requests, upstream errors, refusals, incomplete responses and invalid plans return error statuses with no raw provider body or credentials echoed.

This is a local development example. Its exact-origin check is a browser restriction, not user authentication: another local process can send that header. It does not provide multi-user authorization, quotas, audit persistence, or production authentication. Do not expose this endpoint publicly without implementing those application responsibilities.

## Verify

```sh
pnpm build:lib
node --test examples/ai-server/server.test.mjs
```

Tests exercise real local HTTP requests with an injected provider transport. They never use credentials or make paid model calls. A live provider call requires your own configured account; no live credentialed response is claimed by the automated tests.

The integration follows the official [structured outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs). This provider example uses a structured response because Quartile reviews one declarative proposal. A backend performing actual application tools should use its provider's tool protocol and enforce authorization at each tool boundary.
