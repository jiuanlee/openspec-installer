/**
 * detect/index.ts — Re-exports for the detect layer
 *
 * Consumers import from '@detect' (or '../detect') to get
 * both OS and Claude detection in one place.
 */

export * from './os';
export * from './claude';
