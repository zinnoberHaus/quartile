import {
  Children,
  createContext,
  forwardRef,
  type HTMLAttributes,
  isValidElement,
  type ReactNode,
  useContext,
  useState,
} from 'react';
import { cx } from '../../../lib/cx';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'color'> {
  /** Full name: used for the initials, the accessible label and the default color. */
  name: string;
  /** Image URL. Falls back to initials if it fails to load. */
  src?: string;
  /** sm 24 · md 28 · lg 36 px. Inside an `AvatarGroup`, defaults to the group's size. */
  size?: AvatarSize;
  /** Categorical color 1–8; defaults to one derived from the name. */
  color?: number;
}

/** "Jamie Moss" → "JM", "ada" → "A". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

const PALETTE = [1, 2, 3, 5, 4, 6, 7, 8];

/** A stable categorical color index (1–8) for a name. */
export function avatarColor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

const GroupContext = createContext<{ size?: AvatarSize }>({});

/** A person: photo or initials on a tint of a categorical color. */
export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { name, src, size, color, className, style, ...rest },
  ref,
) {
  const group = useContext(GroupContext);
  const [failed, setFailed] = useState(false);
  const index = color ?? avatarColor(name);
  return (
    <span
      ref={ref}
      role="img"
      aria-label={name}
      className={cx('q-avatar', className)}
      data-size={size ?? group.size ?? 'md'}
      style={{ ['--q-avatar-c' as string]: `var(--q-cat-${index})`, ...style }}
      {...rest}
    >
      {src && !failed ? (
        <img src={src} alt="" className="q-avatar-img" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
});

export interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Show at most this many avatars, then a "+N" chip. */
  max?: number;
  size?: AvatarSize;
  children?: ReactNode;
}

/** Overlapping avatars with a "+N" overflow chip. */
export const AvatarGroup = forwardRef<HTMLDivElement, AvatarGroupProps>(function AvatarGroup(
  { max, size = 'md', className, children, ...rest },
  ref,
) {
  const items = Children.toArray(children).filter(isValidElement);
  const shown = max != null && items.length > max ? items.slice(0, max) : items;
  const extra = items.length - shown.length;
  return (
    <GroupContext.Provider value={{ size }}>
      <div ref={ref} role="group" className={cx('q-avatar-group', className)} {...rest}>
        {shown}
        {extra > 0 && (
          <span
            className="q-avatar q-avatar-more"
            data-size={size}
            role="img"
            aria-label={`${extra} more`}
          >
            <span aria-hidden="true">+{extra}</span>
          </span>
        )}
      </div>
    </GroupContext.Provider>
  );
});
