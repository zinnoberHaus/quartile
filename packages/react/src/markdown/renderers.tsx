import {
  Children,
  type ComponentPropsWithoutRef,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { DEFAULT_LANGUAGES } from '../lang/document';
import { QuartileBlock, type QuartileBlockProps } from './QuartileBlock';
import { useQuartileDocument } from './QuartileDocument';

/** The fence language in a code element's class (`language-quartile`, `lang-quartile`). */
export function codeLanguage(className: string | undefined): string | undefined {
  const m = /(?:^|\s)(?:language|lang)-([\w-]+)/.exec(className ?? '');
  return m?.[1]?.toLowerCase();
}

/** True when `className` marks a Quartile fence (`language-quartile` by default). */
export function isQuartileCode(
  className: string | undefined,
  languages: readonly string[] = DEFAULT_LANGUAGES,
): boolean {
  const lang = codeLanguage(className);
  return !!lang && languages.some((l) => l.toLowerCase() === lang);
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

type BlockOptions = Omit<QuartileBlockProps, 'source'>;

/**
 * A `pre` replacement for Markdown renderers that pass rendered children, such as
 * react-markdown: `components={{ pre: QuartilePre }}`. Other code blocks render unchanged.
 */
export function QuartilePre({
  children,
  node: _node,
  ...rest
}: ComponentPropsWithoutRef<'pre'> & { node?: unknown }) {
  const doc = useQuartileDocument();
  const languages = doc?.languages ?? DEFAULT_LANGUAGES;
  const only = Children.toArray(children);
  const code = only.length === 1 && isValidElement(only[0]) ? (only[0] as ReactElement) : null;
  const className = (code?.props as { className?: string } | undefined)?.className;
  if (code && isQuartileCode(className, languages)) {
    const source = textOf((code.props as { children?: ReactNode }).children);
    // A fence the Markdown already closes is complete, even while the rest still streams.
    return <QuartileBlock source={source} streaming={doc?.isClosed(source) ? false : undefined} />;
  }
  return <pre {...rest}>{children}</pre>;
}

/**
 * A `code` replacement for renderers that only let you override code elements. Inline code and
 * other languages render as plain `code`. Place it where a block-level element is allowed.
 */
export function QuartileCode({
  className,
  children,
  node: _node,
  ...rest
}: ComponentPropsWithoutRef<'code'> & { node?: unknown }) {
  const doc = useQuartileDocument();
  if (isQuartileCode(className, doc?.languages ?? DEFAULT_LANGUAGES)) {
    const source = textOf(children);
    return <QuartileBlock source={source} streaming={doc?.isClosed(source) ? false : undefined} />;
  }
  return (
    <code className={className} {...rest}>
      {children}
    </code>
  );
}

/** react-markdown style `components` with Quartile fences rendered as charts. */
export function quartileComponents(options: BlockOptions = {}) {
  return {
    pre: function QuartileComponentsPre(
      props: ComponentPropsWithoutRef<'pre'> & { node?: unknown },
    ) {
      const doc = useQuartileDocument();
      const only = Children.toArray(props.children);
      const code = only.length === 1 && isValidElement(only[0]) ? (only[0] as ReactElement) : null;
      const className = (code?.props as { className?: string } | undefined)?.className;
      if (code && isQuartileCode(className, doc?.languages ?? DEFAULT_LANGUAGES)) {
        const source = textOf((code.props as { children?: ReactNode }).children);
        return (
          <QuartileBlock
            {...options}
            source={source}
            streaming={options.streaming ?? (doc?.isClosed(source) ? false : undefined)}
          />
        );
      }
      return <QuartilePre {...props} />;
    },
  };
}

/** Props Streamdown passes to a custom renderer (`plugins.renderers`). */
export interface FenceRendererProps {
  code: string;
  isIncomplete: boolean;
  language: string;
  meta?: string;
}

/**
 * A Streamdown custom renderer: `<Streamdown plugins={{ renderers: [quartileRenderer()] }}>`.
 * While the fence is still streaming, the block draws what is complete and waits for the rest.
 */
export function quartileRenderer(options: BlockOptions & { languages?: readonly string[] } = {}) {
  const { languages = DEFAULT_LANGUAGES, ...block } = options;
  function QuartileFence({ code, isIncomplete }: FenceRendererProps) {
    return <QuartileBlock {...block} source={code} streaming={isIncomplete} />;
  }
  return { language: [...languages], component: QuartileFence };
}
