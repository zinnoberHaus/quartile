import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CommandPalette } from './CommandMenu';

it('keeps page position on mount and scrolls only its own list for keyboard navigation', () => {
  const original = HTMLElement.prototype.scrollIntoView;
  const ancestorScroll = vi.fn();
  HTMLElement.prototype.scrollIntoView = ancestorScroll;
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(60);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const index = this.getAttribute('data-index');
    const scrolled = this.closest('[role="listbox"]')?.scrollTop ?? 0;
    const top = index === null ? 900 : 910 + Number(index) * 40 - scrolled;
    const height = index === null ? 60 : 30;
    return {
      x: 0,
      y: top,
      top,
      bottom: top + height,
      left: 0,
      right: 300,
      width: 300,
      height,
      toJSON: () => ({}),
    };
  });
  try {
    render(
      <CommandPalette
        groups={[{ label: 'Actions', items: [{ label: 'First' }, { label: 'Second' }] }]}
      />,
    );
    const list = screen.getByRole('listbox');
    expect(list.scrollTop).toBe(0);
    expect(ancestorScroll).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    expect(list.scrollTop).toBe(24);
    expect(screen.getByRole('option', { name: 'Second' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowUp' });
    expect(list.scrollTop).toBe(6);
    expect(ancestorScroll).not.toHaveBeenCalled();
  } finally {
    cleanup();
    HTMLElement.prototype.scrollIntoView = original;
    vi.restoreAllMocks();
  }
});
