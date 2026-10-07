import {
  Button,
  ButtonGroup,
  IconButton,
  IconDownload,
  IconFile,
  IconMore,
  IconShare,
  SplitButton,
} from '@quartile/react';
import { type CSSProperties, type ReactNode, useState } from 'react';
import { BUTTON_STATES, BUTTON_VARIANTS } from '../../data/actions-inputs';
import { Section } from '../Section';

// Owner: actions-inputs.

const card: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: 20,
  background: 'var(--q-surface)',
  border: '1px solid var(--q-line)',
  borderRadius: 14,
  minWidth: 0,
};

const cardTitle: CSSProperties = { fontSize: 14, fontWeight: 600, color: 'var(--q-text)' };

const mono11: CSSProperties = {
  font: '400 11px var(--q-font-mono)',
  color: 'var(--q-text-3)',
};

const matrixCols: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '100px repeat(6, minmax(0, 1fr))',
  gap: 12,
  alignItems: 'center',
};

const rowLine = '1px solid color-mix(in srgb, var(--q-grid) 60%, var(--q-surface))';

/** Real Buttons in each state: hover/pressed/focus are forced with `data-state`. */
function StateCell({
  variant,
  label,
  state,
}: {
  variant: (typeof BUTTON_VARIANTS)[number][0];
  label: string;
  state: (typeof BUTTON_STATES)[number];
}) {
  const forced =
    state === 'Hover'
      ? 'hover'
      : state === 'Pressed'
        ? 'pressed'
        : state === 'Focus'
          ? 'focus'
          : undefined;
  return (
    <span>
      <Button
        variant={variant}
        data-state={forced}
        disabled={state === 'Disabled'}
        loading={state === 'Loading'}
        tabIndex={state === 'Default' ? undefined : -1}
        aria-hidden={state === 'Default' ? undefined : true}
      >
        {state === 'Loading' ? 'Working' : label}
      </Button>
    </span>
  );
}

function Card({
  title,
  style,
  children,
}: {
  title: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div style={{ ...card, ...style }}>
      <span style={cardTitle}>{title}</span>
      {children}
    </div>
  );
}

export function ButtonsSection() {
  const [view, setView] = useState<'Chart' | 'Table' | 'Both'>('Chart');
  const [lastAction, setLastAction] = useState<string | null>(null);
  return (
    <Section
      id="buttons"
      eyebrow="06 · Components"
      title="Buttons"
      lead="Five variants, three sizes, six states. Ink is the one primary action per view. Signal is for actions that change what the data shows: apply, select, share a view."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            background: 'var(--q-surface)',
            border: '1px solid var(--q-line)',
            borderRadius: 14,
            overflow: 'auto',
          }}
        >
          <div style={{ minWidth: 820 }}>
            <div
              style={{
                ...matrixCols,
                padding: '12px 18px',
                borderBottom: '1px solid var(--q-subtle)',
                font: '500 10.5px var(--q-font-mono)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--q-text-3)',
              }}
            >
              <span>Variant</span>
              {BUTTON_STATES.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
            {BUTTON_VARIANTS.map(([variant, name, label], i) => (
              <div
                key={variant}
                style={{
                  ...matrixCols,
                  padding: '14px 18px',
                  borderBottom: i < BUTTON_VARIANTS.length - 1 ? rowLine : undefined,
                }}
              >
                <span style={{ font: '500 12px var(--q-font-mono)', color: 'var(--q-text)' }}>
                  {name}
                </span>
                {BUTTON_STATES.map((s) => (
                  <StateCell key={s} variant={variant} label={label} state={s} />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <Card title="Sizes" style={{ flex: '1 1 340px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
              {(
                [
                  ['sm', 28],
                  ['md', 36],
                  ['lg', 44],
                ] as const
              ).map(([size, h]) => (
                <div key={size} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Button variant="primary" size={size}>
                    Apply
                  </Button>
                  <span style={mono11}>
                    {size} · {h}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Icon buttons, groups, split" style={{ flex: '1.4 1 420px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <IconButton icon={<IconDownload />} label="Download" />
              <IconButton icon={<IconMore />} label="More actions" variant="ghost" />
              <ButtonGroup aria-label="View">
                {(['Chart', 'Table', 'Both'] as const).map((v) => (
                  <Button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
                    {v}
                  </Button>
                ))}
              </ButtonGroup>
              <SplitButton
                variant="signal"
                label="Export PDF"
                menuLabel="More export formats"
                onClick={() => setLastAction('Export PDF')}
                menu={[
                  {
                    label: 'Export CSV',
                    icon: <IconFile />,
                    meta: '.csv',
                    onSelect: () => setLastAction('Export CSV'),
                  },
                  {
                    label: 'Export PNG',
                    icon: <IconDownload />,
                    meta: '.png',
                    onSelect: () => setLastAction('Export PNG'),
                  },
                  {
                    label: 'Share link',
                    icon: <IconShare />,
                    onSelect: () => setLastAction('Share link'),
                  },
                ]}
              />
              <a
                href="#buttons"
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--q-signal)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                View report →
              </a>
            </div>
            <span style={mono11} aria-live="polite">
              {lastAction ? `Last action: ${lastAction}` : ''}
            </span>
          </Card>
        </div>
      </div>
    </Section>
  );
}
