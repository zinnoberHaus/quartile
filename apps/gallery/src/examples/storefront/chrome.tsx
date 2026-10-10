'use client';
// Sidebar, page header and command menu of the storefront example.
import {
  Avatar,
  Badge,
  Breadcrumbs,
  Button,
  DateRangePicker,
  IconBell,
  IconBox,
  IconDownload,
  IconExternal,
  IconFile,
  IconFunnel,
  IconGrid,
  IconLineChart,
  IconShare,
  Menu,
  type DateRange as QDateRange,
  SegmentedControl,
  Sidebar,
  SidebarHeader,
  SidebarItem,
  SidebarSearch,
  SidebarSection,
  Switch,
  useQuartile,
} from '@quartile/react';
import type { ReactNode } from 'react';
import {
  type DateRange,
  LAST_DAY,
  MIN_START,
  PERIODS,
  type Period,
  rangeForPeriod,
} from '../../data/storefront';
import { Link } from '../../router';
import { fmt } from './model';

export const SOURCE_URL =
  'https://github.com/zinnoberHaus/quartile/tree/main/apps/gallery/src/examples/storefront';

export type StorefrontSection = 'overview' | 'revenue' | 'products' | 'conversion';
const NAV: { label: string; section: StorefrontSection; icon: ReactNode }[] = [
  { label: 'Overview', section: 'overview', icon: <IconGrid /> },
  { label: 'Revenue & markets', section: 'revenue', icon: <IconLineChart /> },
  { label: 'Products', section: 'products', icon: <IconBox /> },
  { label: 'Channels & conversion', section: 'conversion', icon: <IconFunnel /> },
];

export interface SidebarProps {
  open: boolean;
  onSearch: () => void;
  onSection: (section: StorefrontSection) => void;
  onAlerts: () => void;
  alertCount: number;
  onTheme: (t: 'light' | 'dark') => void;
  rowsInView: number;
  grain: string;
}

export function SfSidebar({
  open,
  onSearch,
  onSection,
  onAlerts,
  alertCount,
  onTheme,
  rowsInView,
  grain,
}: SidebarProps) {
  const { theme } = useQuartile();
  return (
    <Sidebar
      className="sf-side"
      data-open={open || undefined}
      label="Storefront analytics"
      header={
        <>
          <Menu
            label="Workspace"
            items={[
              { label: 'Kestrel Goods · sample workspace', disabled: true },
              'separator',
              {
                label: 'View this example’s source',
                icon: <IconExternal />,
                onSelect: () => window.open(SOURCE_URL, '_blank', 'noopener,noreferrer'),
              },
            ]}
            trigger={
              <SidebarHeader
                title="Kestrel Goods"
                subtitle="Storefront analytics"
                logo="K"
                onClick={() => {}}
              />
            }
          />
          <SidebarSearch onClick={onSearch} />
        </>
      }
      footer={
        <>
          <div className="sf-source">
            <div className="sf-source-head">
              <span className="sf-eyebrow">Source</span>
              <Badge tone="signal" size="sm">
                Sample
              </Badge>
            </div>
            <div className="sf-source-name">kestrel.aggregate_sales</div>
            <div className="sf-source-meta">Modeled sales, not individual orders</div>
            <div className="sf-source-meta">
              {fmt.int(rowsInView)} {grain} × market × channel × product rows
            </div>
          </div>
          <div className="sf-theme">
            <span className="sf-eyebrow">Theme</span>
            <SegmentedControl
              size="sm"
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              value={theme}
              onChange={(v) => onTheme(v as 'light' | 'dark')}
              aria-label="Theme"
            />
          </div>
          <div className="sf-user">
            <Avatar name="Demo Viewer" size="md" />
            <span className="sf-user-text">
              <span className="sf-user-name">Demo viewer</span>
              <span className="sf-user-role">Read-only sample</span>
            </span>
          </div>
        </>
      }
    >
      <SidebarSection title="On this page">
        {NAV.map((n) => (
          <SidebarItem
            key={n.label}
            label={n.label}
            icon={n.icon}
            onClick={() => onSection(n.section)}
          />
        ))}
      </SidebarSection>
      <SidebarSection title="Workspace">
        <SidebarItem
          label="Sample stock alerts"
          icon={<IconBell />}
          badge={alertCount > 0 ? alertCount : undefined}
          onClick={onAlerts}
        />
      </SidebarSection>
      <SidebarSection title="Explore Quartile">
        <Link className="sf-example-link" to="/">
          Component gallery ↗
        </Link>
        <Link className="sf-example-link" to="/studio">
          Build with Studio ↗
        </Link>
      </SidebarSection>
    </Sidebar>
  );
}

const PRESET_LABEL: Record<Period, string> = {
  '7D': 'Last 7 days',
  '30D': 'Last 30 days',
  '90D': 'Last 90 days',
  '12M': 'Last 52 weeks',
};

export interface HeaderProps {
  period: Period | null;
  range: DateRange;
  onRange: (r: DateRange) => void;
  compare: boolean;
  onCompare: (on: boolean) => void;
  onShare: () => void;
  onDownload: () => void;
  onCopyJSON: () => void;
}

export function SfHeader({
  period,
  range,
  onRange,
  compare,
  onCompare,
  onShare,
  onDownload,
  onCopyJSON,
}: HeaderProps) {
  return (
    <header className="sf-header">
      <div className="sf-heading">
        <Breadcrumbs
          items={[{ label: 'Analytics' }, { label: 'Overview' }]}
          trailing={
            <Badge tone="neutral" size="sm" dot>
              Sample data
            </Badge>
          }
        />
        <h1 className="sf-title">Revenue overview</h1>
      </div>
      <div className="sf-actions">
        <SegmentedControl
          mono
          options={PERIODS}
          value={period ?? ''}
          onChange={(v) => onRange(rangeForPeriod(v as Period))}
          aria-label="Period"
        />
        <DateRangePicker
          className="sf-range"
          value={range as QDateRange}
          onChange={(r) => onRange(r)}
          presets={PERIODS.map((p) => ({ label: PRESET_LABEL[p], range: rangeForPeriod(p) }))}
          min={MIN_START}
          max={LAST_DAY}
          today={LAST_DAY}
          showDuration={false}
          aria-label="Date range"
        />
        <span className="sf-compare">
          <Switch size="sm" label="Compare" checked={compare} onChange={onCompare} />
        </span>
        <Button variant="secondary" icon={<IconShare />} onClick={onShare}>
          Share
        </Button>
        <Menu
          label="Export"
          placement="bottom-end"
          items={[
            { label: 'Download CSV', icon: <IconDownload />, onSelect: onDownload },
            { label: 'Copy as JSON', icon: <IconFile />, onSelect: onCopyJSON },
          ]}
          trigger={
            <Button variant="primary" icon={<IconDownload />}>
              Export
            </Button>
          }
        />
      </div>
    </header>
  );
}
