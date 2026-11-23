/** Private development loader; hashes prove identity, never anatomical approval. */
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SkinnedMesh, Matrix4 } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { muscleCatalogV2Schema } from '../../../packages/schemas/src/muscles-v2';
import {
  parseBoundSparseMask,
  materializeSparseMask,
} from '../../../packages/schemas/src/muscle-masks-v2';
import { disposeScene } from '../../../packages/react/src/playback';

export const frozenHash =
  '61e83ec439d3e04deeec2cd5da771181044bfaae3e75dcea75ec3b8342c9c587';
export const catalogUrl = '/__draft/catalog.json';
export type LoadedMask = { id: string; label: string; weights: Float32Array };
export type Bundle = { gltf: GLTF; mesh: SkinnedMesh; masks: LoadedMask[] };
export async function verifyHash(bytes: ArrayBuffer, expected: string) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const actual = Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
  if (actual !== expected) throw new Error('Draft asset hash mismatch');
}
async function bytes(url: string, signal: AbortSignal) {
  const response = await globalThis.fetch(url, { signal, cache: 'no-store' });
  if (!response.ok)
    throw new Error(`Draft asset request failed (${response.status})`);
  return response.arrayBuffer();
}
export function bodyMesh(gltf: GLTF) {
  let mesh: SkinnedMesh | undefined;
  gltf.scene.traverse((o) => {
    if (!(o instanceof SkinnedMesh)) return;
    if (mesh) throw new Error('Expected exactly one draft body mesh');
    mesh = o;
  });
  if (!mesh || mesh.geometry.attributes.position?.count !== 26939)
    throw new Error('Draft vertex domain mismatch');
  gltf.scene.updateMatrixWorld(true);
  if (!mesh.matrixWorld.equals(new Matrix4()))
    throw new Error('Unexpected mesh transform');
  return mesh;
}
export async function loadBundle(signal: AbortSignal): Promise<Bundle> {
  const catalogBytes = await bytes(catalogUrl, signal);
  await verifyHash(
    catalogBytes,
    '0a671162550948a965710a75f755f753db59cb459c210210f97f2e3d205bb3d9',
  );
  const catalog = muscleCatalogV2Schema.parse(
    JSON.parse(new globalThis.TextDecoder().decode(catalogBytes)),
  );
  if (
    catalog.character.sha256 !== frozenHash ||
    catalog.identities.length !== 4 ||
    catalog.surfaceMappings.length !== 4 ||
    catalog.exerciseRoles.length !== 0
  )
    throw new Error('Unexpected draft catalog contract');
  const body = await bytes('/__draft/character.glb', signal);
  await verifyHash(body, frozenHash);
  const masks: LoadedMask[] = await Promise.all(
    catalog.surfaceMappings.map(async (mapping) => {
      if (
        mapping.meshIndex !== 0 ||
        mapping.primitiveIndex !== 0 ||
        mapping.vertexCount !== 26939 ||
        ![
          'left-deltoid',
          'right-deltoid',
          'left-biceps-brachii',
          'right-biceps-brachii',
        ].includes(mapping.id)
      )
        throw new Error('Draft vertex domain or identity mismatch');
      const data = await bytes(`/__draft/${mapping.id}.json`, signal);
      await verifyHash(data, mapping.mask.sha256);
      const payload = parseBoundSparseMask(
        JSON.parse(new globalThis.TextDecoder().decode(data)),
        mapping,
      );
      return {
        id: mapping.id,
        label: catalog.identities.find((i) => i.id === mapping.identityIds[0])!
          .label,
        weights: materializeSparseMask(payload),
      };
    }),
  );
  if (signal.aborted)
    throw new globalThis.DOMException('Aborted', 'AbortError');
  const gltf = await new GLTFLoader().parseAsync(body, '');
  try {
    if (signal.aborted)
      throw new globalThis.DOMException('Aborted', 'AbortError');
    return { gltf, mesh: bodyMesh(gltf), masks };
  } catch (error) {
    disposeScene(gltf.scene);
    throw error;
  }
}
