import { type HTMLAttributes, useId, useState } from 'react';
import { cx } from '../lib/cx';
import { ANALYSIS_LIMITS } from './limits';
import type { AnalysisAction } from './types';
import type { AnalysisAssistant } from './useAnalysisAssistant';

export interface AssistantPanelProps extends Omit<HTMLAttributes<HTMLElement>, 'onSubmit'> {
  assistant: AnalysisAssistant;
  title?: string;
  placeholder?: string;
}

function describe(action: AnalysisAction): string {
  switch (action.type) {
    case 'filter':
      return `Filter ${action.field} ${action.op} ${JSON.stringify(action.value)}`;
    case 'clear-filter':
      return `Clear the ${action.field} filter`;
    case 'sort':
      return `Sort ${action.field} ${action.direction === 'asc' ? 'ascending' : 'descending'}`;
    case 'chart':
      return `${action.chart} chart: ${action.x}${'y' in action ? ` × ${action.y}` : ''}`;
    case 'table':
      return `Table: ${action.fields.join(', ')} · up to ${action.limit} rows`;
  }
}

/** A transport-agnostic proposal inspector; all model text is escaped React text. */
export function AssistantPanel({
  assistant,
  title = 'Analysis assistant',
  placeholder = 'Describe the view you want to explore…',
  className,
  ...props
}: AssistantPanelProps) {
  const id = useId();
  const [prompt, setPrompt] = useState('');
  const busy = assistant.status === 'loading';
  const profile = assistant.context.profile;
  return (
    <section
      {...props}
      className={cx('q-assistant', className)}
      aria-labelledby={`${id}-title`}
      data-state={assistant.status}
    >
      <header className="q-assistant-header">
        <h3 id={`${id}-title`}>{title}</h3>
        <span className="q-assistant-mode">
          {assistant.adapter.mode === 'deterministic'
            ? 'Deterministic planner · no model'
            : 'Live backend'}
        </span>
      </header>
      <p className="q-assistant-source">
        {assistant.adapter.label} · {assistant.context.source.label ?? assistant.context.source.id}{' '}
        · revision {assistant.context.source.version}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void assistant.submit(prompt);
        }}
      >
        <label htmlFor={`${id}-prompt`}>Analysis request</label>
        <textarea
          id={`${id}-prompt`}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          maxLength={ANALYSIS_LIMITS.prompt}
          placeholder={placeholder}
          rows={3}
          disabled={busy}
        />
        <div className="q-assistant-actions">
          <button type="submit" disabled={busy || !prompt.trim()}>
            {busy ? 'Preparing proposal…' : 'Propose changes'}
          </button>
          {busy && (
            <button type="button" onClick={assistant.cancel}>
              Cancel
            </button>
          )}
        </div>
      </form>
      <details className="q-assistant-context">
        <summary>Inspect context sent to the adapter</summary>
        <p>
          {assistant.context.fields.length} fields · {assistant.context.selection.length} active
          filters
          {profile
            ? ` · ${profile.scannedRows.toLocaleString()} of ${profile.totalRows.toLocaleString()} rows profiled${profile.complete ? '' : ' (prefix only)'}`
            : ''}
          . No raw records are included.
        </p>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: The bounded code region scrolls with the keyboard. */}
        <pre role="region" tabIndex={0} aria-label="Analysis context JSON">
          {JSON.stringify(assistant.context, null, 2)}
        </pre>
      </details>
      {assistant.status === 'error' && (
        <div className="q-assistant-error" role="alert">
          <p>{assistant.error}</p>
          {assistant.validationErrors.length > 0 && (
            <ul>
              {assistant.validationErrors.map((error, i) => (
                <li key={i}>
                  <code>{error.path || '/'}</code> {error.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {assistant.plan && (
        <div className="q-assistant-proposal">
          <h4>{assistant.plan.title}</h4>
          <p>{assistant.plan.summary}</p>
          <ol>
            {assistant.plan.actions.map((action, i) => (
              <li key={i}>{describe(action)}</li>
            ))}
          </ol>
          <details>
            <summary>Inspect plan JSON</summary>
            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: The bounded code region scrolls with the keyboard. */}
            <pre role="region" tabIndex={0} aria-label="Analysis plan JSON">
              {JSON.stringify(assistant.plan, null, 2)}
            </pre>
          </details>
          {assistant.status === 'review' && (
            <div className="q-assistant-actions">
              <button type="button" onClick={assistant.apply}>
                Apply changes
              </button>
              <button type="button" onClick={assistant.discard}>
                Discard
              </button>
            </div>
          )}
        </div>
      )}
      <p className="q-assistant-status" role="status">
        {assistant.status === 'review'
          ? 'Proposal ready. Inspect the changes before applying.'
          : assistant.status === 'applied'
            ? 'Changes applied.'
            : assistant.status === 'cancelled'
              ? 'Cancelled. No pending proposal.'
              : busy
                ? 'Waiting for the adapter. You can cancel this request.'
                : assistant.status === 'idle'
                  ? 'Proposals change the view only when you apply them.'
                  : ''}
      </p>
    </section>
  );
}
