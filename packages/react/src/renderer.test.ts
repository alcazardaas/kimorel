import { afterEach, expect, it, vi } from 'vitest';
import { WebGLRenderer } from 'three';
import { createViewerRenderer } from './renderer.js';
vi.mock('three', () => ({ WebGLRenderer: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
it('forwards renderer options and returns the successful renderer without errors', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const options = { antialias: true, alpha: true };
  const renderer = createViewerRenderer(options);
  expect(WebGLRenderer).toHaveBeenCalledWith(options);
  expect(renderer).toBeInstanceOf(WebGLRenderer);
  expect(log).not.toHaveBeenCalled();
});
it('logs and rethrows the original renderer error including stack and cause', () => {
  const error = new Error(
    'Context creation failed: requested attributes unavailable',
    { cause: new Error('driver detail') },
  );
  vi.mocked(WebGLRenderer).mockImplementationOnce(function () {
    throw error;
  });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(() => createViewerRenderer({})).toThrow(error);
  expect(log).toHaveBeenCalledWith(
    '[Kimorel viewer] renderer-initialization',
    error,
    {},
  );
  expect(log.mock.calls[0]?.[1]).toBe(error);
  expect(error.stack).toContain('renderer.test.ts');
});
