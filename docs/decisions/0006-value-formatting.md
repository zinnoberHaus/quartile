# 0006 — Shared value formatting and notation

Status: Accepted 2026-10-10.

## Context

Quartile's shared field schema already drove number labels, but compact output used English suffixes, large currency values abbreviated automatically, date formats lacked a time zone and a two-decimal default concealed small measurements. Components also had no field-level way to choose a compact axis and a more precise tooltip. JSON specs accepted fewer format shapes than React.

The [primary-source research](../research/formatting-2026-10-10.md) compared native Intl, FormatJS, math.js and d3-format. Formatting and numerical computation solve different problems: a locale-aware string cannot repair a rounded aggregate or confer arbitrary-precision chart coordinates.

## Decision

- Keep native Intl as the core number/date display engine, with bounded constructor caches. No mandatory FormatJS, math.js or d3-format dependency is added. Application callbacks can adapt those libraries and retain application-owned message/localization configuration.
- Preserve existing named formats, bare `Intl.NumberFormatOptions` and callbacks. Add serializable number/date/bytes/duration descriptors, plus scientific, engineering, decimal/binary bytes and elapsed-duration names. Descriptors use explicit Intl fractional/significant-digit options instead of one ambiguous precision property.
- Add field `axisFormat`, `tooltipFormat`, `description` and `timeZone`. Component overrides take precedence over the applicable surface format and base field format. Explicit formatting is not silently replaced by automatic axis shortening. Provider locale and time zone are defaults; the default zone remains the runtime's zone for compatibility.
- Use full currency values and currency-specific minor-unit defaults in values, tables and tooltips. Compact currency is explicit or an automatic axis choice. Named Number display preserves integer Number digits and uses up to 15 significant digits for fractional Number inputs, preserving tiny nonzero measurements. These deliberately change preview-era output; consumers requiring old rounding must pass explicit options.
- Preserve bigint/decimal-string inputs at the numeric display boundary where supported by Intl. Built-in numeric strings must represent a finite JavaScript Number, but the original string is passed to Intl so precision beyond the safe-integer boundary is retained. Arbitrary-range decimal display requires an application callback. Aggregation, scale coordinates, bytes, durations and display scaling remain Number operations. Date-only strings retain calendar identity; timestamp zone display does not redefine bucketing or selection.
- Provide shared field/range/parts helpers, field explanations in table headers/tooltips, and chart context through `tooltipNote`. Keep text, numeric signs and locale literals separate from arbitrary HTML. Keep raw CSV as the default; offer explicit formatted CSV for presentation exports without changing raw sorting/filter semantics.
- Extend the declarative schema to serializable formats and metadata. Validate unknown keys, bounds and Intl constructor constraints before rendering. Callback functions remain React-only. External JSON Schema validation needs the runtime `validateSpec` check for Intl-specific conflicts.

## Consequences

Applications can define measurement meaning once while making intentional display choices for axis space, precise inspection and report locale. Users of the preview should review currency precision, default number precision and date label snapshots. Fixed-output reports should supply explicit locale/time zone and precision.

Native Intl support and locale data still vary by runtime. Applications needing newer rounding features or missing locales can choose FormatJS polyfills. This decision does not add message translation, exchange rates, dimensional conversion, a mathematical expression language or arbitrary-precision chart arithmetic. See the [formatting guide](../guides/formatting.md) for supported adapters and boundaries.
