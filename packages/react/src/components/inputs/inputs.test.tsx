import { act, fireEvent, render, screen } from '@testing-library/react';
import { SplitButton } from '../button/SplitButton';
import { Checkbox } from './checkbox/Checkbox';
import { Combobox } from './combobox/Combobox';
import { Calendar } from './date/Calendar';
import { DateRangePicker } from './date/DateRangePicker';
import { SegmentedControl } from './segmented-control/SegmentedControl';
import { Select } from './select/Select';
import { RangeSlider } from './slider/RangeSlider';
import { Switch } from './switch/Switch';
import { NumberField } from './text-field/NumberField';
import { TextField } from './text-field/TextField';

const metrics = [
  { value: 'net', label: 'Net revenue', description: 'sum · USD', group: 'Revenue' },
  { value: 'gross', label: 'Gross revenue', group: 'Revenue' },
  { value: 'ltv', label: 'Lifetime value', group: 'Customers', disabled: true },
  { value: 'orders', label: 'Orders', group: 'Customers' },
];

describe('Select', () => {
  it('opens with the keyboard, skips disabled options and picks with Enter', () => {
    const onChange = vi.fn();
    render(<Select label="Metric" options={metrics} defaultValue="net" onChange={onChange} />);
    const trigger = screen.getByRole('combobox', { name: 'Metric' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const active = trigger.getAttribute('aria-activedescendant');
    expect(document.getElementById(active ?? '')?.textContent).toContain('Orders');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('orders', metrics[3]);
    expect(trigger.textContent).toContain('Orders');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('jumps by type-ahead and closes on Escape', () => {
    render(<Select aria-label="Metric" options={metrics} defaultValue="net" />);
    const trigger = screen.getByRole('combobox', { name: 'Metric' });
    fireEvent.keyDown(trigger, { key: 'g' });
    const active = trigger.getAttribute('aria-activedescendant');
    expect(document.getElementById(active ?? '')?.textContent).toContain('Gross revenue');
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.textContent).toContain('Net revenue');
  });
});

describe('SegmentedControl', () => {
  it('is a radio group where arrows move and select', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Granularity"
        options={['Day', 'Week', 'Month']}
        defaultValue="Week"
        onChange={onChange}
      />,
    );
    const week = screen.getByRole('radio', { name: 'Week' });
    expect(week.getAttribute('aria-checked')).toBe('true');
    expect(week.tabIndex).toBe(0);
    week.focus();
    fireEvent.keyDown(week, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('Month');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Month' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('Day');
    expect(document.activeElement?.textContent).toBe('Day');
  });
});

describe('Combobox', () => {
  const regions = [
    { value: 'na', label: 'North America', meta: '$179K' },
    { value: 'eu', label: 'Europe' },
    { value: 'ap', label: 'Asia Pacific' },
    { value: 'me', label: 'Middle East & Africa' },
  ];

  it('filters, toggles with Enter and removes the last chip with Backspace', () => {
    const onChange = vi.fn();
    render(
      <Combobox
        multiple
        aria-label="Regions"
        options={regions}
        defaultValue={['na']}
        onChange={onChange}
      />,
    );
    const input = screen.getByRole('combobox', { name: 'Regions' });
    fireEvent.change(input, { target: { value: 'as' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Asia Pacific',
      'Middle East & Africa',
    ]);
    expect(screen.getByText('2 of 4')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(['na', 'ap']);
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).toHaveBeenLastCalledWith(['na']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove North America' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('single mode shows the chosen label', () => {
    render(<Combobox aria-label="Region" options={regions} defaultValue="eu" />);
    const input = screen.getByRole('combobox', { name: 'Region' }) as HTMLInputElement;
    expect(input.value).toBe('Europe');
    fireEvent.change(input, { target: { value: 'nor' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('North America');
  });
});

describe('RangeSlider', () => {
  it('moves each thumb with the keyboard and keeps them ordered', () => {
    const onChange = vi.fn();
    render(
      <RangeSlider
        label="Order value"
        min={0}
        max={360}
        step={10}
        defaultValue={[40, 180]}
        onChange={onChange}
        distribution={[1, 2, 3, 4, 5, 6]}
        caption={(r) => `${r[0]}–${r[1]}`}
      />,
    );
    const lo = screen.getByRole('slider', { name: 'Minimum' });
    const hi = screen.getByRole('slider', { name: 'Maximum' });
    fireEvent.keyDown(lo, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith([50, 180]);
    fireEvent.keyDown(hi, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith([50, 50]);
    expect(hi.getAttribute('aria-valuemin')).toBe('50');
    expect(screen.getByText('50–50')).toBeTruthy();
    expect(document.querySelectorAll('.q-range-bar')).toHaveLength(6);
  });
});

describe('Calendar', () => {
  it('selects a range with two clicks in either order', () => {
    const onChange = vi.fn();
    render(
      <Calendar
        defaultMonth={new Date(2026, 8, 1)}
        onChange={onChange}
        today={new Date(2026, 9, 6)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /September 20, 2026/ }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /September 7, 2026/ }));
    expect(onChange).toHaveBeenCalledWith({
      start: new Date(2026, 8, 7),
      end: new Date(2026, 8, 20),
    });
  });

  it('moves focus with arrows and pages months', () => {
    render(<Calendar defaultMonth={new Date(2026, 8, 1)} today={new Date(2026, 9, 6)} />);
    const first = screen.getByRole('button', { name: /September 1, 2026/ });
    expect(first.tabIndex).toBe(0);
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('aria-label')).toContain('September 8, 2026');
    fireEvent.keyDown(document.activeElement as Element, { key: 'PageDown' });
    expect(screen.getByText('October 2026')).toBeTruthy();
    expect(document.activeElement?.getAttribute('aria-label')).toContain('October 8, 2026');
  });
});

describe('DateRangePicker', () => {
  it('shows the range and day count, and applies a preset', () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker
        aria-label="Date range"
        defaultValue={{ start: new Date(2026, 8, 7), end: new Date(2026, 9, 6) }}
        today={new Date(2026, 9, 6)}
        onChange={onChange}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Date range' });
    expect(trigger.textContent).toContain('Sep 7 – Oct 6, 2026');
    expect(trigger.textContent).toContain('30 days');
    act(() => {
      fireEvent.click(trigger);
    });
    expect(screen.getByRole('button', { name: 'Last 30 days' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(onChange).toHaveBeenCalledWith({
      start: new Date(2026, 8, 30),
      end: new Date(2026, 9, 6),
    });
    expect(trigger.textContent).toContain('7 days');
  });
});

describe('Fields and toggles', () => {
  it('TextField links label, hint and error', () => {
    render(
      <TextField label="Target" hint="Positive only" error="Target must be a positive number." />,
    );
    const input = screen.getByLabelText('Target');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = document.getElementById(input.getAttribute('aria-describedby') ?? '');
    expect(described?.textContent).toBe('Target must be a positive number.');
  });

  it('NumberField formats at rest, steps with arrows and clamps on blur', () => {
    const onChange = vi.fn();
    render(
      <NumberField
        label="Amount"
        defaultValue={1500}
        fractionDigits={2}
        min={0}
        onChange={onChange}
      />,
    );
    const input = screen.getByRole('spinbutton', { name: 'Amount' }) as HTMLInputElement;
    expect(input.value).toBe('1,500.00');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith(1501);
    fireEvent.change(input, { target: { value: '-20' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(0);
    expect(input.value).toBe('0.00');
  });

  it('Checkbox reflects indeterminate on the native input; Switch toggles', () => {
    const onSwitch = vi.fn();
    render(
      <>
        <Checkbox label="All" indeterminate />
        <Switch label="Compare" onChange={onSwitch} />
      </>,
    );
    expect((screen.getByLabelText('All') as HTMLInputElement).indeterminate).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: 'Compare' }));
    expect(onSwitch).toHaveBeenCalledWith(true);
  });

  it('SplitButton runs the main action and opens a menu of items', () => {
    const main = vi.fn();
    const csv = vi.fn();
    render(
      <SplitButton
        label="Export PDF"
        onClick={main}
        menuLabel="More formats"
        menu={[{ label: 'Export CSV', onSelect: csv }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(main).toHaveBeenCalled();
    const trigger = screen.getByRole('button', { name: 'More formats' });
    act(() => {
      fireEvent.click(trigger);
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export CSV' }));
    expect(csv).toHaveBeenCalled();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});
