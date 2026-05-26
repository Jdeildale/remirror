// The coffee-tone dark palette. Locked Phase 2a.
// Mirrored in tailwind.config.js — keep both in sync.

export const PALETTE = {
  bg: '#1a1816',
  bgDeep: '#0d0b09',
  surface: '#312d28',
  surfaceBorder: 'rgba(250,247,240,0.07)',
  text: '#faf7f0',
  textMuted: '#b8b1a4',
  textQuiet: '#8a7f70',
  accent: '#5dc4b0',
  purple: '#c89af0',
  green: '#bdd470',
  sand: '#e8b06d',
  unclassified: '#8a7f70',
  idleOutline: '#4a4540',
} as const;

export type PaletteToken = keyof typeof PALETTE;
