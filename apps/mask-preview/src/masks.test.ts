import { afterEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { Vector3, BufferAttribute } from 'three';
import { loadBundle, verifyHash, bodyMesh } from './load';
import { applyMasks } from './masks';
import {
  createPlayback,
  disposeScene,
} from '../../../packages/react/src/playback';

const root = new URL('../../../', import.meta.url);
const catalog = JSON.parse(
  await readFile(
    new URL('pipeline/character-v2/muscles-upper-arm-draft/catalog.json', root),
    'utf8',
  ),
);
const fileMap: Record<string, string> = {
  '/__draft/catalog.json':
    'pipeline/character-v2/muscles-upper-arm-draft/catalog.json',
  '/__draft/character.glb': catalog.character.file,
  ...Object.fromEntries(
    catalog.surfaceMappings.map((m: { id: string; mask: { file: string } }) => [
      `/__draft/${m.id}.json`,
      m.mask.file,
    ]),
  ),
};
function mockFiles(change?: (url: string, data: Uint8Array) => Uint8Array) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: { signal: AbortSignal }) => {
      if (options.signal.aborted)
        throw new globalThis.DOMException('Aborted', 'AbortError');
      const data = Uint8Array.from(
        await readFile(new URL(fileMap[url]!, root)),
      );
      return new Response(
        (change ? change(url, data) : data).buffer as ArrayBuffer,
      );
    }),
  );
}
afterEach(() => vi.unstubAllGlobals());
it('loads the exact six-file draft with four dense masks and real GLB', async () => {
  mockFiles();
  const bundle = await loadBundle(new AbortController().signal);
  try {
    expect(bundle.mesh.geometry.attributes.position!.count).toBe(26939);
    expect(bundle.masks).toHaveLength(4);
    expect(bundle.gltf.animations).toHaveLength(7);
    expect(fetch).toHaveBeenCalledTimes(6);
  } finally {
    disposeScene(bundle.gltf.scene);
  }
});
it.each([
  '/__draft/catalog.json',
  '/__draft/character.glb',
  '/__draft/left-deltoid.json',
])('rejects changed bytes at %s before rendering', async (target) => {
  mockFiles((url, data) => {
    if (url === target) data[0] = data[0]! ^ 1;
    return data;
  });
  await expect(loadBundle(new AbortController().signal)).rejects.toThrow(
    /hash/,
  );
});
it('rejects failed requests and cancellation without creating a scene', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 404 })),
  );
  await expect(loadBundle(new AbortController().signal)).rejects.toThrow(
    /request failed/,
  );
  mockFiles();
  const controller = new AbortController();
  controller.abort();
  await expect(loadBundle(controller.signal)).rejects.toThrow(/Aborted/);
});
it('rejects a wrong loaded vertex domain independently of payload bindings', async () => {
  mockFiles();
  const bundle = await loadBundle(new AbortController().signal);
  try {
    bundle.mesh.geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(3), 3),
    );
    expect(() => bodyMesh(bundle.gltf)).toThrow(/domain/);
  } finally {
    disposeScene(bundle.gltf.scene);
  }
});
it('colors selected support only, restores neutral and resolves overlap deterministically', async () => {
  mockFiles();
  const b = await loadBundle(new AbortController().signal);
  try {
    const neutral = applyMasks(b.mesh, b.masks, 'none').slice(),
      single = applyMasks(b.mesh, b.masks, b.masks[0]!.id).slice();
    let changed = 0;
    for (let i = 0; i < 26939; i++) {
      const differs = [0, 1, 2].some(
        (c) => neutral[i * 3 + c] !== single[i * 3 + c],
      );
      if (differs) {
        changed++;
        expect(b.masks[0]!.weights[i]).toBeGreaterThan(0);
      }
    }
    expect(changed).toBeGreaterThan(400);
    expect(applyMasks(b.mesh, b.masks, 'none')).toEqual(neutral);
    expect(applyMasks(b.mesh, b.masks, 'all')).toEqual(
      applyMasks(b.mesh, b.masks, 'all'),
    );
    const bad = { ...b.masks[0]!, weights: new Float32Array(1) };
    expect(() => applyMasks(b.mesh, [bad], 'all')).toThrow(/domain/);
    const nonfinite = { ...b.masks[0]!, weights: new Float32Array(26939) };
    nonfinite.weights[0] = NaN;
    expect(() => applyMasks(b.mesh, [nonfinite], 'all')).toThrow(/weight/);
  } finally {
    disposeScene(b.gltf.scene);
  }
});
it('actual masked vertices move with bone and corrective morph channels, colors stay indexed and neutral returns', async () => {
  mockFiles();
  const b = await loadBundle(new AbortController().signal),
    playback = createPlayback(
      b.gltf.scene,
      b.gltf.animations,
      'shoulder-elevation',
    );
  try {
    const colors = applyMasks(b.mesh, b.masks, 'all').slice(),
      index = b.masks[0]!.weights.findIndex((w) => w > 0.9);
    playback.seek(0);
    b.mesh.skeleton.update();
    const rest = b.mesh.getVertexPosition(index, new Vector3());
    playback.seek(playback.duration / 2);
    b.mesh.skeleton.update();
    const peak = b.mesh.getVertexPosition(index, new Vector3());
    expect(peak.distanceTo(rest)).toBeGreaterThan(0.02);
    expect(Math.max(...b.mesh.morphTargetInfluences!)).toBeGreaterThan(0.9);
    const influences = b.mesh.morphTargetInfluences!.slice();
    b.mesh.morphTargetInfluences!.fill(0);
    const off = b.mesh.getVertexPosition(index, new Vector3());
    expect(peak.distanceTo(off)).toBeGreaterThan(0.00001);
    b.mesh.morphTargetInfluences!.splice(0, influences.length, ...influences);
    expect(b.mesh.geometry.attributes.color!.array).toEqual(colors);
    playback.seek(playback.duration);
    b.mesh.skeleton.update();
    expect(
      b.mesh.getVertexPosition(index, new Vector3()).distanceTo(rest),
    ).toBeLessThan(0.00001);
    expect(Math.max(...b.mesh.morphTargetInfluences!)).toBe(0);
  } finally {
    playback.dispose();
    disposeScene(b.gltf.scene);
  }
});
it('hash verification fails closed for malformed expected identity', async () => {
  await expect(verifyHash(new ArrayBuffer(0), 'not-a-hash')).rejects.toThrow(
    /hash/,
  );
});

it('reuses one GPU color attribute across mask selections', async () => {
  mockFiles();
  const b = await loadBundle(new AbortController().signal);
  try {
    applyMasks(b.mesh, b.masks, 'all');
    const attribute = b.mesh.geometry.getAttribute('color');
    if (!(attribute instanceof BufferAttribute))
      throw new Error('Expected owned color buffer');
    const version = attribute.version;
    applyMasks(b.mesh, b.masks, 'none');
    expect(b.mesh.geometry.getAttribute('color')).toBe(attribute);
    expect(attribute.version).toBeGreaterThan(version);
    applyMasks(b.mesh, b.masks, 'left-deltoid');
    expect(b.mesh.geometry.getAttribute('color')).toBe(attribute);
  } finally {
    disposeScene(b.gltf.scene);
  }
});
