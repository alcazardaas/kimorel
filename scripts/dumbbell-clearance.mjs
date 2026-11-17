import { Matrix4, Vector3 } from 'three';

const segments = [
  [-0.115, -0.065, 0.07],
  [-0.065, 0.065, 0.016],
  [0.065, 0.115, 0.07],
];
/** Exact convex twelve-sided cylinder volumes of our original dumbbell mesh. */
export function createDumbbellChecks(scene, profile) {
  if (!profile.equipmentBodyClearance)
    return {
      sample() {},
      finish() {
        return { equipmentBodyPenetrationMeters: 0 };
      },
    };
  const props = (profile.equipmentHands ?? ['left', 'right']).map((side) => {
    const mesh = scene.getObjectByName(`${side}_hand_dumbbell`);
    if (!mesh?.isMesh) throw new Error('Missing dumbbell clearance geometry');
    const actual = mesh.geometry.attributes.position;
    const expected = [];
    for (const [lo, hi, radius] of segments)
      for (const x of [lo, hi])
        for (let j = 0; j < 12; j++)
          expected.push([
            x,
            radius * Math.cos((j * Math.PI) / 6),
            radius * Math.sin((j * Math.PI) / 6),
          ]);
    if (
      actual.count !== expected.length ||
      expected.some((p, i) =>
        p.some((v, k) => Math.abs(v - actual.getComponent(i, k)) > 1e-6),
      )
    )
      throw new Error('Dumbbell clearance geometry mismatch');
    const patches = [];
    scene.traverse((skin) => {
      if (!skin.isSkinnedMesh) return;
      const points = skin.geometry.attributes.position;
      for (let index = 0; index < points.count; index++) {
        const source = new Vector3().fromBufferAttribute(points, index);
        // Only the loaded hand's grip patch may occupy its own equipment volume.
        if (
          (side === 'left' ? source.x : -source.x) > 0.38 &&
          source.y > 0.78 &&
          source.y < 0.99
        )
          continue;
        patches.push({ skin, index, source });
      }
    });
    return { mesh, patches };
  });
  let maximum = 0;
  return {
    sample() {
      for (const { mesh, patches } of props) {
        const inverse = new Matrix4().copy(mesh.matrixWorld).invert();
        for (const { skin, index, source } of patches) {
          const p = skin
            .applyBoneTransform(index, source.clone())
            .applyMatrix4(skin.matrixWorld)
            .applyMatrix4(inverse);
          for (const [lo, hi, radius] of segments) {
            if (p.x < lo || p.x > hi) continue;
            let depth = Math.min(p.x - lo, hi - p.x);
            for (let j = 0; j < 12; j++) {
              const angle = ((j + 0.5) * Math.PI) / 6;
              depth = Math.min(
                depth,
                radius * Math.cos(Math.PI / 12) -
                  p.y * Math.cos(angle) -
                  p.z * Math.sin(angle),
              );
            }
            maximum = Math.max(maximum, depth);
          }
        }
      }
    },
    finish() {
      if (maximum > 0.015)
        throw new Error(`Body penetrates dumbbell: ${maximum}`);
      return { equipmentBodyPenetrationMeters: maximum };
    },
  };
}
