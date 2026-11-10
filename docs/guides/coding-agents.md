# AI coding agents

Quartile is new, so a coding agent is unlikely to know it from training. This page gives the agent what it needs: one prompt that points it at a skill file, a short snippet for your project's `AGENTS.md`, and a command that checks the blocks it wrote.

## The prompt

Paste this into your coding agent:

```text
Add Quartile charts to this project. Read https://usequartile.com/SKILL.md and follow it.
```

Add what you want charted, for example "chart the three tables in docs/report.md" or "render charts in the chat answers".

## What the skill does

`https://usequartile.com/SKILL.md` serves [skills/quartile/SKILL.md](../../skills/quartile/SKILL.md) from the Quartile repository. It is a plain Markdown file that tells the agent to:

1. **Install the preview build** from its GitHub release, and not from the npm registry, where the package does not exist.
2. **Detect the host.** It looks for Streamdown, react-markdown, MDX, a remark pipeline, markdown-it or plain HTML in your project.
3. **Wire Quartile into that host** with the minimum code for it.
4. **Write blocks** with the kinds and settings the language has.
5. **Use data the way the host allows**: inline rows, a `data` block, a dataset the app passes, or a `src:` URL only where the page already allows it.
6. **Validate** with `npx --no-install quartile check` and fix what it reports.

It also lists what the agent must not do: invent kinds or settings, swap in another chart library without asking, fetch data outside the host's loader or allowlist, or chart numbers it was not given.

The file has Agent Skills frontmatter (`name` and `description`). To keep it in your project, copy it to the skills folder your agent reads, for example `.claude/skills/quartile/SKILL.md` for Claude Code.

## The AGENTS.md snippet

The prompt covers the first integration. For the work after it, add this to `AGENTS.md`, `CLAUDE.md` or the instructions file your agent reads. It is under 2 KB, and it carries the install command so the agent needs no second fetch.

````markdown
## Charts: Quartile

This project draws charts with Quartile (`@quartile/react`, a 0.1 preview build).

- Install: `npm install https://github.com/zinnoberHaus/quartile/releases/download/v0.1.0-preview.1/quartile-react-0.1.0-preview.1.tgz` (pnpm, Yarn and Bun take the same URL). The package is not on the npm registry: never run `npm install @quartile/react`.
- A chart is a fenced `quartile` block in Markdown: one sentence, optional `key: value` settings, a `---` line, then rows.

```quartile
bar sum(revenue) by region
title: Revenue by region, Q3 2026
format: currency USD
---
region,revenue
EMEA,1200000
APAC,860000
Americas,2100000
```

- Prefer these docs over memory. The syntax is new and can change between preview builds.
  - Syntax: https://docs.usequartile.com/docs/language.md
  - Data sources: https://docs.usequartile.com/docs/data-sources.md
  - Styling and settings: https://docs.usequartile.com/docs/styling.md
  - Interaction: https://docs.usequartile.com/docs/interaction.md
  - Markdown and React: https://docs.usequartile.com/docs/markdown.md
  - AI answers: https://docs.usequartile.com/docs/ai-answers.md
  - Web pages: https://docs.usequartile.com/docs/embedding.md
  - Index of pages: https://docs.usequartile.com/llms.txt
- Use only kinds and settings from the syntax reference. Chart only numbers you were given or computed.
- Do not swap Quartile for another chart library without asking.
- After editing blocks, run `npx --no-install quartile check <files>` (with pnpm: `pnpm exec quartile check <files>`) and fix what it reports.
````

Each docs page has a Markdown rendition at the same URL with `.md` added, which is the form an agent should read.

## `quartile check`

The package installs a `quartile` command. `quartile check` compiles the `quartile` blocks in Markdown files with the same compiler the renderers use and reports each problem with its line in the file. It makes no network requests and renders nothing.

```sh
npx --no-install quartile check README.md docs/*.md
```

Keep `--no-install`. It makes `npx` run only the copy in your project's `node_modules`. Without it, in a project where Quartile is not installed, `npx` would download whatever package is named `quartile` on the npm registry, which is not this project. With pnpm, write `pnpm exec quartile check README.md docs/*.md`.

Given this file, `q3.md`:

````text
# Q3 review

```quartile
bar sum(profit) by regoin
title: Revenue by region
---
region,revenue
EMEA,1200000
APAC,860000
```

```quartile
line sum(amount) by ordered_at
data: orders
```
````

the command prints one line per problem and a summary, and exits with status 1:

```text
q3.md:4: warning: Used column “region” for “regoin”.
q3.md:4: error: There is no column “profit”. Columns: region, revenue.
q3.md:14: error: There is no dataset “orders”. Define one with a “data name” block.
2 blocks in 1 file: 2 errors, 1 warning
```

The first block has a misspelt column that was corrected (a warning) and a column that does not exist (an error that lists the real columns). The second block reads a dataset that the document does not define, because the application supplies it when the page runs. Tell the command about such datasets:

```sh
npx --no-install quartile check q3.md --dataset orders              # the name exists; its columns are not checked
npx --no-install quartile check q3.md --dataset orders=orders.csv   # check field names against these rows
```

| Argument | Meaning |
|---|---|
| `<file.md …>` | Markdown files to check. The shell expands patterns such as `docs/*.md`. |
| `-` | Read Markdown from standard input. |
| `--dataset name=file` | Rows your app supplies under `name` (CSV, TSV or JSON), so field names are checked against them. Repeatable. |
| `--dataset name` | A dataset your app supplies only at run time. Blocks over it are checked without their columns. Repeatable. |
| `--lang word` | Also read this fence language as a Quartile block, for projects that use another fence name. Repeatable. |
| `--nested` | Also check blocks shown inside ```` ```markdown ```` example fences, each example as its own document. |
| `--notes` | Also print notes, such as an inferred field or the key that rows were read from. |
| `--strict` | Exit with status 1 on warnings too. |
| `--json` | Print one JSON object instead of lines. |

**Output.** Each problem is `file:line: severity: message`, where the severity is `error`, `warning` or `note` and the line counts from the top of the file. With `--json` the object is `{ "errors", "warnings", "files": [{ "file", "blocks", "problems": [{ "severity", "line", "message", "hint" }] }] }`; notes have the severity `info` there.

**Exit status.** `0`: no errors. `1`: errors were found, or warnings with `--strict`. `2`: the command could not run, for example a file that cannot be read or an unknown option.

**What it checks.** Kinds, settings (a setting the kind does not have, a color a block may not set, a number out of range, an action a view cannot show), field names against the block's rows or the named dataset, formats, `path:` against inline JSON, and fences that are never closed. A `data` block defines its dataset for the whole file, wherever it appears.

**What it does not check.**

- `src:` URLs are not fetched, so the columns of a remote source are unknown. Blocks over one are checked without their columns.
- Blocks nested in lists or block quotes are not found. Keep blocks at the top level of the document.
- It does not render, so it cannot tell you whether a chart answers the question.

`quartile --help` prints the usage, and `quartile --version` the package version.

## `quartile prompt`

```sh
npx --no-install quartile prompt
npx --no-install quartile prompt --dataset orders=orders.csv
```

Prints the text that `quartilePrompt()` returns: the system-prompt section that teaches a model the block syntax. With `--dataset name=file`, the prompt lists the dataset's name and its columns with their types, and tells the model to write `data: name` instead of pasting rows. Use it to inspect the prompt, or to paste it into a tool that has no JavaScript runtime. The command prints the default prompt; the `actions` option of `quartilePrompt()` has no flag.

## `quartilePrompt()` or the skill?

They serve two different readers.

| | `quartilePrompt()` | The skill and the `AGENTS.md` snippet |
|---|---|---|
| Reader | The model that writes answers for your users, at run time | The coding agent that writes your code, at development time |
| Where it goes | The system prompt of your chat or answer feature | The agent's context, through the prompt above or your instructions file |
| What it teaches | The block syntax only: shape, kinds, measures, formats, a few optional lines (colors, axis range, legend, labels, a reference line, the source), rules | Installing, wiring a renderer, data options, styling and interaction settings, validation, and the syntax in brief |
| Output | Markdown answers that contain `quartile` blocks | Changes to your repository |
| Guide | [Charts in AI answers](ai-responses.md) | this page |

An application that shows AI answers with charts uses both: the coding agent follows the skill to add the renderer and to put `quartilePrompt()` into the system prompt, and from then on the answering model writes the blocks.
