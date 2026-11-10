/** A problem or note found while reading a Quartile block. Lines are 1-based within the block. */
export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** 1-based line in the block body. Omitted when the problem has no single source line. */
  line?: number;
  /** A short suggestion, e.g. the columns that exist. */
  hint?: string;
}

export function error(message: string, line?: number, hint?: string): Diagnostic {
  return { severity: 'error', message, line, hint };
}

export function warning(message: string, line?: number, hint?: string): Diagnostic {
  return { severity: 'warning', message, line, hint };
}

export function info(message: string, line?: number, hint?: string): Diagnostic {
  return { severity: 'info', message, line, hint };
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}
