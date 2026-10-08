import type { CSSProperties, ReactNode } from 'react';

/** A design-system section: mono eyebrow, display title, lead paragraph, then content. */
export function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section id={id} className="g-section">
      <div className="g-eyebrow">{eyebrow}</div>
      <h2 className="g-title">{title}</h2>
      {lead && <p className="g-lead">{lead}</p>}
      <div className="g-section-body">{children}</div>
    </section>
  );
}

/** A white card that frames a demo, with an optional mono caption (e.g. the JSX that renders it). */
export function Demo({
  title,
  code,
  aside,
  children,
  className,
  style,
  pad = true,
}: {
  title?: ReactNode;
  code?: string;
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  pad?: boolean;
}) {
  return (
    <div className={`g-demo ${className ?? ''}`} style={style}>
      {(title || code || aside) && (
        <div className="g-demo-head">
          {title && <span className="g-demo-title">{title}</span>}
          {code && <code className="g-demo-code">{code}</code>}
          {aside && <span className="g-demo-aside">{aside}</span>}
        </div>
      )}
      <div className={pad ? 'g-demo-body' : undefined}>{children}</div>
    </div>
  );
}

/** Small mono label used above groups of examples. */
export function Label({ children }: { children: ReactNode }) {
  return <div className="g-label">{children}</div>;
}
