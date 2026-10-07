import { useMemo, useState } from 'react';
import { MINUS, makeFormatter } from '../data/format';
import { fieldOf, isDataset, resolveData } from '../data/schema';
import type { DataInput, Formatter, Row } from '../data/types';
import { useQuartile } from '../provider/QuartileProvider';
import { useLinkedRows, useSourceId } from '../selection/Selection';
import { useChartKeyboard } from './core/a11y';
import { type ChartBaseProps, ChartFrame, type ChartTable, statusOf } from './core/ChartFrame';
import { ChartTooltip } from './core/guides';
import { aggregateBy } from './core/trends-aggregate';
import { isKeyboardFocus } from './core/trends-focus';

const SHARE: Intl.NumberFormatOptions = {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
};

export interface FunnelProps<R extends Row = Row> extends ChartBaseProps {
  /** One row per step in funnel order, or raw rows (values sharing a step are summed). */
  data: DataInput<R>;
  /** Field naming the step. Steps keep the order they first appear in. */
  step: keyof R & string;
  /** Field with the count that reached the step. */
  value: keyof R & string;
  /**
   * Formats counts. Defaults to integers for plain rows (a field named `value` would otherwise be
   * inferred as currency); a dataset's declared format is used as given.
   */
  format?: Formatter;
  /**
   * `start`: label and figures on one line, a bar under them with the previous step as a ghost.
   * `center`: tapering bars centered on one axis, figures under each bar.
   */
  align?: 'start' | 'center';
  /** Shows the first-to-last conversion under the steps. Defaults to true. */
  overall?: boolean;
  /** Selection to read from. Defaults to the nearest; false opts out. */
  selection?: string | false;
}

/** Step-by-step conversion: each step's count, its conversion from the previous step, and overall. */
export function Funnel<R extends Row = Row>(props: FunnelProps<R>) {
  const {
    data,
    step,
    value,
    format,
    align = 'start',
    overall = true,
    selection,
    height,
    style,
    ...frame
  } = props;
  const { locale } = useQuartile();
  const source = useSourceId();
  const { rows: allRows, schema } = useMemo(() => resolveData(data), [data]);
  const { rows } = useLinkedRows(allRows, { selection, source });
  const valueField = fieldOf(schema, value, rows);
  const stepField = fieldOf(schema, step, rows);
  const steps = useMemo(
    () => aggregateBy(rows, step, { value, aggregate: 'sum', sort: 'none' }),
    [rows, step, value],
  );
  const fmtV = useMemo(
    () =>
      makeFormatter(format ?? (isDataset(data) ? valueField.format : 'integer'), {
        currency: valueField.currency,
        locale,
      }),
    [format, valueField, locale, data],
  );
  const fmtS = useMemo(() => makeFormatter(stepField.format, { locale }), [stepField, locale]);
  const fmtPct = useMemo(() => makeFormatter(SHARE, { locale }), [locale]);
  const fmtPct2 = useMemo(
    () =>
      makeFormatter(
        { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 },
        { locale },
      ),
    [locale],
  );

  const first = steps[0]?.value ?? 0;
  const last = steps.at(-1)?.value ?? 0;
  const model = steps.map((s, i) => {
    const prev = i > 0 ? steps[i - 1].value : s.value;
    return {
      ...s,
      label: fmtS(s.raw),
      ofFirst: first > 0 ? s.value / first : 0,
      ofPrev: prev > 0 ? s.value / prev : 0,
      prevOfFirst: first > 0 ? prev / first : 0,
      dropped: Math.max(0, prev - s.value),
    };
  });
  const overallRate = first > 0 ? last / first : 0;

  const { active, setActive, keyboardProps } = useChartKeyboard(model.length);
  const [hover, setHover] = useState<number | null>(null);
  const focus = hover ?? active;

  const describe = (i: number) => {
    const m = model[i];
    if (i === 0) return `${m.label}: ${fmtV(m.value)}, first step`;
    return `${m.label}: ${fmtV(m.value)}, ${fmtPct(m.ofPrev)} of ${model[i - 1].label}, ${fmtPct(m.ofFirst)} of ${model[0].label}, ${fmtV(m.dropped)} dropped off`;
  };
  const summary =
    model.length > 0
      ? `${model.length} steps from ${model[0].label} (${fmtV(first)}) to ${model.at(-1)!.label} (${fmtV(last)}), ${fmtPct2(overallRate)} overall. ${model
          .slice(1)
          .map((m) => `${m.label} ${fmtPct(m.ofPrev)} from previous`)
          .join('; ')}.`
      : '';

  const table = useMemo<ChartTable>(() => {
    const head = steps[0]?.value ?? 0;
    return {
      columns: [stepField.label, valueField.label, 'From previous step', 'Of first step'],
      rows: steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : 0;
        return [
          fmtS(s.raw),
          fmtV(s.value),
          i === 0 ? '—' : prev > 0 ? fmtPct(s.value / prev) : '—',
          head > 0 ? fmtPct(s.value / head) : '—',
        ];
      }),
    };
  }, [steps, stepField, valueField, fmtS, fmtV, fmtPct]);

  const status = statusOf(frame, model.length);
  const estimated = (model.length || 5) * (align === 'center' ? 47 : 43) + (overall ? 34 : 0);
  // Lists size to their content; states and the visible table need the fixed frame height.
  const autoHeight = status === 'ready' && frame.view !== 'table';
  const kind = 'Funnel chart';
  const barPct = (v: number) => Math.max(1.2, v * 100);

  return (
    <ChartFrame
      kind={kind}
      status={status}
      height={height ?? estimated}
      style={{ height: autoHeight ? 'auto' : (height ?? estimated), ...style }}
      summary={summary}
      table={table}
      {...frame}
    >
      {({ width }) => (
        <>
          <div
            className="q-funnel"
            data-align={align}
            role="list"
            aria-label={`${frame['aria-label'] ?? kind}. Use arrow keys to move between steps.`}
            {...keyboardProps}
            onFocus={(e) => {
              if (e.target === e.currentTarget && isKeyboardFocus(e.currentTarget))
                setActive((a) => a ?? 0);
            }}
          >
            {model.map((m, i) => {
              const conv = i === 0 ? '100%' : fmtPct(m.ofPrev);
              const end =
                align === 'center'
                  ? width / 2 + (barPct(m.ofFirst) / 200) * width
                  : (barPct(m.ofFirst) / 100) * width;
              return (
                <div
                  key={m.key}
                  role="listitem"
                  className="q-funnel-step"
                  data-active={focus === i || undefined}
                  data-tip={i >= model.length / 2 ? 'up' : 'down'}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                >
                  {align === 'start' ? (
                    <>
                      <div className="q-funnel-head">
                        <span className="q-funnel-label">{m.label}</span>
                        <span className="q-funnel-figures">
                          {fmtV(m.value)} <span className="q-funnel-conv">· {conv}</span>
                        </span>
                      </div>
                      <div className="q-funnel-track" aria-hidden="true">
                        {i > 0 && (
                          <span
                            className="q-funnel-ghost"
                            style={{ width: `${barPct(m.prevOfFirst)}%` }}
                          />
                        )}
                        <span className="q-funnel-bar" style={{ width: `${barPct(m.ofFirst)}%` }} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="q-funnel-lane" aria-hidden="true">
                        <span className="q-funnel-bar" style={{ width: `${barPct(m.ofFirst)}%` }} />
                      </div>
                      <div className="q-funnel-caption">
                        <span className="q-funnel-label">{m.label}</span>
                        <span className="q-funnel-figures">{fmtV(m.value)}</span>
                        <span className="q-funnel-conv">
                          {i === 0 ? '100%' : `${conv} from previous`}
                        </span>
                      </div>
                    </>
                  )}
                  {focus === i && (
                    <ChartTooltip
                      x={end}
                      width={width}
                      top={align === 'center' ? 26 : 30}
                      title={m.label}
                      rows={[
                        { label: valueField.label, value: fmtV(m.value) },
                        ...(i > 0
                          ? [
                              {
                                label: `From ${model[i - 1].label.toLowerCase()}`,
                                value: fmtPct(m.ofPrev),
                              },
                              {
                                label: `From ${model[0].label.toLowerCase()}`,
                                value: fmtPct(m.ofFirst),
                              },
                            ]
                          : []),
                      ]}
                      footer={
                        i > 0
                          ? {
                              label: 'Dropped off',
                              value: `${MINUS}${fmtV(m.dropped)}`,
                              tone: 'negative',
                            }
                          : undefined
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
          {overall && model.length > 1 && (
            <div className="q-funnel-overall">
              <span>
                Overall, {model[0].label.toLowerCase()} to {model.at(-1)!.label.toLowerCase()}
              </span>
              <span className="q-funnel-overall-value">{fmtPct2(overallRate)}</span>
            </div>
          )}
          <div className="q-visually-hidden" aria-live="polite">
            {active != null && model[active] ? describe(active) : ''}
          </div>
        </>
      )}
    </ChartFrame>
  );
}
