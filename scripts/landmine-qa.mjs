import { Matrix4, Quaternion, Vector3 } from 'three';
import { triangleDistance } from './barbell-qa.mjs';

const segments = [
  [0, 1.8, 0.012],
  [1.4, 1.45, 0.13],
];
const identity = new Quaternion();
const unitScale = (object) =>
  [...object.scale].every((v) => Math.abs(v - 1) < 1e-6);

export function validateLandmineGeometry(mesh) {
  if (!mesh?.isMesh || mesh.isSkinnedMesh)
    throw new Error('Missing rigid landmine geometry');
  const expected = [],
    indices = [];
  for (const [lo, hi, radius] of segments) {
    const start = expected.length;
    for (const x of [lo, hi])
      for (let j = 0; j < 12; j++)
        expected.push([
          x,
          radius * Math.cos((j * Math.PI) / 6),
          radius * Math.sin((j * Math.PI) / 6),
        ]);
    for (let j = 0; j < 12; j++) {
      const a = start + j,
        b = start + ((j + 1) % 12);
      indices.push(a, b, b + 12, a, b + 12, a + 12);
    }
    for (let j = 1; j < 11; j++) indices.push(start + j + 1, start + j, start);
    for (let j = 1; j < 11; j++)
      indices.push(start + 12, start + 12 + j, start + 12 + j + 1);
  }
  const position = mesh.geometry.attributes.position,
    index = mesh.geometry.index;
  if (
    position.count !== expected.length ||
    expected.some((p, i) =>
      p.some((v, k) => Math.abs(v - position.getComponent(i, k)) > 1e-6),
    )
  )
    throw new Error('Landmine geometry mismatch');
  if (
    !index ||
    index.count !== indices.length ||
    indices.some((v, i) => index.getX(i) !== v)
  )
    throw new Error('Landmine topology mismatch');
  return { vertices: position.count, dimensionsMeters: [1.8, 0.26, 0.26] };
}

/** Fixed pivot, actual distal palm and rotated finite shaft/plate envelopes at every authored frame. */
export function createLandmineChecks(scene, profile) {
  if (!profile.landminePivot)
    return {
      sample() {},
      finish() {
        return {};
      },
    };
  const bar = scene.getObjectByName('landmine'),
    anchor = scene.getObjectByName('equipment_landmine-anchor');
  validateLandmineGeometry(bar);
  if (bar.parent !== scene || anchor?.parent !== scene)
    throw new Error('Landmine needs independent bar and grounded anchor');
  const pivot = new Vector3(...profile.landminePivot),
    anchorPosition = pivot.clone().setY(0);
  const grip = scene.getObjectByName('landmine_distal_grip'),
    hand = scene.getObjectByName('right_hand_landmine_grip');
  if (grip?.parent !== bar || hand?.parent.name !== 'right_hand')
    throw new Error('Missing distal landmine hand grip');
  const skins = [];
  scene.traverse((skin) => {
    if (!skin.isSkinnedMesh) return;
    const position = skin.geometry.attributes.position;
    const source = Array.from({ length: position.count }, (_, i) =>
      new Vector3().fromBufferAttribute(position, i),
    );
    const index = skin.geometry.index,
      triangles = [];
    for (let i = 0; i < index.count; i += 3) {
      const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      const center = ids
        .reduce((sum, j) => sum.add(source[j]), new Vector3())
        .multiplyScalar(1 / 3);
      triangles.push({
        ids,
        palm: center.x < -0.38 && center.y > 0.78 && center.y < 0.99,
      });
    }
    skins.push({ skin, source, triangles });
  });
  let gripDrift = 0,
    shaftClearance = Infinity,
    plateClearance = Infinity,
    minimumGround = Infinity;
  return {
    sample(progress) {
      if (
        ![
          ...bar.position,
          ...bar.quaternion,
          ...anchor.position,
          ...anchor.quaternion,
        ].every(Number.isFinite) ||
        Math.abs(bar.quaternion.lengthSq() - 1) > 1e-6
      )
        throw new Error('Invalid rigid landmine transform');
      if (bar.position.distanceTo(pivot) > 1e-6 || !unitScale(bar))
        throw new Error('Landmine pivot moved or load scaled');
      if (
        anchor.position.distanceTo(anchorPosition) > 1e-6 ||
        !unitScale(anchor) ||
        anchor.quaternion.angleTo(identity) > 1e-6
      )
        throw new Error('Grounded landmine anchor moved');
      for (const [marker, local] of [
        [grip, [1.79, 0, 0]],
        [hand, [-0.02, -0.055, 0.005]],
      ])
        if (
          marker.position.distanceTo(new Vector3(...local)) > 1e-6 ||
          marker.quaternion.angleTo(identity) > 1e-6 ||
          !unitScale(marker)
        )
          throw new Error('Animated or displaced landmine grip marker');
      const position = bar.geometry.attributes.position;
      for (let i = 0; i < position.count; i++)
        minimumGround = Math.min(
          minimumGround,
          new Vector3()
            .fromBufferAttribute(position, i)
            .applyMatrix4(bar.matrixWorld).y,
        );
      if (minimumGround < -0.005)
        throw new Error('Landmine load penetrates ground');
      gripDrift = Math.max(
        gripDrift,
        hand
          .getWorldPosition(new Vector3())
          .distanceTo(grip.getWorldPosition(new Vector3())),
      );
      if (gripDrift > 0.005)
        throw new Error(`Distal landmine grip drift: ${gripDrift}`);
      const inverse = new Matrix4().copy(bar.matrixWorld).invert();
      const shaftA = new Vector3(),
        shaftB = new Vector3(1.8, 0, 0),
        plateA = new Vector3(1.4, 0, 0),
        plateB = new Vector3(1.45, 0, 0);
      for (const { skin, source, triangles } of skins) {
        const points = source.map((p, i) =>
          skin
            .applyBoneTransform(i, p.clone())
            .applyMatrix4(skin.matrixWorld)
            .applyMatrix4(inverse),
        );
        for (const { ids, palm } of triangles) {
          const [a, b, c] = ids.map((i) => points[i]);
          // Only the declared loaded palm may touch the distal shaft, never the plate or head/body.
          if (!palm) {
            const d = triangleDistance(a, b, c, shaftA, shaftB) - 0.012;
            shaftClearance = Math.min(shaftClearance, d);
            if (d < -0.003)
              throw new Error(
                `Landmine shaft intersects body/head: ${d}; phase=${progress}; source=${ids.map((i) => source[i].toArray()).join(';')}`,
              );
          }
          const d = triangleDistance(a, b, c, plateA, plateB) - 0.13;
          plateClearance = Math.min(plateClearance, d);
          if (d < -0.003)
            throw new Error(
              `Landmine plate intersects skin: ${d}; phase=${progress}; source=${ids.map((i) => source[i].toArray()).join(';')}`,
            );
        }
      }
    },
    finish() {
      return {
        landmineGripDriftMeters: gripDrift,
        landmineShaftClearanceMeters: shaftClearance,
        landminePlateClearanceMeters: plateClearance,
        landmineMinimumGroundMeters: minimumGround,
      };
    },
  };
}
