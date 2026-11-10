# Charts in AI answers

Let a model answer with charts by writing ```` ```quartile ```` blocks in its normal Markdown. Your site renders them with the components it already uses for Markdown; no chart library has to be chosen per answer, and the charts take your site's styling. The [live replay](https://quartile-design.vercel.app/examples/ai-answer) shows the result with Vercel's Streamdown. The evidence behind this design is in the [November research](../research/markdown-ai-embedding-2026-11.md#3-what-models-get-right-and-wrong).

## 1. Teach the syntax

`quartilePrompt()` returns a system-prompt section (about 3,300 characters) generated from the language's own tables: the block shape, the kinds, measures and formats, two complete examples, and rules (chart only data you have, at most 60 rows, no code or URLs). Every example in it is compiled in the test suite.

```ts
import { quartilePrompt } from '@quartile/react/lang';

const system = [
  'You are a data analyst.',
  quartilePrompt({
    // Optional: data your server already authorized for this user.
    datasets: [
      {
        name: 'orders',
        description: 'One row per order, last 90 days',
        columns: [
          { name: 'ordered_at', type: 'date' },
          { name: 'region', type: 'text' },
          { name: 'amount', type: 'number', description: 'USD after discounts' },
        ],
      },
    ],
  }),
].join('\n\n');
```

With `datasets`, the model writes `data: orders` instead of pasting rows, and your page supplies the rows (step 3). Without them, the model includes the rows it computed or was given.

## 2. Render while streaming

Every Markdown parser treats an unclosed fence as a code block running to the end of the text, so a block exists from its first line. Quartile draws as soon as the header and one complete row are present, holds back the line still being written, grows with each row, and reports errors only when the block is complete.

**Streamdown** (used by Vercel AI Elements):

```tsx
import { Streamdown } from 'streamdown';
import { QuartileDocument, quartileRenderer } from '@quartile/react';
import '@quartile/react/styles.css';

const renderers = [quartileRenderer()];

export function Answer({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <QuartileDocument theme="auto" streaming={streaming}>
      <Streamdown isAnimating={streaming} plugins={{ renderers }}>
        {text}
      </Streamdown>
    </QuartileDocument>
  );
}
```

`quartileRenderer()` uses Streamdown's `isIncomplete` flag for each fence. Passing `plugins` replaces AI Elements' default plugin set, so include the defaults you use alongside `renderers`.

**react-markdown and others:** use `components={{ pre: QuartilePre }}` and pass `streaming` to `QuartileDocument` while the message is in progress. With the full message text, also pass `markdown={text}` so `data` blocks are known to every block.

**Non-React chat pages:** include the [embed script](embedding.md). Its observer upgrades code blocks as messages append to the page, follows each block's text while it grows, and treats a block as complete once its text stops changing.

With react-markdown, pass the message text as `markdown` too: blocks whose fence is already closed then render as complete while the rest of the answer streams.

## 3. Provide data instead of trusting it

Data a model writes inline is only as reliable as the model. Where the numbers matter, run the query in your application, authorize it for the user, and give the rows to the page:

```tsx
<QuartileDocument data={{ orders: rowsTheUserMayRead }} streaming={streaming}>
```

The model then writes only the chart (`bar sum(amount) by region` + `data: orders`), and the compiler checks every field against the real columns. Blocks over the same dataset share a selection, so a model can lay out a small dashboard across several blocks.

## 4. Validate and repair

`compileBlock` returns the spec and line-numbered diagnostics. Unknown columns are errors that list the real columns; a close misspelling is corrected with a warning; settings that do not exist are ignored with the closest suggestion. Use errors for one repair turn; research found that repair loops help when they carry concrete feedback, not otherwise.

```ts
import { compileBlock, findFencedBlocks } from '@quartile/react/lang';

const problems = findFencedBlocks(answer).flatMap((block) =>
  compileBlock(block.source, { datasets: { orders } })
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `Block at line ${block.line}, line ${d.line}: ${d.message} ${d.hint ?? ''}`),
);
if (problems.length) {
  // Ask the model once to fix exactly these, then render whatever it returns.
}
```

## 5. Tool calls and structured output

When the model should call a tool rather than write Markdown, use one of two schemas. Both satisfy OpenAI and Anthropic strict modes: every property required, no unions, no numeric bounds.

- `quartileBlockTool()`: one string argument, `block`, holding block text. Compile it as above.
- `quartileChartTool()`: typed arguments (`kind`, `title`, `measures`, `by`, `format`, `columns`, `rows`); `chartToolInputToBlock()` turns them into block text.

```ts
import { chartToolInputToBlock, quartileChartTool } from '@quartile/react/lang';

const tool = quartileChartTool();          // { name, description, input_schema }
// AI SDK: tool({ description: tool.description, inputSchema: jsonSchema(tool.input_schema) })
// When the call arrives:
const block = chartToolInputToBlock(call.input);
```

Render the result with `<QuartileBlock source={block} />`. The JSON spec (`@quartile/react/schema.json`) remains the validator for complete dashboards; it uses `oneOf` and bounds, so do not pass it as a strict schema.

## Safety

- Blocks are data: no scripts, HTML, styles, SQL or event handlers are executed or injected.
- Nothing is fetched unless you pass `loadSource`. A prompt-injected answer cannot make the page send data to a URL in a `src:` line.
- Inline rows are capped (5,000 by default); the prompt asks for at most 60.
- Colors and fonts come from your page. A model cannot style a block to look like your interface.
- A schema-valid chart can still answer the wrong question. Keep row grain, units and denominators explicit in prompts and datasets, as in the [data-app recipes](use-cases.md).
