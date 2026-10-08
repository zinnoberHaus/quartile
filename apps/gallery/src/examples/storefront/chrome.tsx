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
  IconFlask,
  IconFunnel,
  IconGrid,
  IconLineChart,
  IconSettings,
  IconShare,
  IconUsers,
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
import { fmt } from './model';

export const SOURCE_URL =
  'https://github.com/zinnoberHaus/quartile/tree/main/apps/gallery/src/examples/storefront';

const NAV: { label: string; icon: ReactNode }[] = [
  { label: 'Overview', icon: <IconGrid /> },
  { label: 'Revenue', icon: <IconLineChart /> },
  { label: 'Customers', icon: <IconUsers /> },
  { label: 'Products', icon: <IconBox /> },
  { label: 'Funnels', icon: <IconFunnel /> },
  { label: 'Experiments', icon: <IconFlask /> },
];

export interface SidebarProps {
  open: boolean;
  onSearch: () => void;
  onPlaceholder: (page: string) => void;
  onAlerts: () => void;
  alertCount: number;
  onTheme: (t: 'light' | 'dark') => void;
  rowsInView: number;
  grain: string;
}

export function SfSidebar({
  open,
  onSearch,
  onPlaceholder,
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
            <div className="sf-source-name">kestrel.orders</div>
            <div className="sf-source-meta">Sample data · generated in the browser</div>
            <div className="sf-source-meta">
              {fmt.int(rowsInView)} {grain} rows in this period
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
      <SidebarSection title="Analytics">
        {NAV.map((n) => (
          <SidebarItem
            key={n.label}
            label={n.label}
            icon={n.icon}
            active={n.label === 'Overview'}
            onClick={n.label === 'Overview' ? undefined : () => onPlaceholder(n.label)}
          />
        ))}
      </SidebarSection>
      <SidebarSection title="Workspace">
        <SidebarItem label="Reports" icon={<IconFile />} onClick={() => onPlaceholder('Reports')} />
        <SidebarItem
          label="Alerts"
          icon={<IconBell />}
          badge={alertCount > 0 ? alertCount : undefined}
          onClick={onAlerts}
        />
        <SidebarItem
          label="Settings"
          icon={<IconSettings />}
          onClick={() => onPlaceholder('Settings')}
        />
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
