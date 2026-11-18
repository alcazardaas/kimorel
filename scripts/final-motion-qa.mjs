import definitions from '../pipeline/character/equipment-profiles.json' with { type: 'json' };
import { Vector3, Quaternion } from 'three';
import { triangleDistance } from './barbell-qa.mjs';

const palms = (p) => Math.abs(p.x) > 0.37 && p.y > 0.81 && p.y < 1.05;
const finite = (v) => [...v].every(Number.isFinite);
const identity = new Quaternion();
const unitRoot = (object, scene) =>
  object?.parent === scene &&
  object.scale.toArray().every((x) => Math.abs(x - 1) < 1e-6);

/** Explicit hanging and rolling support contracts, separate from ordinary floor support. */
export function createFinalMotionChecks(scene, profile) {
  const props = (profile.finalMotion ? (profile.props ?? []) : []).map(
    (instance) => {
      const object = scene.getObjectByName(`equipment_${instance.id}`);
      validateFinalPropTopology(object, instance.id);
      return { object, expected: new Vector3(...instance.translation) };
    },
  );
  const checkProps = () => {
    for (const { object, expected } of props)
      if (
        !unitRoot(object, scene) ||
        object.position.distanceTo(expected) > 1e-6 ||
        object.quaternion.angleTo(identity) > 1e-6
      )
        throw new Error('Final physical support transform changed');
  };
  checkProps();
  const spec = profile.hangingSupport;
  const wheel = profile.wheelSupport ? scene.getObjectByName('ab_wheel') : null;
  if (!spec && !profile.wheelSupport)
    return {
      sample() {
        checkProps();
      },
      finish: () => ({}),
    };
  const prop = spec && scene.getObjectByName(`equipment_${spec.prop}`);
  if (
    spec &&
    (!unitRoot(prop, scene) ||
      !Number.isFinite(spec.height) ||
      !Number.isFinite(spec.z) ||
      !['hanging-frame', 'low-frame'].includes(spec.prop))
  )
    throw new Error('Invalid physical hanging frame');
  if (wheel) validateWheelGeometry(wheel);
  if (profile.wheelSupport && (!wheel || !unitRoot(wheel, scene)))
    throw new Error('Missing root rolling wheel');
  const grips = ['left', 'right'].map((side, i) => {
    const hand = scene.getObjectByName(`${side}_hand`),
      marker = scene.getObjectByName(`${side}_hand_support_grip`);
    const expected = new Vector3(i ? -0.02 : 0.02, -0.055, 0.005);
    if (
      !marker ||
      marker.parent !== hand ||
      marker.position.distanceTo(expected) > 1e-6 ||
      marker.quaternion.angleTo(identity) > 1e-6 ||
      marker.scale.toArray().some((x) => x !== 1)
    )
      throw new Error('Missing fixed physical support grip');
    const target = spec
      ? new Vector3(i ? -spec.span : spec.span, spec.height, spec.z)
      : scene.getObjectByName(`${side}_wheel_grip`);
    if (
      !spec &&
      (!target ||
        target.parent !== wheel ||
        target.position.distanceTo(new Vector3(i ? -0.18 : 0.18, 0, 0)) > 1e-6)
    )
      throw new Error('Wheel axle grip mismatch');
    return { marker, expected, target, side };
  });
  const skins = [];
  scene.traverse((o) => {
    if (o.isSkinnedMesh && o.name === 'human') skins.push(o);
  });
  if (!skins.length) throw new Error('Missing human for physical support');
  let maximumGripDrift = 0,
    maximumPalmGap = 0,
    maximumRollingError = 0,
    samples = 0;
  return {
    sample() {
      samples++;
      checkProps();
      if (
        spec &&
        (!unitRoot(prop, scene) ||
          prop.position.distanceTo(
            new Vector3(
              ...profile.props.find((p) => p.id === spec.prop).translation,
            ),
          ) > 1e-6 ||
          prop.quaternion.angleTo(identity) > 1e-6)
      )
        throw new Error('Hanging frame inherited transform');
      for (const grip of grips) {
        if (
          grip.marker.position.distanceTo(grip.expected) > 1e-6 ||
          grip.marker.quaternion.angleTo(identity) > 1e-6 ||
          grip.marker.scale.toArray().some((x) => x !== 1)
        )
          throw new Error('Animated support grip moved');
        const p = grip.marker.getWorldPosition(new Vector3());
        const target = spec
          ? grip.target
          : grip.target.getWorldPosition(new Vector3());
        if (!finite(p) || !finite(target))
          throw new Error('Non-finite physical support');
        maximumGripDrift = Math.max(maximumGripDrift, p.distanceTo(target));
      }
      if (wheel) {
        if (
          !unitRoot(wheel, scene) ||
          !finite(wheel.position) ||
          Math.abs(wheel.position.x) > 1e-6 ||
          Math.abs(wheel.position.y - 0.18) > 1e-6
        )
          throw new Error('Rolling axle left floor plane');
        const expected = new Quaternion().setFromAxisAngle(
          new Vector3(1, 0, 0),
          (wheel.position.z - 0.32) / 0.18,
        );
        maximumRollingError = Math.max(
          maximumRollingError,
          wheel.quaternion.angleTo(expected),
        );
        const position = wheel.geometry.attributes.position;
        let minimum = Infinity;
        for (let j = 0; j < position.count; j++) {
          const p = wheel.localToWorld(
            new Vector3().fromBufferAttribute(position, j),
          );
          if (!finite(p)) throw new Error('Non-finite rolling wheel');
          minimum = Math.min(minimum, p.y);
        }
        if (minimum < -0.001 || minimum > 0.008)
          throw new Error('Wheel lost ground contact');
      }
      const a = spec
        ? new Vector3(-0.95, spec.height, spec.z)
        : new Vector3(-0.25, 0.18, wheel.position.z);
      const b = spec
        ? new Vector3(0.95, spec.height, spec.z)
        : new Vector3(0.25, 0.18, wheel.position.z);
      const gaps = [Infinity, Infinity];
      for (const skin of skins) {
        if (
          !unitRoot(skin, scene) ||
          skin.position.length() > 1e-6 ||
          skin.quaternion.angleTo(identity) > 1e-6
        )
          throw new Error('Physical human mesh transform changed');
        const p = skin.geometry.attributes.position,
          index = skin.geometry.index;
        const points = [];
        for (let j = 0; j < p.count; j++) {
          const source = new Vector3().fromBufferAttribute(p, j),
            actual = skin.applyBoneTransform(j, source.clone());
          if (!finite(actual)) throw new Error('Non-finite hanging skin');
          points.push(actual);
          if (palms(source)) {
            const side = source.x > 0 ? 0 : 1;
            const contact = spec
              ? grips[side].target
              : grips[side].target.getWorldPosition(new Vector3());
            gaps[side] = Math.min(gaps[side], actual.distanceTo(contact));
          }
          if (
            spec &&
            spec.prop === 'hanging-frame' &&
            source.y < 0.035 &&
            actual.y < 0.12
          )
            throw new Error('Suspended body contacted floor');
          if (wheel && !palms(source)) {
            const relative = wheel.worldToLocal(actual.clone());
            if (
              Math.abs(relative.x) < 0.035 &&
              Math.hypot(relative.y, relative.z) < 0.177
            )
              throw new Error('Body penetrates rolling wheel');
          }
        }
        for (let j = 0; j < index.count; j += 3) {
          const ids = [index.getX(j), index.getX(j + 1), index.getX(j + 2)];
          const center = ids
            .reduce(
              (v, id) => v.add(new Vector3().fromBufferAttribute(p, id)),
              new Vector3(),
            )
            .multiplyScalar(1 / 3);
          // Only the actual hand patches near the two declared grips may touch the shaft.
          const centerWorld = ids
            .reduce((v, id) => v.add(points[id]), new Vector3())
            .multiplyScalar(1 / 3);
          const handContact =
            palms(center) &&
            grips.some(
              (g) =>
                centerWorld.distanceTo(
                  spec ? g.target : g.target.getWorldPosition(new Vector3()),
                ) < 0.12,
            );
          if (
            !handContact &&
            triangleDistance(...ids.map((id) => points[id]), a, b) <
              (spec ? Math.SQRT2 * 0.014 : 0.018) - 0.003
          )
            throw new Error('Body intersects physical support bar');
        }
      }
      maximumPalmGap = Math.max(maximumPalmGap, ...gaps);
      if (
        maximumGripDrift > 0.002 ||
        maximumPalmGap > 0.035 ||
        maximumRollingError > 0.002
      )
        throw new Error(
          `Physical grip/palm/rolling invariant: ${maximumGripDrift}/${maximumPalmGap}/${maximumRollingError}`,
        );
    },
    finish() {
      if (samples !== 121)
        throw new Error('Incomplete physical support sampling');
      return {
        physicalSupportGripDriftMeters: maximumGripDrift,
        physicalPalmGapMeters: maximumPalmGap,
        wheelNoSlipRadians: maximumRollingError,
      };
    },
  };
}

export function validateWheelGeometry(object) {
  if (!object?.isMesh || object.isSkinnedMesh)
    throw new Error('Missing physical wheel');
  const p = object.geometry.attributes.position,
    ids = object.geometry.index;
  if (
    p.count !== 48 ||
    ids.count !== 264 ||
    !object.scale.toArray().every((x) => Math.abs(x - 1) < 1e-6)
  )
    throw new Error('Invalid wheel topology or scale');
  const segments = [
    [-0.035, 0.035, 0.18],
    [-0.25, 0.25, 0.018],
  ];
  let cursor = 0;
  for (const [a, b, r] of segments)
    for (const x of [a, b])
      for (let j = 0; j < 12; j++) {
        const expected = new Vector3(
          x,
          r * Math.cos((j * Math.PI) / 6),
          r * Math.sin((j * Math.PI) / 6),
        );
        const actual = new Vector3().fromBufferAttribute(p, cursor++);
        if (!finite(actual) || actual.distanceTo(expected) > 1e-6)
          throw new Error('Wheel geometry dimensions mismatch');
      }
  const expectedIndices = [];
  for (let start = 0; start < 48; start += 24) {
    for (let j = 0; j < 12; j++) {
      const a = start + j,
        b = start + ((j + 1) % 12);
      expectedIndices.push(a, b, b + 12, a, b + 12, a + 12);
    }
    for (const [offset, reverse] of [
      [0, true],
      [12, false],
    ])
      for (let j = 1; j < 11; j++) {
        const face = [
          start + offset,
          start + offset + j,
          start + offset + j + 1,
        ];
        expectedIndices.push(...(reverse ? face.reverse() : face));
      }
  }
  const normal = object.geometry.attributes.normal;
  if (
    expectedIndices.some((value, i) => ids.getX(i) !== value) ||
    normal?.count !== 48
  )
    throw new Error('Invalid closed wheel topology');
  for (let i = 0; i < 48; i++) {
    const n = new Vector3().fromBufferAttribute(normal, i),
      a = ((i % 12) * Math.PI) / 6;
    if (
      !finite(n) ||
      n.distanceTo(new Vector3(0, Math.cos(a), Math.sin(a))) > 1e-6
    )
      throw new Error('Invalid wheel normal');
  }
  return { vertices: p.count, radiusMeters: 0.18 };
}

/** Independent skin contact for wall forearms and kneeling floor supports. */
export function createWallSlideChecks(scene, profile) {
  if (!profile.wallForearmSupport && !profile.groundSkinContacts?.length)
    return { sample() {}, finish: () => ({}) };
  const wall = profile.wallForearmSupport
    ? scene.getObjectByName('equipment_wall')
    : null;
  const expected = wall
    ? new Vector3(...profile.props.find((p) => p.id === 'wall').translation)
    : null;
  if (profile.wallForearmSupport && !unitRoot(wall, scene))
    throw new Error('Missing root wall support');
  const surfaces = (profile.groundSkinContacts ?? []).map((p) => ({
    ...p,
    axis: 1,
    plane: 0,
    points: [],
  }));
  if (wall)
    for (const side of [1, -1])
      surfaces.push({
        axis: 2,
        plane: expected.z - 0.05,
        bounds:
          side === 1
            ? [0.3, 0.48, 1, 1.15, -0.2, 0.2]
            : [-0.48, -0.3, 1, 1.15, -0.2, 0.2],
        points: [],
      });
  const skins = [];
  scene.traverse((o) => {
    if (o.isSkinnedMesh && o.name === 'human') {
      skins.push(o);
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const source = new Vector3().fromBufferAttribute(p, i);
        for (const surface of surfaces)
          if (
            [0, 1, 2].every(
              (a) =>
                source.getComponent(a) >= surface.bounds[a * 2] &&
                source.getComponent(a) <= surface.bounds[a * 2 + 1],
            )
          )
            surface.points.push({ skin: o, index: i, source });
      }
    }
  });
  if (!skins.length || surfaces.some((s) => !s.points.length))
    throw new Error('Missing physical contact skin patch');
  let maximumGap = 0,
    samples = 0;
  return {
    sample() {
      samples++;
      if (
        wall &&
        (!unitRoot(wall, scene) ||
          wall.position.distanceTo(expected) > 1e-6 ||
          wall.quaternion.angleTo(identity) > 1e-6)
      )
        throw new Error('Animated wall support moved');
      for (const skin of skins)
        if (
          !unitRoot(skin, scene) ||
          skin.position.length() > 1e-6 ||
          skin.quaternion.angleTo(identity) > 1e-6
        )
          throw new Error('Physical human mesh transform changed');
      for (const surface of surfaces) {
        let gap = Infinity;
        for (const { skin, index, source } of surface.points) {
          const actual = skin.applyBoneTransform(index, source.clone());
          if (!finite(actual)) throw new Error('Non-finite physical contact');
          if (
            surface.axis === 2 &&
            (Math.abs(actual.x) > 0.6 || actual.y < 0 || actual.y > 2)
          )
            continue;
          gap = Math.min(
            gap,
            Math.abs(actual.getComponent(surface.axis) - surface.plane),
          );
        }
        maximumGap = Math.max(maximumGap, gap);
      }
      if (maximumGap > 0.035)
        throw new Error(`Physical wall or knee contact gap: ${maximumGap}`);
    },
    finish() {
      if (samples !== 121)
        throw new Error('Incomplete physical contact sampling');
      return {
        wallForearmGapMeters: wall ? maximumGap : 0,
        kneelingSkinGapMeters: wall ? 0 : maximumGap,
      };
    },
  };
}

/** Exact outward cuboid faces prevent invisible or degenerate new support frames. */
export function validateFinalPropTopology(object, id) {
  const definition = definitions[id];
  if (!definition || !object?.isMesh || object.isSkinnedMesh)
    throw new Error('Missing final physical support geometry');
  const index = object.geometry.index,
    normal = object.geometry.attributes.normal;
  const expected = [],
    normals = [];
  let start = 0;
  for (let box = 0; box < definition.boxes.length; box++) {
    for (const [axis, sign] of [
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 1],
      [2, -1],
      [2, 1],
    ]) {
      const order =
        sign === (axis !== 1 ? 1 : -1)
          ? [0, 1, 2, 0, 2, 3]
          : [0, 2, 1, 0, 3, 2];
      expected.push(...order.map((i) => start + i));
      const n = [0, 0, 0];
      n[axis] = sign;
      for (let j = 0; j < 4; j++) normals.push(n);
      start += 4;
    }
  }
  if (
    index?.count !== expected.length ||
    normal?.count !== normals.length ||
    expected.some((v, i) => index.getX(i) !== v)
  )
    throw new Error('Invalid final support topology');
  if (
    normals.some(
      (n, i) =>
        new Vector3()
          .fromBufferAttribute(normal, i)
          .distanceTo(new Vector3(...n)) > 1e-6,
    ) ||
    Array.from(normal.array).some((x) => !Number.isFinite(x))
  )
    throw new Error('Invalid final support normals');
  return { faces: expected.length / 3 };
}
