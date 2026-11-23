import { BufferAttribute, Color, MeshStandardMaterial } from 'three';
import type { SkinnedMesh } from 'three';
import type { LoadedMask } from './load';
export const palette: Record<string, string> = {
  'left-deltoid': '#ef6c00',
  'left-biceps-brachii': '#00838f',
  'right-deltoid': '#9c27b0',
  'right-biceps-brachii': '#1565c0',
};
/** One owned geometry; color support stays indexed in bind space during skin/morph playback. */
export function applyMasks(
  mesh: SkinnedMesh,
  masks: LoadedMask[],
  selection: string,
) {
  const count = mesh.geometry.attributes.position!.count;
  let attribute = mesh.geometry.getAttribute('color');
  if (!attribute) {
    attribute = new BufferAttribute(new Float32Array(count * 3), 3);
    mesh.geometry.setAttribute('color', attribute);
  }
  if (
    !(attribute instanceof BufferAttribute) ||
    !(attribute.array instanceof Float32Array) ||
    attribute.itemSize !== 3 ||
    attribute.count !== count
  )
    throw new Error('Unsupported owned color attribute');
  const values = attribute.array;
  const neutral = new Color('#aab8bd'),
    color = new Color();
  for (let vertex = 0; vertex < count; vertex++) {
    let strongest = 0,
      winner: LoadedMask | undefined;
    for (const mask of masks) {
      if (selection !== 'all' && selection !== mask.id) continue;
      if (mask.weights.length !== count)
        throw new Error('Mask color domain mismatch');
      const weight = mask.weights[vertex]!;
      if (!Number.isFinite(weight) || weight < 0 || weight > 1)
        throw new Error('Invalid mask color weight');
      if (weight > strongest) {
        strongest = weight;
        winner = mask;
      }
    }
    color.copy(neutral);
    if (winner) color.lerp(new Color(palette[winner.id]!), strongest);
    color.toArray(values, vertex * 3);
  }
  attribute.needsUpdate = true;
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  for (const material of materials) {
    if (!(material instanceof MeshStandardMaterial))
      throw new Error('Unsupported draft material');
    material.color.set('#ffffff');
    material.vertexColors = true;
    material.needsUpdate = true;
  }
  return values;
}
