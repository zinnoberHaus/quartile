import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { initials } from './display/avatar/Avatar';
import { describeDelta } from './display/delta/Delta';
import { meterTone } from './feedback/progress/Progress';
import { createToastStore } from './feedback/toast/store';
import { Toaster } from './feedback/toast/Toast';
import { Menu } from './navigation/menu/Menu';
import { Pagination } from './navigation/pagination/Pagination';
import { TabPanel, Tabs } from './navigation/tabs/Tabs';
import { ConfirmDialog, Dialog } from './overlays/dialog/Dialog';

const items = [
  { value: 'overview', label: 'Overview' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'retention', label: 'Retention', disabled: true },
  { value: 'funnels', label: 'Funnels' },
];

describe('Tabs', () => {
  it('selects with arrow keys, skipping disabled tabs, and shows the matching panel', () => {
    const onChange = vi.fn();
    render(
      <Tabs items={items} defaultValue="revenue" onChange={onChange} label="Views">
        <TabPanel value="revenue">Revenue panel</TabPanel>
        <TabPanel value="funnels">Funnels panel</TabPanel>
      </Tabs>,
    );
    const revenue = screen.getByRole('tab', { name: 'Revenue' });
    expect(revenue.getAttribute('aria-selected')).toBe('true');
    expect(revenue.getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('tabpanel')?.textContent).toContain('Revenue panel');
    revenue.focus();
    fireEvent.keyDown(revenue, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('funnels');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Funnels' }));
    expect(screen.getByRole('tabpanel')?.textContent).toContain('Funnels panel');
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('overview');
  });
});

describe('Pagination', () => {
  it('marks the current page and disables Previous on the first page', () => {
    function Controlled() {
      const [page, setPage] = useState(1);
      return <Pagination page={page} pageCount={24} onChange={setPage} />;
    }
    render(<Controlled />);
    expect(
      (screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Page 1' }).getAttribute('aria-current')).toBe(
      'page',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBe(
      'page',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Page 24' }));
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe('Menu', () => {
  it('opens from the keyboard, moves with arrows, selects with Enter and returns focus', async () => {
    const onDuplicate = vi.fn();
    const onRemove = vi.fn();
    render(
      <Menu
        label="Chart actions"
        trigger={<button type="button">Actions</button>}
        items={[
          { label: 'Duplicate chart', shortcut: '⌘D', onSelect: onDuplicate },
          { label: 'Download PNG', disabled: true },
          'separator',
          { label: 'Remove from dashboard', danger: true, onSelect: onRemove },
        ]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Actions' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    trigger.focus();
    await act(async () => {
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu = await screen.findByRole('menu', { name: 'Chart actions' });
    expect(document.activeElement?.textContent).toContain('Duplicate chart');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    // Disabled item and separator are skipped.
    expect(document.activeElement?.textContent).toContain('Remove from dashboard');
    fireEvent.keyDown(menu, { key: 'Enter' });
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape', async () => {
    render(
      <Menu
        trigger={<button type="button">Actions</button>}
        items={[{ label: 'View as table' }]}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    });
    const menu = await screen.findByRole('menu');
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('Dialog', () => {
  it('is labelled, closes on Escape and locks page scroll while open', async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <Dialog open onOpenChange={onOpenChange} title="Rename" description="Pick a name">
        <input aria-label="Name" />
      </Dialog>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Rename' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const descId = dialog.getAttribute('aria-describedby');
    expect(descId && document.getElementById(descId)?.textContent).toBe('Pick a name');
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }));
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(
      <Dialog open={false} onOpenChange={onOpenChange} title="Rename">
        <input aria-label="Name" />
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('ConfirmDialog focuses Cancel and waits for an async confirm before closing', async () => {
    let resolve: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        destructive
        title="Delete “Q3 revenue”?"
        confirmLabel="Delete dashboard"
        onConfirm={onConfirm}
      />,
    );
    await screen.findByRole('alertdialog');
    expect(document.activeElement?.textContent).toContain('Cancel');
    fireEvent.click(screen.getByRole('button', { name: 'Delete dashboard' }));
    expect(onConfirm).toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    await act(async () => resolve());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('Toaster', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders toasts in a polite region and auto-dismisses, pausing on hover', async () => {
    const store = createToastStore();
    render(<Toaster store={store} />);
    await act(async () => {
      store.show({ title: 'Report exported', duration: 1000 });
    });
    const region = screen.getByRole('region', { name: 'Notifications' });
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region?.textContent).toContain('Report exported');
    fireEvent.pointerEnter(region);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(store.getSnapshot()[0].open).toBe(true);
    fireEvent.pointerLeave(region);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(store.getSnapshot()[0].open).toBe(false);
  });
});

describe('display helpers', () => {
  it('describeDelta rounds before choosing sign and tone', () => {
    expect(describeDelta(0.124)).toMatchObject({
      text: '+12.4%',
      direction: 'up',
      tone: 'positive',
    });
    expect(describeDelta(-0.031)).toMatchObject({ text: '−3.1%', tone: 'negative' });
    expect(describeDelta(0.00001)).toMatchObject({
      text: '±0.0%',
      direction: 'flat',
      tone: 'neutral',
    });
    expect(describeDelta(-0.12, 'percent', { invert: true }).tone).toBe('positive');
    expect(describeDelta(0.21, 'pt').text).toBe('+0.21 pt');
  });
  it('meterTone follows thresholds', () => {
    expect(meterTone(0.5)).toBe('signal');
    expect(meterTone(0.86)).toBe('warning');
    expect(meterTone(0.97)).toBe('negative');
    expect(meterTone(0.97, false)).toBe('signal');
  });
  it('initials takes the first and last word', () => {
    expect(initials('Jamie Moss')).toBe('JM');
    expect(initials('ada')).toBe('A');
    expect(initials('Mary Ann de Souza')).toBe('MS');
    expect(initials('  ')).toBe('?');
  });
});
