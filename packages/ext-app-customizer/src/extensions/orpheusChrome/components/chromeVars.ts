import type * as React from 'react';
import { orpheusTokens } from '@orpheussystems/shared-ui/tokens';

function alpha(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Brand tokens as CSS custom properties, so the stylesheet never hard-codes a colour. */
export const chromeVars = {
  '--orpheus-bg': orpheusTokens.bg,
  '--orpheus-bg-elevated': orpheusTokens.bgElevated,
  '--orpheus-text': orpheusTokens.text,
  '--orpheus-text-muted': orpheusTokens.textMuted,
  '--orpheus-border': orpheusTokens.border,
  '--orpheus-amber': orpheusTokens.amber,
  '--orpheus-amber-soft': alpha(orpheusTokens.amber, 0.14),
  '--orpheus-hover': alpha(orpheusTokens.text, 0.06),
  '--orpheus-shadow': alpha(orpheusTokens.bg, 0.6),
  '--orpheus-font': orpheusTokens.fontStack
} as unknown as React.CSSProperties;
