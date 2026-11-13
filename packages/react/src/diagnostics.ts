import type { ErrorInfo } from 'react';

/** Keep the original Error object so DevTools and onError retain its stack/cause. */
export function reportViewerError(
  error: Error,
  phase: 'renderer-initialization' | 'scene-render' | 'asset-load',
  details: { url?: string; componentStack?: ErrorInfo['componentStack'] } = {},
) {
  console.error(`[Kimorel viewer] ${phase}`, error, details);
}
