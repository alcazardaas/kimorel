import { WebGLRenderer } from 'three';
import type { WebGLRendererParameters } from 'three';
import { reportViewerError } from './diagnostics.js';

/** R3F owns and disposes the renderer returned by this factory. */
export function createViewerRenderer(defaults: WebGLRendererParameters) {
  try {
    return new WebGLRenderer(defaults);
  } catch (failure) {
    const error =
      failure instanceof Error
        ? failure
        : new Error(String(failure), { cause: failure });
    reportViewerError(error, 'renderer-initialization');
    // R3F configure rejects this same error and forwards it to ViewerBoundary.
    throw error;
  }
}
