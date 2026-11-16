import { Vector3 } from 'three';
import definitions from '../pipeline/character/equipment-profiles.json' with { type: 'json' };

const inside = (point, bounds) =>
  [0, 1, 2].every(
    (axis) =>
      point.getComponent(axis) >= bounds[axis * 2] &&
      point.getComponent(axis) <= bounds[axis * 2 + 1],
  );

/** Validate actual rigid props and authored skin contact against their physical faces. */
export function createSupportChecks(scene, profile) {
  const props = (profile.props ?? []).map((instance) => {
    const definition = definitions[instance.id];
    const object = scene.getObjectByName(`equipment_${instance.id}`);
    if (!definition || !object?.isMesh || object.isSkinnedMesh)
      throw new Error(`Missing rigid support equipment: ${instance.id}`);
    if (
      object.position.distanceTo(new Vector3(...instance.translation)) > 1e-6 ||
      object.quaternion.angleTo({ x: 0, y: 0, z: 0, w: 1 }) > 1e-6 ||
      [...object.scale].some((v) => v !== 1)
    )
      throw new Error(`Support equipment transform mismatch: ${instance.id}`);
    const positions = object.geometry.getAttribute('position');
    const expected = [];
    for (const [x, y, z, sx, sy, sz] of definition.boxes)
      for (const [axis, sign] of [
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 1],
        [2, -1],
        [2, 1],
      ]) {
        const other = [0, 1, 2].filter((value) => value !== axis);
        for (const [a, b] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          const p = [x, y, z];
          p[axis] += (sign * [sx, sy, sz][axis]) / 2;
          p[other[0]] += (a * [sx, sy, sz][other[0]]) / 2;
          p[other[1]] += (b * [sx, sy, sz][other[1]]) / 2;
          expected.push(p);
        }
      }
    if (
      positions.count !== expected.length ||
      expected.some((p, i) =>
        p.some(
          (v, axis) => Math.abs(v - positions.getComponent(i, axis)) > 1e-6,
        ),
      )
    )
      throw new Error(`Support equipment geometry mismatch: ${instance.id}`);
    object.geometry.computeBoundingBox();
    const size = object.geometry.boundingBox.getSize(new Vector3());
    if (
      size
        .toArray()
        .some((v, axis) => Math.abs(v - definition.dimensions[axis]) > 1e-5)
    )
      throw new Error(`Support equipment dimensions mismatch: ${instance.id}`);
    const boxes = definition.boxes.map(([x, y, z, sx, sy, sz]) => {
      const center = new Vector3(x, y, z).add(object.position);
      return [
        center.x - sx / 2,
        center.x + sx / 2,
        center.y - sy / 2,
        center.y + sy / 2,
        center.z - sz / 2,
        center.z + sz / 2,
      ];
    });
    return { id: instance.id, boxes };
  });
  scene.traverse((object) => {
    if (
      object.userData.kimorelRigidEquipment &&
      !props.some((prop) => prop.id === object.userData.kimorelRigidEquipment)
    )
      throw new Error('Undeclared rigid support equipment');
  });
  const contacts = (profile.surfaceContacts ?? []).map((contact) => {
    const prop = props.find((entry) => entry.id === contact.prop);
    const bounds = prop?.boxes[contact.box ?? 0];
    if (
      !bounds ||
      ![1, 2].includes(contact.axis) ||
      contact.from < 0 ||
      contact.to > 1 ||
      contact.from > contact.to
    )
      throw new Error('Invalid physical surface contact profile');
    return {
      ...contact,
      bounds,
      plane: bounds[contact.axis * 2 + 1],
      points: [],
    };
  });
  scene.traverse((object) => {
    if (!object.isSkinnedMesh) return;
    const positions = object.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const source = new Vector3().fromBufferAttribute(positions, i);
      for (const contact of contacts)
        if (inside(source, contact.skinBounds))
          contact.points.push({ object, index: i, source });
    }
  });
  if (contacts.some((contact) => !contact.points.length))
    throw new Error('Empty physical support skin patch');
  let maximumSurfaceGap = 0,
    maximumPropPenetration = 0;
  return {
    distanceToSupport(point) {
      let distance = point.y;
      for (const prop of props)
        for (const b of prop.boxes)
          if (
            point.x >= b[0] &&
            point.x <= b[1] &&
            point.z >= b[4] &&
            point.z <= b[5] &&
            point.y >= b[3] - 0.015
          )
            distance = Math.min(distance, Math.max(0, point.y - b[3]));
      return distance;
    },
    sample(progress, skins) {
      if (!props.length) return;
      for (const skin of skins) {
        const positions = skin.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const p = skin.applyBoneTransform(
            i,
            new Vector3().fromBufferAttribute(positions, i),
          );
          for (const prop of props)
            for (const b of prop.boxes)
              if (inside(p, b))
                maximumPropPenetration = Math.max(
                  maximumPropPenetration,
                  Math.min(
                    p.x - b[0],
                    b[1] - p.x,
                    p.y - b[2],
                    b[3] - p.y,
                    p.z - b[4],
                    b[5] - p.z,
                  ),
                );
        }
      }
      for (const contact of contacts) {
        if (progress < contact.from || progress > contact.to) continue;
        let gap = Infinity;
        for (const { object, index, source } of contact.points) {
          const p = object.applyBoneTransform(index, source.clone());
          const axes = [0, 1, 2].filter((axis) => axis !== contact.axis);
          if (
            axes.every(
              (axis) =>
                p.getComponent(axis) >= contact.bounds[axis * 2] &&
                p.getComponent(axis) <= contact.bounds[axis * 2 + 1],
            )
          )
            gap = Math.min(
              gap,
              Math.abs(p.getComponent(contact.axis) - contact.plane),
            );
        }
        maximumSurfaceGap = Math.max(maximumSurfaceGap, gap);
      }
    },
    finish() {
      if (maximumPropPenetration > 0.015)
        throw new Error(
          `Body penetrates rigid equipment: ${maximumPropPenetration}`,
        );
      if (maximumSurfaceGap > 0.035)
        throw new Error(`Physical support gap: ${maximumSurfaceGap}`);
      return {
        maximumPropPenetrationMeters: maximumPropPenetration,
        maximumSurfaceGapMeters: maximumSurfaceGap,
        rigidProps: props.length,
      };
    },
  };
}

export { definitions as equipmentDefinitions };
