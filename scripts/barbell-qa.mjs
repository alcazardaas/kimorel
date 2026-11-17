import { Matrix4, Triangle, Vector3 } from 'three';

const segments = [
  [-0.75, 0.75, 0.012],
  [-0.67, -0.62, 0.16],
  [0.62, 0.67, 0.16],
];
const padSegments = [[-0.25, 0.25, 0.05]];
const inside = (p, b) =>
  p.x >= b[0] &&
  p.x <= b[1] &&
  p.y >= b[2] &&
  p.y <= b[3] &&
  p.z >= b[4] &&
  p.z <= b[5];
const clamp = (v) => Math.max(0, Math.min(1, v));

export function validateBarGeometry(mesh, pad = false) {
  if (!mesh?.isMesh || mesh.isSkinnedMesh)
    throw new Error('Missing rigid bar geometry');
  const expected = [];
  for (const [lo, hi, r] of pad ? padSegments : segments)
    for (const x of [lo, hi])
      for (let j = 0; j < 12; j++)
        expected.push([
          x,
          r * Math.cos((j * Math.PI) / 6),
          r * Math.sin((j * Math.PI) / 6),
        ]);
  const actual = mesh.geometry.attributes.position;
  if (
    actual.count !== expected.length ||
    expected.some((p, i) =>
      p.some((v, k) => Math.abs(v - actual.getComponent(i, k)) > 1e-6),
    )
  )
    throw new Error('Shared bar geometry mismatch');
  const expectedIndices = [];
  const count = pad ? padSegments.length : segments.length;
  for (let i = 0; i < count; i++) {
    const start = i * 24;
    for (let j = 0; j < 12; j++) {
      const a = start + j,
        b = start + ((j + 1) % 12);
      expectedIndices.push(a, b, b + 12, a, b + 12, a + 12);
    }
    for (let j = 1; j < 11; j++)
      expectedIndices.push(start + j + 1, start + j, start);
    for (let j = 1; j < 11; j++)
      expectedIndices.push(start + 12, start + 12 + j, start + 12 + j + 1);
  }
  const index = mesh.geometry.index;
  if (
    !index ||
    index.count !== expectedIndices.length ||
    expectedIndices.some((value, i) => index.getX(i) !== value)
  )
    throw new Error('Shared bar topology mismatch');
  return {
    vertices: actual.count,
    dimensionsMeters: pad ? [0.5, 0.1, 0.1] : [1.5, 0.32, 0.32],
  };
}

function segmentDistance(p, q, a, b) {
  const d = q.clone().sub(p),
    e = b.clone().sub(a),
    r = p.clone().sub(a);
  const dd = d.dot(d),
    ee = e.dot(e),
    de = d.dot(e),
    dr = d.dot(r),
    er = e.dot(r);
  if (dd < 1e-15 && ee < 1e-15) return p.distanceTo(a);
  let s = 0,
    t = 0;
  if (dd < 1e-15) t = clamp(er / ee);
  else if (ee < 1e-15) s = clamp(-dr / dd);
  else {
    const denominator = dd * ee - de * de;
    s = denominator > 1e-15 ? clamp((de * er - dr * ee) / denominator) : 0;
    t = (de * s + er) / ee;
    if (t < 0) {
      t = 0;
      s = clamp(-dr / dd);
    } else if (t > 1) {
      t = 1;
      s = clamp((de - dr) / dd);
    }
  }
  return p
    .clone()
    .addScaledVector(d, s)
    .distanceTo(a.clone().addScaledVector(e, t));
}

function triangleDistance(a, b, c, p, q) {
  const direction = q.clone().sub(p),
    edge = b.clone().sub(a),
    other = c.clone().sub(a);
  const h = direction.clone().cross(other),
    det = edge.dot(h);
  if (Math.abs(det) > 1e-12) {
    const offset = p.clone().sub(a),
      u = offset.dot(h) / det,
      cross = offset.clone().cross(edge),
      v = direction.dot(cross) / det,
      t = other.dot(cross) / det;
    if (u >= 0 && v >= 0 && u + v <= 1 && t >= 0 && t <= 1) return 0;
  }
  const triangle = new Triangle(a, b, c),
    closest = new Vector3();
  return Math.min(
    p.distanceTo(triangle.closestPointToPoint(p, closest)),
    q.distanceTo(triangle.closestPointToPoint(q, closest)),
    segmentDistance(p, q, a, b),
    segmentDistance(p, q, b, c),
    segmentDistance(p, q, c, a),
  );
}

/** Both hand grips and actual skinned triangles are evaluated against one root-level load. */
export function createBarbellChecks(scene, profile) {
  if (!profile.sharedBar)
    return {
      sample() {},
      finish() {
        return {};
      },
    };
  const bar = scene.getObjectByName('barbell');
  validateBarGeometry(bar);
  if (bar.parent !== scene)
    throw new Error('Shared bar must be an independent scene load');
  const gripSpan = profile.barGripSpan ?? 0.33;
  const pairs = ['left', 'right'].map((side, index) => {
    const hand = scene.getObjectByName(`${side}_hand_bar_grip`),
      grip = scene.getObjectByName(`${side}_bar_grip`);
    if (
      !hand ||
      !grip ||
      hand.parent.name !== `${side}_hand` ||
      grip.parent !== bar
    )
      throw new Error('Missing two-hand bar grip hierarchy');
    if (
      grip.position.distanceTo(
        new Vector3(index === 0 ? gripSpan : -gripSpan, 0, 0),
      ) > 1e-6
    )
      throw new Error('Shared bar grip spacing mismatch');
    return { hand, grip, index };
  });
  const pad = scene.getObjectByName('barbell_pad');
  if (profile.barPad) {
    validateBarGeometry(pad, true);
    if (
      pad.parent !== bar ||
      pad.position.length() > 1e-6 ||
      pad.quaternion.angleTo({ x: 0, y: 0, z: 0, w: 1 }) > 1e-6
    )
      throw new Error('Missing rigid hip pad attachment');
  } else if (pad) throw new Error('Undeclared hip pad');
  const skins = [];
  scene.traverse((skin) => {
    if (!skin.isSkinnedMesh) return;
    const attribute = skin.geometry.attributes.position;
    const source = Array.from({ length: attribute.count }, (_, i) =>
      new Vector3().fromBufferAttribute(attribute, i),
    );
    const index = skin.geometry.index;
    const triangles = [];
    for (let i = 0; i < index.count; i += 3) {
      const indices = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      const center = indices
        .reduce((sum, j) => sum.add(source[j]), new Vector3())
        .multiplyScalar(1 / 3);
      const hand =
        Math.abs(center.x) > 0.38 && center.y > 0.78 && center.y < 0.99;
      triangles.push({
        indices,
        hand,
        contacts: (profile.barSurfaceContacts ?? []).map((contact) =>
          inside(center, contact.bounds),
        ),
      });
    }
    skins.push({ skin, source, triangles });
  });
  let maximumGripDrift = 0,
    minimumShaftClearance = Infinity,
    maximumContactGap = 0,
    minimumPlateClearance = Infinity;
  return {
    sample(progress) {
      if (
        [...bar.scale].some((v) => Math.abs(v - 1) > 1e-6) ||
        (pad && [...pad.scale].some((v) => Math.abs(v - 1) > 1e-6))
      )
        throw new Error('Shared bar is not rigid meter scale');
      for (const { hand, grip, index } of pairs) {
        if (
          hand.position.distanceTo(
            new Vector3(index === 0 ? 0.02 : -0.02, -0.055, 0.005),
          ) > 1e-6 ||
          grip.position.distanceTo(
            new Vector3(index === 0 ? gripSpan : -gripSpan, 0, 0),
          ) > 1e-6
        )
          throw new Error('Animated or displaced grip marker');
        maximumGripDrift = Math.max(
          maximumGripDrift,
          hand
            .getWorldPosition(new Vector3())
            .distanceTo(grip.getWorldPosition(new Vector3())),
        );
      }
      if (maximumGripDrift > 0.005)
        throw new Error(`Two-hand bar grip drift: ${maximumGripDrift}`);
      const inverse = new Matrix4().copy(bar.matrixWorld).invert();
      const gaps = (profile.barSurfaceContacts ?? []).map(() => Infinity);
      for (const { skin, source, triangles } of skins) {
        const points = source.map((p, i) =>
          skin
            .applyBoneTransform(i, p.clone())
            .applyMatrix4(skin.matrixWorld)
            .applyMatrix4(inverse),
        );
        for (const p of points)
          minimumPlateClearance = Math.min(
            minimumPlateClearance,
            0.62 - Math.abs(p.x),
          );
        for (const item of triangles) {
          const [a, b, c] = item.indices.map((i) => points[i]);
          const y = Math.max(Math.abs(a.y), Math.abs(b.y), Math.abs(c.y));
          const minY = Math.min(a.y, b.y, c.y),
            maxY = Math.max(a.y, b.y, c.y),
            minZ = Math.min(a.z, b.z, c.z),
            maxZ = Math.max(a.z, b.z, c.z);
          if (
            minY > 0.1 ||
            maxY < -0.1 ||
            minZ > 0.1 ||
            maxZ < -0.1 ||
            !Number.isFinite(y)
          )
            continue;
          const distance = triangleDistance(
            a,
            b,
            c,
            new Vector3(-0.75, 0, 0),
            new Vector3(0.75, 0, 0),
          );
          if (!Number.isFinite(distance))
            throw new Error('Non-finite shaft surface distance');
          if (!item.hand) {
            minimumShaftClearance = Math.min(
              minimumShaftClearance,
              distance - 0.012,
            );
            if (distance < 0.009)
              throw new Error(
                `Bar shaft intersects body/head: ${distance}; phase=${progress}; source=${item.indices.map((i) => source[i].toArray()).join(';')}`,
              );
            if (
              pad &&
              Math.min(a.x, b.x, c.x) <= 0.253 &&
              Math.max(a.x, b.x, c.x) >= -0.253 &&
              triangleDistance(
                a,
                b,
                c,
                new Vector3(-0.25, 0, 0),
                new Vector3(0.25, 0, 0),
              ) < 0.047
            )
              throw new Error('Hip pad penetrates non-grip skin');
          }
          (profile.barSurfaceContacts ?? []).forEach((contact, i) => {
            if (
              !item.contacts[i] ||
              progress < contact.from ||
              progress > contact.to
            )
              return;
            const d = contact.pad
              ? triangleDistance(
                  a,
                  b,
                  c,
                  new Vector3(-0.25, 0, 0),
                  new Vector3(0.25, 0, 0),
                )
              : distance;
            gaps[i] = Math.min(
              gaps[i],
              Math.abs(d - (contact.pad ? 0.05 : 0.012)),
            );
          });
        }
      }
      if (minimumPlateClearance < 0.015)
        throw new Error('Plate/body horizontal clearance');
      (profile.barSurfaceContacts ?? []).forEach((contact, i) => {
        if (progress >= contact.from && progress <= contact.to) {
          maximumContactGap = Math.max(maximumContactGap, gaps[i]);
          if (gaps[i] > 0.035)
            throw new Error(`Missing physical bar/pad contact: ${gaps[i]}`);
        }
      });
      const center = bar.getWorldPosition(new Vector3());
      if (center.y - 0.16 < -0.005)
        throw new Error('Bar plate penetrates ground');
      for (const phase of profile.barFloorPhases ?? [])
        if (
          progress >= phase.from &&
          progress <= phase.to &&
          Math.abs(center.y - 0.16 - phase.height) > 0.005
        )
          throw new Error('Bar plate left declared floor plane');
    },
    finish() {
      return {
        barGripDriftMeters: maximumGripDrift,
        barShaftClearanceMeters: minimumShaftClearance,
        barContactGapMeters: maximumContactGap,
        barPlateClearanceMeters: minimumPlateClearance,
      };
    },
  };
}
