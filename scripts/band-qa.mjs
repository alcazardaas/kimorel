import { Matrix4, Quaternion, Vector3 } from 'three';
import { triangleDistance } from './barbell-qa.mjs';

const radius = 0.009,
  rings = 8,
  sides = 8;
const identity = new Quaternion();
const unitScale = (object) =>
  [...object.scale].every((v) => Math.abs(v - 1) < 1e-6);
const origin = (object) =>
  object.position.length() < 1e-6 &&
  object.quaternion.angleTo(identity) < 1e-6 &&
  unitScale(object);
const palmOffset = (side) =>
  new Vector3(side === 'left' ? 0.02 : -0.02, -0.055, 0.005);

/** Check source tube and topology independently of its endpoint skin. */
export function validateBandGeometry(mesh) {
  if (!mesh?.isMesh) throw new Error('Missing elastic band');
  const p = mesh.geometry.attributes.position,
    index = mesh.geometry.index;
  if (p.count !== (rings + 1) * sides) throw new Error('Band geometry count');
  for (let ring = 0; ring <= rings; ring++)
    for (let side = 0; side < sides; side++) {
      const expected = [
        ring / rings,
        radius * Math.cos((side * Math.PI) / 4),
        radius * Math.sin((side * Math.PI) / 4),
      ];
      if (
        expected.some(
          (v, k) => Math.abs(v - p.getComponent(ring * sides + side, k)) > 1e-6,
        )
      )
        throw new Error('Band rest geometry mismatch');
    }
  const expected = [];
  for (let ring = 0; ring < rings; ring++)
    for (let side = 0; side < sides; side++) {
      const a = ring * sides + side,
        b = ring * sides + ((side + 1) % sides);
      expected.push(a, b, b + sides, a, b + sides, a + sides);
    }
  for (let side = 1; side < sides - 1; side++)
    expected.push(
      0,
      side + 1,
      side,
      rings * sides,
      rings * sides + side,
      rings * sides + side + 1,
    );
  if (
    !index ||
    index.count !== expected.length ||
    expected.some((v, i) => v !== index.getX(i))
  )
    throw new Error('Band topology mismatch');
  if (!origin(mesh)) throw new Error('Band mesh transform changed');
  return { vertices: p.count, dimensionsMeters: [1, 0.018, 0.018] };
}

/** Two endpoint skinning must represent the actual palm/anchor path at every sampled pose. */
export function createBandChecks(scene, profile) {
  const specification = profile.elasticBand,
    band = scene.getObjectByName('elastic_band');
  if (!specification) {
    if (band) throw new Error('Undeclared elastic band');
    return {
      sample() {},
      finish() {
        return {};
      },
    };
  }
  validateBandGeometry(band);
  if (
    !band.isSkinnedMesh ||
    band.parent !== scene ||
    band.skeleton.bones.length !== 2
  )
    throw new Error('Band requires independent two-endpoint skin');
  const endpoints = [0, 1].map((i) =>
    scene.getObjectByName(`band_endpoint_${i}`),
  );
  if (
    endpoints.some(
      (node, i) =>
        !node?.isBone ||
        node.parent !== scene ||
        band.skeleton.bones[i] !== node,
    )
  )
    throw new Error('Band endpoint hierarchy mismatch');
  for (let i = 0; i < 2; i++) {
    const expected = new Matrix4().makeTranslation(-i, 0, 0);
    if (
      band.skeleton.boneInverses[i].elements.some(
        (v, k) => Math.abs(v - expected.elements[k]) > 1e-6,
      )
    )
      throw new Error('Band inverse bind mismatch');
  }
  const positions = band.geometry.attributes.position,
    weights = band.geometry.attributes.skinWeight,
    joints = band.geometry.attributes.skinIndex;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    if (
      [1 - x, x, 0, 0].some(
        (v, k) => Math.abs(v - weights.getComponent(i, k)) > 1e-6,
      ) ||
      [0, 1, 0, 0].some((v, k) => v !== joints.getComponent(i, k))
    )
      throw new Error('Band endpoint skin weights mismatch');
  }
  const anchored = specification.anchor !== undefined;
  const markers = (anchored ? ['right'] : ['left', 'right']).map((side) => {
    const marker = scene.getObjectByName(`${side}_hand_band_grip`),
      hand = scene.getObjectByName(`${side}_hand`);
    if (!marker || marker.parent !== hand)
      throw new Error('Missing fixed band palm marker');
    return { side, marker, hand };
  });
  const anchor = anchored
    ? scene.getObjectByName('equipment_band-anchor')
    : null;
  const instance = profile.props?.find((p) => p.id === 'band-anchor');
  if (anchored && (!anchor || !instance))
    throw new Error('Missing grounded band anchor');
  const human = scene.getObjectByName('human');
  if (!human?.isSkinnedMesh)
    throw new Error('Missing human for band clearance');
  const source = human.geometry.attributes.position,
    index = human.geometry.index;
  const sources = Array.from({ length: source.count }, (_, i) =>
    new Vector3().fromBufferAttribute(source, i),
  );
  const triangles = [];
  for (let i = 0; i < index.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const center = ids
      .reduce((p, j) => p.add(sources[j]), new Vector3())
      .multiplyScalar(1 / 3);
    const hand =
      center.y < 1.015 && Math.abs(center.x) > 0.39
        ? center.x > 0
          ? 'left'
          : 'right'
        : null;
    triangles.push({ ids, hand });
  }
  let minLength = Infinity,
    maxLength = 0,
    drift = 0,
    clearance = Infinity,
    deformation = 0;
  let previous = null;
  return {
    sample() {
      if (!origin(band) || endpoints.some((node) => !unitScale(node)))
        throw new Error('Band transform or endpoint scale changed');
      for (const { side, marker } of markers) {
        if (
          marker.position.distanceTo(palmOffset(side)) > 1e-6 ||
          marker.quaternion.angleTo(identity) > 1e-6 ||
          !unitScale(marker)
        )
          throw new Error('Band palm marker moved');
      }
      const a = endpoints[0].getWorldPosition(new Vector3()),
        b = endpoints[1].getWorldPosition(new Vector3());
      const expectedStart = anchored
        ? new Vector3(...specification.anchor)
        : markers[0].marker.getWorldPosition(new Vector3());
      const expectedEnd = markers.at(-1).marker.getWorldPosition(new Vector3());
      drift = Math.max(
        drift,
        a.distanceTo(expectedStart),
        b.distanceTo(expectedEnd),
      );
      if (drift > 0.002) throw new Error('Band attachment drift');
      if (anchored) {
        if (
          anchor.position.distanceTo(new Vector3(...instance.translation)) >
            1e-6 ||
          anchor.quaternion.angleTo(identity) > 1e-6 ||
          !unitScale(anchor)
        )
          throw new Error('Band grounded anchor moved');
        const relative = expectedStart.clone().sub(anchor.position);
        if (
          Math.abs(relative.x) > 0.0275 ||
          Math.abs(relative.z) > 0.0275 ||
          relative.y < 0.05 ||
          relative.y > 1.475
        )
          throw new Error('Band anchor is outside physical post');
      }
      const length = a.distanceTo(b),
        stretch = length / specification.restLength;
      if (
        !Number.isFinite(stretch) ||
        stretch < specification.minStretch ||
        stretch > specification.maxStretch
      )
        throw new Error('Band stretch outside declared range');
      minLength = Math.min(minLength, length);
      maxLength = Math.max(maxLength, length);
      const directionUnit = b.clone().sub(a).normalize();
      const rotation =
        directionUnit.x < -0.999999
          ? new Quaternion(0, 0, 1, 0)
          : new Quaternion().setFromUnitVectors(
              new Vector3(1, 0, 0),
              directionUnit,
            );
      band.skeleton.update();
      for (let i = 0; i < positions.count; i++) {
        const sourcePoint = new Vector3().fromBufferAttribute(positions, i),
          x = sourcePoint.x;
        const expected = a
          .clone()
          .lerp(b, x)
          .add(
            new Vector3(0, sourcePoint.y, sourcePoint.z).applyQuaternion(
              rotation,
            ),
          );
        const actual = band.applyBoneTransform(i, sourcePoint);
        if (actual.distanceTo(expected) > 0.0001)
          throw new Error('Band skin does not follow stretched centerline');
        if (actual.y < -0.001) throw new Error('Band penetrates ground');
      }
      if (previous) deformation = Math.max(deformation, previous.distanceTo(b));
      previous = b.clone();
      human.skeleton.update();
      const points = sources.map((p, i) =>
        human.applyBoneTransform(i, p.clone()),
      );
      const direction = b.clone().sub(a).normalize();
      for (const { ids, hand } of triangles) {
        // A declared palm can touch only its terminal 10 cm; the rest remains checked.
        const from = a.clone(),
          to = b.clone();
        if (hand === 'right') to.addScaledVector(direction, -0.1);
        if (!anchored && hand === 'left') from.addScaledVector(direction, 0.1);
        const d =
          triangleDistance(...ids.map((i) => points[i]), from, to) - radius;
        clearance = Math.min(clearance, d);
        if (d < -0.003)
          throw new Error(
            `Band intersects body outside terminal grip: ${d}; source=${ids.map((i) => sources[i].toArray()).join(';')}`,
          );
      }
    },
    finish() {
      if (
        maxLength - minLength < specification.minExcursion ||
        deformation < 0.0001
      )
        throw new Error(
          'Band must visibly deform through a distinct excursion',
        );
      return {
        bandAttachmentDriftMeters: drift,
        bandLengthRangeMeters: [minLength, maxLength],
        bandMinimumClearanceMeters: clearance,
      };
    },
  };
}
