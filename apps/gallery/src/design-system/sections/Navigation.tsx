import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  type CommandGroup,
  CommandMenu,
  CommandPalette,
  IconBarChart,
  IconBell,
  IconBox,
  IconButton,
  IconCopy,
  IconDownload,
  IconFile,
  IconFlask,
  IconFunnel,
  IconGrid,
  IconHeatmap,
  IconLineChart,
  IconMore,
  IconSettings,
  IconTable,
  IconUsers,
  Kbd,
  Menu,
  type MenuItem,
  Pagination,
  Pills,
  Sidebar,
  SidebarHeader,
  SidebarItem,
  SidebarSearch,
  SidebarSection,
  TabPanel,
  Tabs,
  toast,
  useHotkey,
} from '@quartile/react';
import { type CSSProperties, type ReactNode, useState } from 'react';
import { PILL_ITEMS, SIDEBAR_ITEMS, TAB_ITEMS } from '../../data/navigation-feedback';
import { Demo, Label, Section } from '../Section';

const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' };
const cell = (flex: string): CSSProperties => ({ flex, minWidth: 0, display: 'grid' });
const stack = (gap: number): CSSProperties => ({ display: 'flex', flexDirection: 'column', gap });
const caption: CSSProperties = {
  font: '400 11.5px var(--q-font-mono)',
  color: 'var(--q-text-3)',
  lineHeight: 1.5,
};

function Cell({ flex, children }: { flex: string; children: ReactNode }) {
  return <div style={cell(flex)}>{children}</div>;
}

function TabsPillsCard() {
  const [tab, setTab] = useState('revenue');
  const [pill, setPill] = useState('all');
  const [page, setPage] = useState(2);
  return (
    <Demo title="Tabs · Pills · Breadcrumbs · Pagination">
      <div style={stack(22)}>
        <Tabs items={TAB_ITEMS} value={tab} onChange={setTab} label="Dashboard views" />
        <Pills items={PILL_ITEMS} value={pill} onChange={setPill} label="Filter components" />
        <Breadcrumbs
          items={[
            { label: 'Workspace', href: '#navigation' },
            { label: 'Revenue', href: '#navigation' },
            { label: 'Europe' },
          ]}
          trailing={
            <Badge tone="signal" size="sm">
              drill-down
            </Badge>
          }
        />
        <Pagination page={page} pageCount={24} onChange={setPage} />
      </div>
    </Demo>
  );
}

function SidebarCard() {
  const [active, setActive] = useState('overview');
  return (
    <Sidebar
      label="Sidebar example"
      header={<span style={{ padding: '2px 10px 6px', fontWeight: 600 }}>Sidebar</span>}
      style={{
        width: 'auto',
        gap: 2,
        padding: 14,
        border: '1px solid var(--q-line)',
        borderRadius: 14,
      }}
    >
      {SIDEBAR_ITEMS.map((item) => (
        <SidebarItem
          key={item.value}
          label={item.label}
          badge={item.badge}
          active={active === item.value}
          onClick={() => setActive(item.value)}
        />
      ))}
    </Sidebar>
  );
}

function MenuCard() {
  const [last, setLast] = useState<string | null>(null);
  const items: MenuItem[] = [
    {
      label: 'Duplicate chart',
      icon: <IconCopy />,
      shortcut: '⌘D',
      onSelect: () => setLast('Duplicate chart'),
    },
    {
      label: 'Download PNG',
      icon: <IconDownload />,
      shortcut: '⇧⌘P',
      onSelect: () => setLast('Download PNG'),
    },
    {
      label: 'View as table',
      icon: <IconTable />,
      shortcut: 'T',
      onSelect: () => setLast('View as table'),
    },
    'separator',
    {
      label: 'Remove from dashboard',
      danger: true,
      onSelect: () => setLast('Remove from dashboard'),
    },
  ];
  return (
    <Demo title="Menu">
      <div style={stack(12)}>
        <Card
          title="Net revenue"
          subtitle="Sep 7 – Oct 6 · daily"
          actions={
            <Menu
              label="Chart actions"
              placement="bottom-end"
              items={items}
              trigger={
                <IconButton icon={<IconMore />} label="Chart actions" variant="ghost" size="sm" />
              }
            />
          }
        >
          <span style={caption}>Last action: {last ?? '—'}</span>
        </Card>
        <span style={caption}>
          Click ⋯ or focus it and press ↓. Arrows move, letters jump, Esc closes.
        </span>
      </div>
    </Demo>
  );
}

function CommandCard({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const run = (label: string) => () =>
    toast({ title: label, description: 'Selected from the command menu.' });
  const groups: CommandGroup[] = [
    {
      label: 'Charts',
      items: [
        {
          label: 'Line chart',
          icon: <IconLineChart />,
          keywords: ['add', 'trend'],
          onSelect: run('Line chart'),
        },
        {
          label: 'Bar chart',
          icon: <IconBarChart />,
          keywords: ['add', 'compare'],
          onSelect: run('Bar chart'),
        },
        {
          label: 'Heatmap',
          icon: <IconHeatmap />,
          keywords: ['add', 'matrix'],
          onSelect: run('Heatmap'),
        },
      ],
    },
    {
      label: 'Actions',
      items: [
        {
          label: 'Export as CSV',
          icon: <IconDownload />,
          shortcut: '⌘E',
          keywords: ['download'],
          onSelect: run('Export as CSV'),
        },
        { label: 'Duplicate dashboard', icon: <IconCopy />, onSelect: run('Duplicate dashboard') },
      ],
    },
  ];
  return (
    <Demo
      title="CommandMenu"
      aside={
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      }
    >
      <div style={stack(12)}>
        <div style={{ boxShadow: '0 18px 40px -16px rgba(22,21,15,.22)', borderRadius: 12 }}>
          <CommandPalette
            groups={groups}
            placeholder="add chart"
            label="Search commands (inline example)"
          />
        </div>
        <div className="g-row">
          <Button size="sm" onClick={() => setOpen(true)}>
            Open command menu
          </Button>
          <span style={caption}>or press ⌘K / Ctrl K</span>
        </div>
        <CommandMenu
          open={open}
          onOpenChange={setOpen}
          groups={groups}
          placeholder="Search charts and actions…"
        />
      </div>
    </Demo>
  );
}

function AppSidebarCard({ onSearch }: { onSearch: () => void }) {
  const [active, setActive] = useState('overview');
  const [workspace, setWorkspace] = useState('Kestrel Goods');
  const item = (
    value: string,
    label: string,
    icon: ReactNode,
    extra?: { count?: number; badge?: number },
  ) => (
    <SidebarItem
      label={label}
      icon={icon}
      count={extra?.count}
      badge={extra?.badge}
      active={active === value}
      onClick={() => setActive(value)}
    />
  );
  return (
    <Demo title="Sidebar · app shell" pad={false}>
      <div style={{ borderTop: '1px solid var(--q-line)', marginTop: 14 }}>
        <Sidebar
          label="Example app"
          style={{ width: '100%', borderRight: 0 }}
          header={
            <>
              <Menu
                label="Switch workspace"
                items={['Kestrel Goods', 'Kestrel Wholesale'].map((name) => ({
                  label: name,
                  onSelect: () => setWorkspace(name),
                }))}
                trigger={
                  <SidebarHeader
                    logo={workspace[0]}
                    title={workspace}
                    subtitle="Storefront analytics"
                  />
                }
              />
              <SidebarSearch onClick={onSearch} />
            </>
          }
        >
          <SidebarSection title="Analytics">
            {item('overview', 'Overview', <IconGrid />)}
            {item('revenue', 'Revenue', <IconLineChart />)}
            {item('customers', 'Customers', <IconUsers />)}
            {item('products', 'Products', <IconBox />)}
            {item('funnels', 'Funnels', <IconFunnel />)}
            {item('experiments', 'Experiments', <IconFlask />)}
          </SidebarSection>
          <SidebarSection title="Workspace">
            {item('reports', 'Reports', <IconFile />, { count: 12 })}
            {item('alerts', 'Alerts', <IconBell />, { badge: 3 })}
            {item('settings', 'Settings', <IconSettings />)}
          </SidebarSection>
        </Sidebar>
      </div>
    </Demo>
  );
}

function PanelsCard() {
  const [page, setPage] = useState(1);
  return (
    <Demo title="Tabs with panels · compact pagination">
      <div style={stack(18)}>
        <Tabs
          label="Library"
          defaultValue="charts"
          items={[
            { value: 'charts', label: 'Charts', count: 12 },
            { value: 'tables', label: 'Tables', count: 3 },
            { value: 'archived', label: 'Archived', disabled: true },
          ]}
        >
          <TabPanel value="charts">
            <p style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--q-text-2)' }}>
              Twelve saved charts. Arrow keys move between tabs; Home and End jump to the ends;
              disabled tabs are skipped.
            </p>
          </TabPanel>
          <TabPanel value="tables">
            <p style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--q-text-2)' }}>
              Three saved tables. Each panel is labelled by its tab.
            </p>
          </TabPanel>
        </Tabs>
        <div style={stack(10)}>
          <Label>Compact</Label>
          <Pagination variant="compact" page={page} pageCount={24} onChange={setPage} />
        </div>
        <div style={stack(10)}>
          <Label>Breadcrumbs · live</Label>
          <Breadcrumbs
            items={[{ label: 'Analytics', href: '#navigation' }, { label: 'Overview' }]}
            trailing={
              <Badge tone="live" size="sm">
                LIVE
              </Badge>
            }
          />
        </div>
      </div>
    </Demo>
  );
}

export function NavigationSection() {
  const [commandOpen, setCommandOpen] = useState(false);
  useHotkey('mod+k', () => setCommandOpen((o) => !o));
  return (
    <Section
      id="navigation"
      eyebrow="08 · Components"
      title="Navigation"
      lead="Ink marks where you are. Tabs switch views of the same data; pills filter a collection; the sidebar moves between dashboards."
    >
      <div style={stack(16)}>
        <div style={row}>
          <Cell flex="1.3 1 420px">
            <TabsPillsCard />
          </Cell>
          <Cell flex="1 1 260px">
            <SidebarCard />
          </Cell>
          <Cell flex="1 1 240px">
            <MenuCard />
          </Cell>
        </div>
        <div style={row}>
          <Cell flex="1.2 1 360px">
            <CommandCard open={commandOpen} setOpen={setCommandOpen} />
          </Cell>
          <Cell flex="0.8 1 280px">
            <AppSidebarCard onSearch={() => setCommandOpen(true)} />
          </Cell>
          <Cell flex="1 1 300px">
            <PanelsCard />
          </Cell>
        </div>
      </div>
    </Section>
  );
}
