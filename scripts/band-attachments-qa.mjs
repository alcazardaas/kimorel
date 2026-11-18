import { triangleDistance } from './barbell-qa.mjs';
import { Quaternion, Vector3 } from 'three';
import definitions from '../pipeline/character/equipment-profiles.json' with { type: 'json' };
const identity = new Quaternion();
const unit = (object) => [...object.scale].every((v) => Math.abs(v - 1) < 1e-6);
const inside = (p, b) =>
  p.x >= b[0] &&
  p.x <= b[1] &&
  p.y >= b[2] &&
  p.y <= b[3] &&
  p.z >= b[4] &&
  p.z <= b[5];
const finite = (p) => [...p].every(Number.isFinite);
const strapShapes = {
  'band-shin-strap': { axis: 1, axisLength: 0.045, inner: [0.145, 0.205] },
  'band-knee-strap': { axis: 1, axisLength: 0.055, inner: [0.174, 0.174] },
  'band-foot-strap': { axis: 2, axisLength: 0.05, inner: [0.125, 0.112] },
};
function checkGeometry(mesh, id) {
  const d = definitions[id],
    p = mesh?.geometry?.attributes.position,
    expected = [],
    indices = [];
  if (!mesh?.isMesh || mesh.isSkinnedMesh || !d)
    throw new Error('Missing physical band strap/handle');
  for (const [x, y, z, sx, sy, sz] of d.boxes)
    for (const [axis, sign] of [
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 1],
      [2, -1],
      [2, 1],
    ]) {
      const other = [0, 1, 2].filter((i) => i !== axis);
      const start = expected.length;
      for (const [a, b] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const point = [x, y, z];
        point[axis] += (sign * [sx, sy, sz][axis]) / 2;
        point[other[0]] += (a * [sx, sy, sz][other[0]]) / 2;
        point[other[1]] += (b * [sx, sy, sz][other[1]]) / 2;
        expected.push(point);
      }
      const order =
        sign === (axis !== 1 ? 1 : -1)
          ? [0, 1, 2, 0, 2, 3]
          : [0, 2, 1, 0, 3, 2];
      indices.push(...order.map((i) => start + i));
    }
  const index = mesh.geometry.index;
  if (
    !index ||
    index.count !== indices.length ||
    indices.some((v, i) => index.getX(i) !== v)
  )
    throw new Error('Band strap/handle topology mismatch');
  if (
    p.count !== expected.length ||
    expected.some((v, i) =>
      v.some(
        (n, k) =>
          !Number.isFinite(p.getComponent(i, k)) ||
          Math.abs(n - p.getComponent(i, k)) > 1e-6,
      ),
    )
  )
    throw new Error('Band strap/handle geometry mismatch');
}

/** Standalone E2 attachments retain their physical units and exact closed surfaces. */
export function validateAttachmentEquipment(mesh, id) {
  checkGeometry(mesh, id);
  if (
    !finite(mesh.position) ||
    mesh.position.length() > 1e-6 ||
    !unit(mesh) ||
    mesh.quaternion.angleTo(identity) > 1e-6
  )
    throw new Error('Standalone band attachment transform changed');
  return {
    vertices: mesh.geometry.attributes.position.count,
    dimensionsMeters: definitions[id].dimensions,
  };
}

/** E2 attachments prove actual cuff/skin and two-hand handle contact, not just marker names. */
export function createAttachmentChecks(scene, profile, band) {
  const spec = profile.elasticBand.attachments;
  if (!spec) return null;
  const anchor = scene.getObjectByName('equipment_band-anchor'),
    human = scene.getObjectByName('human');
  if (anchor?.parent !== scene || human?.parent !== scene)
    throw new Error('Limb-band anchor and human must be independent roots');
  // New limb contracts fail closed on invalid deformation inputs; legacy follow-ups remain separate.
  if (
    band.skeleton.boneInverses.some((m) => !m.elements.every(Number.isFinite))
  )
    throw new Error('Non-finite limb-band inverse bind');
  const markers = spec.map((attachment, i) => {
    const bone = scene.getObjectByName(attachment.bone),
      marker = scene.getObjectByName(`band_distal_${i}`);
    if (!bone?.isBone || marker?.parent !== bone)
      throw new Error('Missing limb-band attachment marker');
    const cuff = attachment.strap
      ? scene.getObjectByName(`band_strap_${i}`)
      : null;
    if (attachment.strap) {
      checkGeometry(cuff, attachment.strap.id);
      if (cuff.parent !== bone)
        throw new Error('Band cuff is not attached to declared limb');
    }
    return {
      ...attachment,
      bone,
      marker,
      local: new Vector3(...attachment.local),
      cuff,
    };
  });
  const handle =
    markers.length === 2 ? scene.getObjectByName('band_handle') : null;
  if (handle) {
    checkGeometry(handle, 'band-handle');
    if (handle.parent !== scene)
      throw new Error('Band handle must move independently');
  }
  if (markers.length === 2 && !handle)
    throw new Error('Missing two-hand Pallof handle');
  const position = human.geometry.attributes.position;
  const patches = markers.map((m) =>
    Array.from({ length: position.count }, (_, i) => i).filter((i) =>
      inside(new Vector3().fromBufferAttribute(position, i), m.skinBounds),
    ),
  );
  if (patches.some((p) => p.length === 0))
    throw new Error('Band attachment has no actual skin patch');
  const triangles = [];
  const index = human.geometry.index;
  for (let i = 0; i < index.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const center = ids
      .reduce(
        (a, j) => a.add(new Vector3().fromBufferAttribute(position, j)),
        new Vector3(),
      )
      .multiplyScalar(1 / 3);
    triangles.push({
      ids,
      grip: spec.some((a) => inside(center, a.skinBounds)),
    });
  }
  let contactGap = 0;
  return {
    markers,
    end() {
      return handle
        ? handle.getWorldPosition(new Vector3())
        : markers[0].marker.getWorldPosition(new Vector3());
    },
    sample(points) {
      if (
        anchor.parent !== scene ||
        human.parent !== scene ||
        !finite(human.position) ||
        human.position.length() > 1e-6 ||
        !unit(human) ||
        human.quaternion.angleTo(identity) > 1e-6
      )
        throw new Error('Limb-band root transform changed');
      if (points.some((p) => !finite(p)))
        throw new Error('Non-finite limb-band human surface');
      if (
        band.skeleton.boneInverses.some(
          (m) => !m.elements.every(Number.isFinite),
        )
      )
        throw new Error('Non-finite limb-band inverse bind');
      for (const [i, m] of markers.entries()) {
        if (
          m.marker.parent !== m.bone ||
          !finite(m.marker.position) ||
          m.marker.position.distanceTo(m.local) > 1e-6 ||
          !unit(m.marker) ||
          m.marker.quaternion.angleTo(identity) > 1e-6
        )
          throw new Error('Limb-band attachment moved');
        if (m.cuff) {
          const { id, center } = m.strap,
            shape = strapShapes[id],
            other = [0, 1, 2].filter((j) => j !== shape.axis);
          if (
            m.cuff.parent !== m.bone ||
            m.cuff.position.distanceTo(new Vector3(...center)) > 1e-6 ||
            !unit(m.cuff) ||
            m.cuff.quaternion.angleTo(identity) > 1e-6
          )
            throw new Error('Band cuff moved');
          let gap = Infinity,
            penetration = 0;
          const inverse = m.cuff.matrixWorld.clone().invert();
          for (const j of patches[i]) {
            const p = points[j].clone().applyMatrix4(inverse);
            if (
              Math.abs(p.getComponent(shape.axis)) <=
              shape.axisLength / 2 + 0.01
            ) {
              const distances = other.map(
                (axis, k) =>
                  shape.inner[k] / 2 - Math.abs(p.getComponent(axis)),
              );
              gap = Math.min(gap, Math.abs(Math.min(...distances)));
            }
          }
          for (const point of points) {
            const p = point.clone().applyMatrix4(inverse);
            for (const box of definitions[id].boxes) {
              const depth = [0, 1, 2].map(
                (axis) =>
                  box[axis + 3] / 2 -
                  Math.abs(p.getComponent(axis) - box[axis]),
              );
              if (depth.every((v) => v > 0))
                penetration = Math.max(penetration, Math.min(...depth));
            }
          }
          if (!Number.isFinite(gap) || gap > 0.025 || penetration > 0.003)
            throw new Error(
              `Band cuff lost physical skin contact: gap=${gap} penetration=${penetration}`,
            );
          contactGap = Math.max(contactGap, gap);
          const local = m.local.clone().sub(new Vector3(...center));
          if (
            !definitions[id].boxes.some(
              (box) =>
                [0, 1, 2].every(
                  (k) =>
                    Math.abs(local.getComponent(k) - box[k]) <=
                    box[k + 3] / 2 + 1e-6,
                ) &&
                [0, 1, 2].some(
                  (k) =>
                    Math.abs(
                      Math.abs(local.getComponent(k) - box[k]) - box[k + 3] / 2,
                    ) < 1e-6,
                ),
            )
          )
            throw new Error('Band marker is not on physical cuff surface');
        }
        if (handle) {
          if (
            handle.parent !== scene ||
            !unit(handle) ||
            handle.quaternion.angleTo(identity) > 1e-6
          )
            throw new Error('Pallof handle transform changed');
          const expected = handle
            .getWorldPosition(new Vector3())
            .add(new Vector3(i === 0 ? 0.065 : -0.065, 0, 0));
          if (
            m.marker.getWorldPosition(new Vector3()).distanceTo(expected) >
            0.002
          )
            throw new Error('Pallof two-hand handle grip drift');
        }
      }
      if (handle) {
        const center = handle.getWorldPosition(new Vector3()),
          a = center.clone().add(new Vector3(-0.095, 0, 0)),
          b = center.clone().add(new Vector3(0.095, 0, 0));
        for (const { ids, grip } of triangles) {
          if (grip) continue;
          if (
            triangleDistance(...ids.map((i) => points[i]), a, b) - 0.025 <
            -0.003
          )
            throw new Error('Pallof handle intersects non-grip skin');
        }
      }
    },
    finish() {
      return { bandCuffSkinGapMeters: contactGap };
    },
  };
}
