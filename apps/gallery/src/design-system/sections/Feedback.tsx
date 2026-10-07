import {
  Avatar,
  AvatarGroup,
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  Delta,
  DialogPanel,
  IconButton,
  IconCopy,
  IconDownload,
  IconShare,
  Kbd,
  Meter,
  Popover,
  PopoverAction,
  PopoverPanel,
  Progress,
  Skeleton,
  Toast,
  Toaster,
  Tooltip,
  TooltipPanel,
  toast,
} from '@quartile/react';
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { TEAM } from '../../data/navigation-feedback';
import { Demo, Label, Section } from '../Section';

const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' };
const stack = (gap: number): CSSProperties => ({ display: 'flex', flexDirection: 'column', gap });
const wrap = (gap: number): CSSProperties => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap,
});
const caption: CSSProperties = {
  font: '400 11.5px var(--q-font-mono)',
  color: 'var(--q-text-3)',
  lineHeight: 1.5,
};

function Cell({ flex, children }: { flex: string; children: ReactNode }) {
  return <div style={{ flex, minWidth: 0, display: 'grid' }}>{children}</div>;
}

function SeriesRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ font: '500 12px var(--q-font-mono)' }}>{value}</span>
    </div>
  );
}

const seriesTooltip = (
  <div>
    <div style={{ font: '500 11px var(--q-font-mono)', color: 'var(--q-inverse-text-2)' }}>
      Sep 14, 2026
    </div>
    <SeriesRow color="#7383ff" label="Organic" value="$21,480" />
    <SeriesRow color="#ff8b5e" label="Paid social" value="$14,902" />
  </div>
);

const anomalyBody =
  'Orders were 2.8σ above the 28-day baseline. The Labor Day campaign started that morning.';

function TooltipPopoverCard() {
  const [note, setNote] = useState<string | null>(null);
  return (
    <Demo title="Tooltip · Popover">
      <div style={stack(16)}>
        <div style={{ ...wrap(16), alignItems: 'flex-start' }}>
          <TooltipPanel side="top">Copy link</TooltipPanel>
          <TooltipPanel side="top" arrow={false} rich style={{ minWidth: 180 }}>
            {seriesTooltip}
          </TooltipPanel>
        </div>
        <PopoverPanel
          title="Anomaly on Sep 5"
          style={{ maxWidth: 300 }}
          actions={
            <>
              <PopoverAction variant="signal">Annotate</PopoverAction>
              <PopoverAction>Dismiss</PopoverAction>
            </>
          }
        >
          {anomalyBody}
        </PopoverPanel>
        <div style={stack(10)}>
          <Label>Live · hover, focus or click</Label>
          <div style={wrap(8)}>
            <Tooltip content="Copy link">
              <IconButton icon={<IconCopy />} label="Copy link" size="sm" />
            </Tooltip>
            <Tooltip content="Download PNG">
              <IconButton icon={<IconDownload />} label="Download PNG" size="sm" />
            </Tooltip>
            <Tooltip content={seriesTooltip} placement="bottom">
              <Button size="sm">Sep 14 point</Button>
            </Tooltip>
            <Popover
              title="Anomaly on Sep 5"
              trigger={
                <Button size="sm" variant="signal">
                  Sep 5 anomaly
                </Button>
              }
              actions={({ close }) => (
                <>
                  <PopoverAction
                    variant="signal"
                    onClick={() => {
                      setNote('Annotated Sep 5');
                      close();
                    }}
                  >
                    Annotate
                  </PopoverAction>
                  <PopoverAction onClick={close}>Dismiss</PopoverAction>
                </>
              )}
            >
              {anomalyBody}
            </Popover>
          </div>
          {note && <span style={caption}>{note}</span>}
        </div>
      </div>
    </Demo>
  );
}

function ToastBannerCard() {
  const [showInfo, setShowInfo] = useState(true);
  const showToast = () =>
    toast({
      title: 'Report exported',
      description: '4 charts, 1 table · revenue-q3.pdf',
      tone: 'success',
      action: { label: 'Undo', onClick: () => toast({ title: 'Export undone' }) },
    });
  return (
    <Demo title="Toast · Banner">
      <div style={stack(12)}>
        <Toast
          tone="success"
          title="Dashboard shared"
          description="Anyone at Kestrel with the link can view."
          action={{ label: 'Copy link', onClick: () => toast({ title: 'Link copied' }) }}
        />
        {showInfo ? (
          <Banner tone="info" onDismiss={() => setShowInfo(false)}>
            Data refreshes every 15 minutes. Last run 2 min ago.
          </Banner>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setShowInfo(true)}>
            Show the info banner again
          </Button>
        )}
        <Banner tone="warning">Showing cached results. The warehouse is slower than usual.</Banner>
        <Banner
          tone="error"
          action={{
            label: 'Retry',
            onClick: () =>
              toast({ title: 'Retry clicked', description: 'Banner actions call your handler.' }),
          }}
        >
          Query failed: column “region_id” not found.
        </Banner>
        <div className="g-row" style={{ marginTop: 4 }}>
          <Button size="sm" onClick={showToast}>
            Show toast
          </Button>
          <span style={caption}>Bottom right · pauses on hover · 5 s</span>
        </div>
      </div>
    </Demo>
  );
}

function DialogCard() {
  const [open, setOpen] = useState(false);
  const footer = (
    <>
      <Button tabIndex={-1}>Cancel</Button>
      <Button variant="destructive" tabIndex={-1}>
        Delete dashboard
      </Button>
    </>
  );
  return (
    <div
      style={{
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        minHeight: 260,
        padding: '28px 28px 56px',
        borderRadius: 14,
        background: 'color-mix(in srgb, var(--q-inverse) 42%, transparent)',
      }}
    >
      <div aria-hidden="true" style={{ width: '100%', maxWidth: 400 }}>
        <DialogPanel
          title="Delete “Q3 revenue”?"
          description="The dashboard and its 6 charts will be removed for everyone. Saved queries stay in the library."
          footer={footer}
        />
      </div>
      <div style={{ position: 'absolute', left: 16, bottom: 14 }}>
        <Button size="sm" onClick={() => setOpen(true)}>
          Open the live dialog
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        destructive
        title="Delete “Q3 revenue”?"
        description="The dashboard and its 6 charts will be removed for everyone. Saved queries stay in the library."
        confirmLabel="Delete dashboard"
        onConfirm={() =>
          new Promise<void>((resolve) => setTimeout(resolve, 900)).then(() => {
            toast({
              title: '“Q3 revenue” deleted',
              description: 'Gallery demo: nothing was removed.',
              tone: 'success',
            });
          })
        }
      />
    </div>
  );
}

function ProgressCard() {
  const [value, setValue] = useState(68);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => () => clearInterval(timer.current), []);
  const run = () => {
    clearInterval(timer.current);
    setRunning(true);
    setValue(0);
    timer.current = setInterval(() => {
      setValue((v) => {
        const next = Math.min(100, v + 4);
        if (next >= 100) {
          clearInterval(timer.current);
          setRunning(false);
        }
        return next;
      });
    }, 90);
  };
  return (
    <Demo title="Progress · Meter · Skeleton">
      <div style={stack(16)}>
        <Progress label="Exporting 4 charts" value={value} showValue />
        <Meter label="Query quota" value={8.6} max={10} format={(v, max) => `${v} / ${max} GB`} />
        <div
          style={{
            ...stack(10),
            padding: 14,
            border: '1px solid var(--q-subtle)',
            borderRadius: 10,
          }}
        >
          <Skeleton width="40%" height={10} />
          <Skeleton width="60%" height={22} radius={5} />
          <Skeleton height={44} radius={6} />
        </div>
        <div className="g-row">
          <Button size="sm" onClick={run} disabled={running}>
            {running ? 'Exporting…' : 'Run export'}
          </Button>
          <Progress style={{ flex: 1, minWidth: 80 }} aria-label="Indeterminate example" />
        </div>
      </div>
    </Demo>
  );
}

function DisplayCard() {
  return (
    <Demo title="Badge · Delta · Avatar · Kbd">
      <div style={stack(14)}>
        <div style={wrap(6)}>
          <Badge tone="live">Live</Badge>
          <Badge tone="stale">Stale</Badge>
          <Badge tone="failed">Failed</Badge>
          <Badge tone="draft">Draft</Badge>
          <Badge tone="beta">Beta</Badge>
        </div>
        <div style={wrap(6)}>
          <Delta value={0.124} />
          <Delta value={-0.031} />
          <Delta value={0} />
          <Delta value={0.082} variant="arrow" />
          <Delta value={-0.013} variant="arrow" />
          <Delta value={0.21} kind="pt" tone="signal" />
        </div>
        <div style={wrap(14)}>
          <AvatarGroup max={3} aria-label="Viewers">
            {TEAM.map((name, i) => (
              <Avatar key={name} name={name} color={i < 3 ? i + 1 : undefined} />
            ))}
          </AvatarGroup>
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </div>
        <div style={stack(8)}>
          <Label>Small · inline</Label>
          <div style={wrap(6)}>
            <Badge tone="live" size="sm">
              LIVE
            </Badge>
            <Badge tone="signal" size="sm">
              drill-down
            </Badge>
            <Badge tone="stale" size="sm">
              Stale · 2h
            </Badge>
            <Delta value={-0.02} kind="pt" />
            <Delta value={0.046} variant="plain" />
            <Delta value={-0.12} invert variant="plain" />
          </div>
          <span style={caption}>Last delta: −12% on a metric where down is good (invert).</span>
        </div>
        <div style={wrap(8)}>
          <Tooltip content="Share this view">
            <IconButton icon={<IconShare />} label="Share" size="sm" variant="ghost" />
          </Tooltip>
          <Avatar name="Jamie Moss" size="lg" color={1} />
          <Avatar name="Ada Kowalski" size="sm" color={2} />
        </div>
      </div>
    </Demo>
  );
}

export function FeedbackSection() {
  return (
    <Section
      id="feedback"
      eyebrow="09 · Components"
      title="Feedback & overlays"
      lead="Data apps are mostly waiting, failing and being empty. Those states get the same care as the happy path, and every overlay shares one elevation and one dark surface."
    >
      <div style={stack(16)}>
        <div style={row}>
          <Cell flex="1 1 320px">
            <TooltipPopoverCard />
          </Cell>
          <Cell flex="1 1 320px">
            <ToastBannerCard />
          </Cell>
        </div>
        <div style={row}>
          <Cell flex="1.2 1 380px">
            <DialogCard />
          </Cell>
          <Cell flex="1 1 300px">
            <ProgressCard />
          </Cell>
          <Cell flex="1 1 280px">
            <DisplayCard />
          </Cell>
        </div>
      </div>
      <Toaster />
    </Section>
  );
}
