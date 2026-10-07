import type { ReactNode } from 'react';

export interface CommandItem {
  label: ReactNode;
  icon?: ReactNode;
  /** Display-only hint: ↵, ⌘E. */
  shortcut?: ReactNode;
  /** Extra words that should match the query: synonyms, the action's verb. */
  keywords?: string[];
  /** Text to match when `label` is not a string. */
  textValue?: string;
  disabled?: boolean;
  onSelect?: () => void;
}

export interface CommandGroup {
  label: string;
  items: CommandItem[];
}

function textOf(item: CommandItem) {
  return item.textValue ?? (typeof item.label === 'string' ? item.label : '');
}

/**
 * Keeps items where every word of the query appears in the label, keywords or group label
 * (case-insensitive), preserving order. Groups with no matches are dropped.
 */
export function filterCommandGroups(groups: CommandGroup[], query: string): CommandGroup[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return groups.filter((g) => g.items.length > 0);
  const out: CommandGroup[] = [];
  for (const group of groups) {
    const items = group.items.filter((item) => {
      const hay = [textOf(item), group.label, ...(item.keywords ?? [])].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    if (items.length > 0) out.push({ ...group, items });
  }
  return out;
}
