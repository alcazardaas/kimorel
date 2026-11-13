import { BufferAttribute, Color, Mesh, MeshStandardMaterial } from 'three';
import type { Object3D } from 'three';
import { muscleRegionDefinition } from '@kimorel/core';
import type { Exercise } from '@kimorel/core';

const originalMaterials = new WeakMap<
  MeshStandardMaterial,
  { color: Color; vertexColors: boolean }
>();

/** Colors belong to bind-pose vertices, so ordinary skinning carries them with the body. */
export function applyMuscleHighlights(
  root: Object3D,
  muscles: Exercise['muscles'],
  enabled: boolean,
) {
  const primary = new Set(muscles.primary);
  const secondary = new Set(muscles.secondary);
  const colors = new Map<number, Color>();
  for (const region of Object.values(muscleRegionDefinition.regions)) {
    const level = region.muscles.some((id) =>
      primary.has(id as Exercise['muscles']['primary'][number]),
    )
      ? 'primary'
      : region.muscles.some((id) =>
            secondary.has(id as Exercise['muscles']['secondary'][number]),
          )
        ? 'secondary'
        : 'none';
    if (level !== 'none')
      colors.set(
        region.code,
        new Color(level === 'primary' ? '#ff5538' : '#f2b77b'),
      );
  }
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const regions = object.geometry.getAttribute('_muscle_region');
    if (!regions) return; // Equipment and third-party meshes without our mapping stay untouched.
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials)
      if (
        material instanceof MeshStandardMaterial &&
        !originalMaterials.has(material)
      )
        originalMaterials.set(material, {
          color: material.color.clone(),
          vertexColors: material.vertexColors,
        });
    const skinMaterial = materials.find(
      (material) => material instanceof MeshStandardMaterial,
    );
    const neutral =
      skinMaterial instanceof MeshStandardMaterial
        ? originalMaterials.get(skinMaterial)!.color
        : new Color('#7b9590');
    const attribute =
      object.geometry.getAttribute('color') ??
      new BufferAttribute(new Float32Array(regions.count * 3), 3);
    const values = attribute.array as Float32Array;
    for (let i = 0; i < regions.count; i++)
      (enabled ? (colors.get(regions.getX(i)) ?? neutral) : neutral).toArray(
        values,
        i * 3,
      );
    object.geometry.setAttribute('color', attribute);
    attribute.needsUpdate = true;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.vertexColors =
        enabled || originalMaterials.get(material)!.vertexColors;
      material.color.copy(
        enabled ? new Color('#ffffff') : originalMaterials.get(material)!.color,
      );
      material.needsUpdate = true;
    }
  });
}
