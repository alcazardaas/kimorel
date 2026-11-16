import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer, Vector3 } from 'three';
import { createSupportChecks, equipmentDefinitions } from './support-qa.mjs';
import regionDefinition from '../packages/schemas/src/muscle-regions.json' with { type: 'json' };
import motionProfiles from '../pipeline/character/motion-profiles.json' with { type: 'json' };
export const qaProfiles = motionProfiles;
export const requiredBones = [
  'root',
  'pelvis',
  'spine',
  'chest',
  'neck',
  'head',
  ...['left', 'right'].flatMap((side) =>
    ['thigh', 'shin', 'foot', 'upper_arm', 'forearm', 'hand'].map(
      (part) => `${side}_${part}`,
    ),
  ),
];
export function readGlb(bytes) {
  if (
    bytes.length < 20 ||
    bytes.readUInt32LE(0) !== 0x46546c67 ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length
  )
    throw new Error('Invalid GLB header or length');
  const length = bytes.readUInt32LE(12);
  if (
    bytes.readUInt32LE(16) !== 0x4e4f534a ||
    length % 4 ||
    20 + length > bytes.length
  )
    throw new Error('Invalid GLB JSON chunk');
  const document = JSON.parse(bytes.subarray(20, 20 + length).toString());
  const offset = 20 + length;
  if (
    offset + 8 > bytes.length ||
    bytes.readUInt32LE(offset + 4) !== 0x004e4942 ||
    offset + 8 + bytes.readUInt32LE(offset) !== bytes.length
  )
    throw new Error('Invalid GLB binary chunk');
  if (
    document.buffers?.some((buffer) => buffer.uri) ||
    document.images?.some((image) => image.uri)
  )
    throw new Error('External GLB dependencies are not permitted');
  return document;
}
export async function validateGlb(
  path,
  clipName,
  profileName = String(path).split('/').pop().replace('.glb', ''),
) {
  const profile = qaProfiles[profileName];
  if (!profile) throw new Error(`Unknown QA profile: ${profileName}`);
  clipName ??= profile.clip ?? 'rep';
  const motionKind = profile.kind ?? 'repetition';
  if (!['repetition', 'hold'].includes(motionKind))
    throw new Error('Unknown motion kind');
  const bytes = await readFile(path);
  const document = readGlb(bytes);
  for (const name of requiredBones)
    if (!document.nodes?.some((node) => node.name === name))
      throw new Error(`Missing bone: ${name}`);
  if (
    !document.skins?.length ||
    !document.meshes?.some((mesh) =>
      mesh.primitives.some(
        (primitive) =>
          primitive.attributes.JOINTS_0 !== undefined &&
          primitive.attributes.WEIGHTS_0 !== undefined,
      ),
    )
  )
    throw new Error('Missing skinned human mesh');
  const joints = new Set(document.skins.flatMap((skin) => skin.joints));
  for (const name of requiredBones)
    if (![...joints].some((joint) => document.nodes[joint]?.name === name))
      throw new Error(`Required bone is not a skin joint: ${name}`);
  const array = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const loaded = await new GLTFLoader().parseAsync(array, '');
  const clip = loaded.animations.find(
    (animation) => animation.name === clipName,
  );
  if (!clip || clip.duration <= 0)
    throw new Error(`Missing animation clip: ${clipName}`);
  const authoredClip = document.animations.find(
    (animation) => animation.name === clipName,
  );
  if (
    motionKind === 'hold' &&
    authoredClip.extras?.kimorelMotionKind !== 'hold'
  )
    throw new Error('Missing explicit isometric hold declaration');
  let hasMotion = false;
  for (const track of clip.tracks) {
    if (![...track.values, ...track.times].every(Number.isFinite))
      throw new Error('Non-finite animation values');
    const size = track.getValueSize();
    if (
      track.values.some(
        (value, index) => Math.abs(value - track.values[index % size]) > 1e-6,
      )
    )
      hasMotion = true;
    if (track.name.endsWith('.quaternion'))
      for (let i = 0; i < track.values.length; i += 4) {
        const norm = Math.hypot(...track.values.slice(i, i + 4));
        if (Math.abs(norm - 1) > 0.001)
          throw new Error(`Invalid rotation quaternion: ${track.name}`);
      }
    for (let i = 0; i < size; i++)
      if (
        Math.abs(
          track.values[i] - track.values[track.values.length - size + i],
        ) > 0.0001
      )
        throw new Error(`Loop discontinuity: ${track.name}`);
  }
  if (motionKind === 'hold' && hasMotion)
    throw new Error('Isometric hold must remain stable');
  if (motionKind === 'repetition' && !hasMotion)
    throw new Error('Repetition must contain authored motion');
  let vertexCount = 0;
  loaded.scene.traverse((object) => {
    for (const value of [
      ...object.position,
      ...object.quaternion,
      ...object.scale,
    ])
      if (!Number.isFinite(value)) throw new Error('Non-finite node transform');
    if (!object.isMesh) return;
    const position = object.geometry.getAttribute('position');
    vertexCount += position.count;
    if (![...position.array].every(Number.isFinite))
      throw new Error('Non-finite vertex');
    const index = object.geometry.index;
    if (!index) throw new Error('Expected indexed human surface');
    if (!object.isSkinnedMesh) return;
    const parent = Array.from({ length: position.count }, (_, i) => i);
    const find = (i) => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i),
        b = index.getX(i + 1),
        c = index.getX(i + 2);
      if (Math.max(a, b, c) >= position.count)
        throw new Error('Out-of-range mesh index');
      parent[find(b)] = find(a);
      parent[find(c)] = find(a);
    }
    if (new Set(parent.map((_, i) => find(i))).size !== 1)
      throw new Error('Disconnected human surface');
    const regions = object.geometry.getAttribute('_muscle_region');
    if (!regions || regions.count !== position.count)
      throw new Error('Missing muscle-region mapping');
    const definition = object.userData.kimorelMuscleRegions;
    if (
      definition?.version !== regionDefinition.version ||
      JSON.stringify(definition.codes) !==
        JSON.stringify(
          Object.fromEntries(
            Object.entries(regionDefinition.regions).map(([id, region]) => [
              id,
              region.code,
            ]),
          ),
        )
    )
      throw new Error('Muscle-region definition mismatch');
    const expected = new Set(
      Object.values(regionDefinition.regions).map((region) => region.code),
    );
    const seen = new Set();
    for (let i = 0; i < regions.count; i++) {
      const code = regions.getX(i);
      if (!Number.isInteger(code) || (code !== 0 && !expected.has(code)))
        throw new Error('Invalid muscle-region code');
      if (code) seen.add(code);
    }
    if (seen.size !== expected.size)
      throw new Error('Incomplete muscle-region coverage');
    const weights = object.geometry.getAttribute('skinWeight');
    const joints = object.geometry.getAttribute('skinIndex');
    for (let i = 0; i < weights.count; i++) {
      for (let k = 0; k < 4; k++) {
        if (
          weights.getComponent(i, k) < 0 ||
          weights.getComponent(i, k) > 1 ||
          joints.getComponent(i, k) >= object.skeleton.bones.length
        )
          throw new Error('Invalid skin influence');
      }
      const sum =
        weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i);
      if (!Number.isFinite(sum) || Math.abs(sum - 1) > 0.001)
        throw new Error('Invalid skin weights');
    }
  });
  const supportChecks = createSupportChecks(loaded.scene, profile);
  const mixer = new AnimationMixer(loaded.scene);
  const action = mixer.clipAction(clip).play();
  const contactBones = [...profile.contacts, ...(profile.pivots ?? [])].map(
    (name) => {
      const bone = loaded.scene.getObjectByName(name);
      if (!bone) throw new Error(`Missing contact marker: ${name}`);
      return bone;
    },
  );
  const phases = (profile.contactPhases ?? []).map((phase) => {
    mixer.setTime(clip.duration * phase.from);
    loaded.scene.updateMatrixWorld(true);
    return {
      ...phase,
      points: phase.bones.map((name) => {
        const bone = loaded.scene.getObjectByName(name);
        if (!bone) throw new Error(`Missing phase contact: ${name}`);
        return { bone, baseline: bone.getWorldPosition(new Vector3()) };
      }),
    };
  });
  mixer.setTime(0);
  loaded.scene.updateMatrixWorld(true);
  const baseline = contactBones.map((bone) =>
    bone.getWorldPosition(new Vector3()),
  );
  const rootBaseline = loaded.scene
    .getObjectByName('root')
    .getWorldPosition(new Vector3());
  const slides = (profile.slidingContacts ?? []).map((entry) => {
    const bone = loaded.scene.getObjectByName(entry.bone);
    if (!bone) throw new Error(`Missing sliding contact: ${entry.bone}`);
    return {
      ...entry,
      bone,
      from: new Vector3(...entry.from),
      to: new Vector3(...entry.to),
      skin: [],
    };
  });
  const pairs = (profile.pairedContacts ?? []).map((entry) => {
    const a = loaded.scene.getObjectByName(entry.a),
      b = loaded.scene.getObjectByName(entry.b);
    if (!a || !b) throw new Error('Missing paired contact');
    return { a, b, offset: new Vector3(...entry.offset) };
  });
  const supportSurfaces = (profile.supportSurfaces ?? []).map((entry) => {
    const bone = loaded.scene.getObjectByName(entry.bone);
    if (!bone) throw new Error('Missing elevated support bone');
    return { ...entry, bone };
  });
  const articulations = (profile.articulations ?? []).map((entry) => {
    const bone = loaded.scene.getObjectByName(entry.bone);
    if (!bone) throw new Error(`Missing articulation: ${entry.bone}`);
    return { ...entry, bone, baseline: [...bone.quaternion], maximum: 0 };
  });
  const inside = (point, bounds) =>
    point.x >= bounds[0] &&
    point.x <= bounds[1] &&
    point.y >= bounds[2] &&
    point.y <= bounds[3] &&
    point.z >= bounds[4] &&
    point.z <= bounds[5];
  const skinContacts = [];
  const skins = [];
  loaded.scene.traverse((object) => {
    if (!object.isSkinnedMesh) return;
    skins.push(object);
    object.skeleton.update();
    const positions = object.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) {
      const source = new Vector3().fromBufferAttribute(positions, index);
      const position = object.applyBoneTransform(index, source.clone());
      const patch =
        profile.skinPatches === undefined
          ? position.y < 0.035
          : profile.skinPatches.some(
              ({ bounds }) =>
                source.x >= bounds[0] &&
                source.x <= bounds[1] &&
                source.y >= bounds[2] &&
                source.y <= bounds[3] &&
                source.z >= bounds[4] &&
                source.z <= bounds[5],
            );
      for (const slide of slides)
        if (inside(source, slide.skinBounds))
          slide.skin.push({
            object,
            index,
            source,
            baseline: position.clone(),
          });
      if (patch)
        skinContacts.push({
          object,
          index,
          source,
          baseline: position.clone(),
        });
    }
  });
  if (profile.skinPatches?.length !== 0 && !skinContacts.length)
    throw new Error('No skin ground-contact vertices');
  if (slides.some((slide) => !slide.skin.length))
    throw new Error('Missing sliding skin support patch');
  if (!contactBones.length && !phases.length && !slides.length)
    throw new Error('QA profile has no declared support contacts');
  const equipment = profile.equipment
    ? ['left', 'right'].map((side) => {
        const hand = loaded.scene.getObjectByName(`${side}_hand`);
        const grip = loaded.scene.getObjectByName(`${side}_hand_grip`);
        const prop = loaded.scene.getObjectByName(`${side}_hand_dumbbell`);
        if (!grip || !prop || grip.parent !== hand || prop.parent !== grip)
          throw new Error('Missing stable equipment attachment');
        return { grip, prop };
      })
    : [];
  let soleDrift = 0,
    footDrift = 0,
    rootDrift = 0,
    handDrift = 0,
    penetration = 0,
    attachmentDrift = 0,
    maximumGroundGap = 0,
    supportDrift = 0,
    slidingBoneDrift = 0,
    slidingSkinDrift = 0,
    pairedDrift = 0;
  for (let i = 0; i <= 120; i++) {
    mixer.setTime((clip.duration * i) / 120);
    loaded.scene.updateMatrixWorld(true);
    for (const skin of skins) skin.skeleton.update();
    contactBones.forEach((bone, index) => {
      const drift = bone
        .getWorldPosition(new Vector3())
        .distanceTo(baseline[index]);
      if (bone.name.endsWith('_hand')) handDrift = Math.max(handDrift, drift);
      else if (bone.name.endsWith('foot'))
        footDrift = Math.max(footDrift, drift);
      else supportDrift = Math.max(supportDrift, drift);
    });
    for (const phase of phases) {
      if (i / 120 >= phase.from && i / 120 <= phase.to)
        for (const { bone, baseline: point } of phase.points) {
          const drift = bone.getWorldPosition(new Vector3()).distanceTo(point);
          if (bone.name.endsWith('_hand'))
            handDrift = Math.max(handDrift, drift);
          else supportDrift = Math.max(supportDrift, drift);
        }
    }
    for (const surface of supportSurfaces)
      if (
        i / 120 >= surface.from &&
        i / 120 <= surface.to &&
        Math.abs(
          surface.bone
            .getWorldPosition(new Vector3())
            .getComponent(surface.axis) - surface.height,
        ) > 0.005
      )
        throw new Error('Elevated support bone left its declared plane');
    const progress = (1 - Math.cos((2 * Math.PI * i) / 120)) / 2;
    for (const slide of slides) {
      const expected = slide.from.clone().lerp(slide.to, progress);
      const displacement = expected.clone().sub(slide.from);
      slidingBoneDrift = Math.max(
        slidingBoneDrift,
        slide.bone.getWorldPosition(new Vector3()).distanceTo(expected),
      );
      for (const contact of slide.skin) {
        const actual = contact.object.applyBoneTransform(
          contact.index,
          contact.source.clone(),
        );
        slidingSkinDrift = Math.max(
          slidingSkinDrift,
          actual.distanceTo(contact.baseline.clone().add(displacement)),
        );
      }
    }
    for (const pair of pairs)
      pairedDrift = Math.max(
        pairedDrift,
        pair.b
          .getWorldPosition(new Vector3())
          .sub(pair.a.getWorldPosition(new Vector3()))
          .distanceTo(pair.offset),
      );
    for (const articulation of articulations) {
      const dot = [...articulation.bone.quaternion].reduce(
        (sum, value, index) => sum + value * articulation.baseline[index],
        0,
      );
      articulation.maximum = Math.max(
        articulation.maximum,
        2 * Math.acos(Math.min(1, Math.abs(dot))),
      );
    }
    for (const contact of skinContacts) {
      const position = contact.object.applyBoneTransform(
        contact.index,
        contact.source.clone(),
      );
      soleDrift = Math.max(soleDrift, position.distanceTo(contact.baseline));
    }
    for (const { grip, prop } of equipment)
      attachmentDrift = Math.max(
        attachmentDrift,
        grip
          .getWorldPosition(new Vector3())
          .distanceTo(prop.getWorldPosition(new Vector3())),
      );
    loaded.scene.traverse((object) => {
      if (!object.isBone) return;
      const angle = 2 * Math.acos(Math.min(1, Math.abs(object.quaternion.w)));
      const limit =
        object.name.endsWith('_forearm') || object.name.endsWith('_shin')
          ? 2.95
          : Math.PI;
      if (!Number.isFinite(angle) || angle > limit)
        throw new Error(`Joint rotation limit: ${object.name}`);
    });
    // Sample every fourth frame over every actual skinned vertex, not only joint centers.
    if (i % 4 === 0) {
      let minimumHeight = Infinity;
      for (const skin of skins) {
        const positions = skin.geometry.getAttribute('position');
        for (let j = 0; j < positions.count; j++) {
          const p = skin.applyBoneTransform(
            j,
            new Vector3().fromBufferAttribute(positions, j),
          );
          if (![...p].every(Number.isFinite))
            throw new Error('Non-finite skinned vertex');
          penetration = Math.max(penetration, -p.y);
          minimumHeight = Math.min(
            minimumHeight,
            supportChecks.distanceToSupport(p),
          );
        }
      }
      maximumGroundGap = Math.max(maximumGroundGap, minimumHeight);
      supportChecks.sample(i / 120, skins);
    }
    rootDrift = Math.max(
      rootDrift,
      loaded.scene
        .getObjectByName('root')
        .getWorldPosition(new Vector3())
        .distanceTo(rootBaseline),
    );
  }
  action.stop();
  mixer.uncacheRoot(loaded.scene);
  for (const articulation of articulations)
    if (articulation.maximum < articulation.minRadians)
      throw new Error(
        `Missing authored articulation: ${articulation.bone.name}`,
      );
  if (slidingBoneDrift > 0.005 || slidingSkinDrift > 0.007)
    throw new Error(
      `Sliding contact drift: ${slidingBoneDrift}/${slidingSkinDrift}`,
    );
  if (pairedDrift > 0.005)
    throw new Error(`Paired contact separation: ${pairedDrift}`);
  if (
    footDrift > 0.005 ||
    supportDrift > 0.005 ||
    handDrift > 0.005 ||
    rootDrift > 0.001 ||
    soleDrift > 0.007 ||
    penetration > 0.015 ||
    attachmentDrift > 0.001 ||
    maximumGroundGap > 0.035
  )
    throw new Error(
      `Contact/root/skin/ground/equipment drift: ${footDrift}/${handDrift}/${rootDrift}/${soleDrift}/${penetration}/${attachmentDrift}/${maximumGroundGap}/${supportDrift}`,
    );
  const supportReport = supportChecks.finish();
  return {
    ...supportReport,
    bytes: bytes.length,
    vertexCount,
    bones: requiredBones.length,
    clip: clip.name,
    kind: motionKind,
    slidingBoneDriftMeters: slidingBoneDrift,
    slidingSkinDriftMeters: slidingSkinDrift,
    pairedContactDriftMeters: pairedDrift,
    articulations: Object.fromEntries(
      articulations.map((entry) => [entry.bone.name, entry.maximum]),
    ),
    duration: clip.duration,
    footDriftMeters: footDrift,
    rootDriftMeters: rootDrift,
    soleDriftMeters: soleDrift,
    handDriftMeters: handDrift,
    groundPenetrationMeters: penetration,
    equipmentAttachmentDriftMeters: attachmentDrift,
    maximumGroundGapMeters: maximumGroundGap,
    supportDriftMeters: supportDrift,
    profile: profileName,
    clinicalValidation: false,
  };
}
export async function validateEquipment(
  path = 'assets/equipment/dumbbell.glb',
) {
  const bytes = await readFile(path);
  const doc = readGlb(bytes);
  if (doc.skins?.length || doc.animations?.length || doc.nodes.length !== 1)
    throw new Error(
      'Standalone equipment must not contain unused character data',
    );
  const loaded = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  const id = String(path).split('/').pop().replace('.glb', '');
  if (equipmentDefinitions[id]) {
    const mesh = loaded.scene.getObjectByName(id);
    if (!mesh?.isMesh || mesh.isSkinnedMesh)
      throw new Error('Missing rigid equipment geometry');
    const position = mesh.geometry.getAttribute('position');
    if (![...position.array].every(Number.isFinite))
      throw new Error('Invalid equipment vertices');
    mesh.geometry.computeBoundingBox();
    const size = mesh.geometry.boundingBox.getSize(new Vector3());
    if (
      size
        .toArray()
        .some(
          (v, axis) =>
            Math.abs(v - equipmentDefinitions[id].dimensions[axis]) > 0.0001,
        )
    )
      throw new Error('Invalid equipment meter scale');
    return {
      bytes: bytes.length,
      vertices: position.count,
      dimensionsMeters: size.toArray(),
    };
  }
  const mesh = loaded.scene.getObjectByName('dumbbell');
  if (!mesh?.isMesh) throw new Error('Missing dumbbell mesh');
  const position = mesh.geometry.getAttribute('position');
  if (!position.count || ![...position.array].every(Number.isFinite))
    throw new Error('Invalid equipment vertices');
  mesh.geometry.computeBoundingBox();
  const size = mesh.geometry.boundingBox.getSize(new Vector3());
  if (Math.abs(size.x - 0.23) > 0.0001 || Math.abs(size.y - 0.14) > 0.0001)
    throw new Error('Invalid equipment meter scale');
  return {
    bytes: bytes.length,
    vertices: position.count,
    dimensionsMeters: size.toArray(),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const paths = process.argv[2]
    ? [process.argv[2]]
    : Object.keys(qaProfiles).map((id) => `assets/exercises/${id}.glb`);
  if (!process.argv[2]) {
    console.log(JSON.stringify(await validateEquipment(), null, 2));
    for (const id of Object.keys(equipmentDefinitions))
      console.log(
        JSON.stringify(
          await validateEquipment(`assets/equipment/${id}.glb`),
          null,
          2,
        ),
      );
  }
  for (const path of paths)
    console.log(JSON.stringify(await validateGlb(path), null, 2));
}
