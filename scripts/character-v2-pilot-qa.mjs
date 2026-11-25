/** Independent semantic/contact proof of real exported pilot clips, not anatomy approval. */
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { AnimationMixer, LoopOnce, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readGlb } from './glb-qa.mjs';
import { floatAccessor } from './character-v2-correctives-qa.mjs';
import {
  maskBinding,
  serializeSparseMask,
} from '../packages/schemas/dist/muscle-masks-v2.js';
import { publishMaskBundle } from './character-v2-mask-publication.mjs';

export const pilotFolder = 'pipeline/character-v2/exercise-pilot/';
export const pilotIds = [
  'bodyweight-squat',
  'push-up',
  'dumbbell-shoulder-press',
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function load(bytes) {
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
}
function meshOf(loaded) {
  const meshes = loaded.scene.getObjectsByProperty('isSkinnedMesh', true);
  assert.equal(meshes.length, 1, 'Expected one body');
  return meshes[0];
}
function vertex(mesh, i) {
  return mesh
    .getVertexPosition(i, new Vector3())
    .applyMatrix4(mesh.matrixWorld);
}
function cylinderDistance(point, x0, x1, radius) {
  const a = Math.abs(point.x - (x0 + x1) / 2) - (x1 - x0) / 2;
  const b = Math.hypot(point.y, point.z) - radius;
  return (
    Math.hypot(Math.max(0, a), Math.max(0, b)) + Math.min(Math.max(a, b), 0)
  );
}
function equipmentDistance(point) {
  return Math.min(
    cylinderDistance(point, -0.115, -0.065, 0.07),
    cylinderDistance(point, -0.065, 0.065, 0.016),
    cylinderDistance(point, 0.065, 0.115, 0.07),
  );
}
function armDomain(point) {
  const x = Math.abs(point.x),
    y = point.y,
    z = Math.abs(point.z);
  const smooth = (a, b, v) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const sign = point.x >= 0 ? 1 : -1;
  const chain = [
    [0.08, 1.43, 0],
    [0.22, 1.43, 0],
    [0.36, 1.17, 0],
    [0.43, 0.94, 0],
    [0.45, 0.89, 0],
  ].map((v) => new Vector3(sign * v[0], v[1], v[2]));
  const distances = chain.slice(0, -1).map((a, i) => {
    const d = chain[i + 1].clone().sub(a);
    const t = Math.max(
      0,
      Math.min(1, point.clone().sub(a).dot(d) / d.lengthSq()),
    );
    return point.distanceTo(a.clone().addScaledVector(d, t));
  });
  const medial = Math.max(0.12, 0.16 - 0.08 * smooth(1.24, 1.38, y));
  const radial = Math.min(
    ...distances.map((d, i) => d / [0.13, 0.17, 0.13, 0.13][i]),
  );
  const chestDistance = Math.hypot(
    point.x,
    point.z,
    y - Math.max(1.14, Math.min(1.5, y)),
  );
  const armGate = smooth(medial, medial + 0.04, x) * (1 - smooth(1.5, 1.54, y));
  if (chestDistance >= 0.28 && (armGate === 0 || radial >= 1)) return 0;
  return (
    smooth(medial - 0.04, medial, x) *
    (1 - smooth(0.55, 0.6, x)) *
    smooth(0.8, 0.86, y) *
    (1 - smooth(1.54, 1.62, y)) *
    (1 - smooth(0.18, 0.24, z)) *
    (1 - smooth(1, 1.3, radial))
  );
}
function proximalPalmSupport(point) {
  const smooth = (a, b, v) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  return (
    smooth(0.89, 0.925, point.y) *
    (1 - smooth(0.99, 1.02, point.y)) *
    smooth(0.36, 0.4, Math.abs(point.x)) *
    (1 - smooth(0.5, 0.54, Math.abs(point.x))) *
    (1 - smooth(0.07, 0.11, Math.abs(point.z)))
  );
}
function semanticWeights(weights) {
  const result = {};
  for (const [name, weight] of Object.entries(weights)) {
    let semantic = /_(index|middle|ring|little|thumb)_[123]$/.test(name)
      ? name.split('_')[0] + '_hand'
      : name;
    if (!/^(left|right)_(clavicle|upper_arm|forearm|hand)$/.test(semantic))
      semantic = 'chest';
    result[semantic] = (result[semantic] ?? 0) + weight;
  }
  return result;
}
export async function validatePilot(exercise, bytes) {
  assert(pilotIds.includes(exercise), 'Unknown pilot');
  const contract = JSON.parse(
    await readFile(pilotFolder + 'retarget-contract.json', 'utf8'),
  );
  const rootOffset = new Vector3(
    ...contract.contactCorrection.rootOffsetMeters,
  );
  assert(
    Math.abs(rootOffset.x) < 1e-9 &&
      Math.abs(rootOffset.z) < 1e-9 &&
      Math.abs(rootOffset.y) < 0.01,
    'Excessive floor datum correction',
  );
  const referenceBytes = await readFile(pilotFolder + 'character.glb');
  const frozenBytes = await readFile(
    'pipeline/character-v2/correctives/character-v2-correctives.glb',
  );
  const neutral = await load(referenceBytes),
    frozen = await load(frozenBytes);
  const reference = meshOf(neutral),
    old = meshOf(frozen);
  assert.equal(
    reference.geometry.attributes.position.count,
    26939,
    'Vertex domain changed',
  );
  assert.deepEqual(
    reference.geometry.attributes.position.array,
    old.geometry.attributes.position.array,
    'Neutral geometry/order changed',
  );
  assert.deepEqual(
    reference.geometry.index.array,
    old.geometry.index.array,
    'Topology/order changed',
  );
  const doc = readGlb(bytes);
  for (const skin of doc.skins)
    assert.equal(skin.joints.length, 50, 'Semantic rig changed');
  const namedWeights = (body, i) => {
    const result = {};
    for (let slot = 0; slot < 4; slot++) {
      const weight = body.geometry.attributes.skinWeight.array[i * 4 + slot];
      if (weight > 0)
        result[
          body.skeleton.bones[
            body.geometry.attributes.skinIndex.array[i * 4 + slot]
          ].name
        ] = weight;
    }
    return Object.fromEntries(Object.entries(result).sort());
  };
  assert.equal(contract.nativeWeightProof.file, 'native-weight-proof.json');
  const nativeBytes = await readFile(pilotFolder + 'native-weight-proof.json');
  const nativeProof = JSON.parse(nativeBytes);
  const manifest = JSON.parse(
    await readFile(pilotFolder + 'manifest.json', 'utf8'),
  );
  assert.equal(
    sha(nativeBytes),
    contract.nativeWeightProof.sha256,
    'Native weight proof hash mismatch',
  );
  assert.equal(
    sha(nativeBytes),
    manifest.nativeWeightProofSha256,
    'Manifest native weight proof hash mismatch',
  );
  assert.equal(
    nativeProof.sourceBlendSha256,
    sha(await readFile(pilotFolder + 'source.blend')),
    'Native weight proof source changed',
  );
  assert.equal(
    nativeProof.schemaVersion,
    'kimorel.native-weight-proof/v1-draft',
  );
  assert.equal(
    contract.nativeWeightProof.sourceBlendSha256,
    nativeProof.sourceBlendSha256,
  );
  assert.equal(
    manifest.generatorSha256,
    sha(await readFile('pipeline/character-v2/build_exercise_pilot.py')),
    'Native proof generator source changed',
  );
  assert.equal(
    manifest.helperSha256,
    sha(await readFile('pipeline/character-v2/pilot_motion.py')),
    'Native proof helper source changed',
  );
  assert.equal(nativeProof.generatorSha256, manifest.generatorSha256);
  assert.equal(nativeProof.helperSha256, manifest.helperSha256);
  const nativeRecords = new Map();
  for (const record of nativeProof.records) {
    const key = record.position.join(',');
    assert(!nativeRecords.has(key), 'Ambiguous native weight proof position');
    const point = new Vector3(...record.position);
    const digits = Object.keys(record.weights).some((name) =>
      /_(index|middle|ring|little|thumb)_[123]$/.test(name),
    );
    assert.equal(
      record.active,
      armDomain(point) > 0 && (proximalPalmSupport(point) > 0 || !digits),
      'Native weight proof active domain changed',
    );
    nativeRecords.set(key, record);
  }
  let nativeWeightVerticesVerified = 0;
  const verifiedNativePositions = new Set();
  for (let i = 0; i < reference.geometry.attributes.position.count; i++) {
    const point = new Vector3().fromBufferAttribute(
      reference.geometry.attributes.position,
      i,
    );
    const record = nativeRecords.get(point.toArray().join(','));
    assert(record, 'Native weight proof exact position missing');
    if (!record.active) continue;
    const entries = Object.entries(record.weights).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    assert(
      entries.length > 0 && entries.length <= 4 && Math.abs(total - 1) < 1e-6,
      'Native weight proof normalization invalid',
    );
    const actual = namedWeights(reference, i);
    assert.deepEqual(
      Object.keys(actual),
      entries.map(([name]) => name),
      'Native named weights mismatch',
    );
    for (const [name, weight] of entries)
      assert(
        weight > 0 && Math.abs(actual[name] - weight / total) < 1e-7,
        'Native named weights mismatch',
      );
    nativeWeightVerticesVerified++;
    verifiedNativePositions.add(point.toArray().join(','));
  }
  assert.equal(
    verifiedNativePositions.size,
    nativeProof.records.filter((record) => record.active).length,
    'Native proof active vertex domain incomplete',
  );
  let preservedRemoteWeightVertices = 0;
  for (let i = 0; i < reference.geometry.attributes.position.count; i++) {
    const point = new Vector3().fromBufferAttribute(
      reference.geometry.attributes.position,
      i,
    );
    if (armDomain(point) === 0 && point.y >= 0.25) {
      assert.deepEqual(
        namedWeights(reference, i),
        namedWeights(old, i),
        'Remote skin field changed',
      );
      preservedRemoteWeightVertices++;
    }
  }
  const loaded = await load(bytes),
    mesh = meshOf(loaded);
  assert.deepEqual(
    mesh.geometry.attributes.position.array,
    reference.geometry.attributes.position.array,
    'Exercise bind geometry changed',
  );
  assert.deepEqual(
    mesh.geometry.index.array,
    reference.geometry.index.array,
    'Exercise topology changed',
  );
  for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
    const point = new Vector3().fromBufferAttribute(
      mesh.geometry.attributes.position,
      i,
    );
    const record = nativeRecords.get(point.toArray().join(','));
    if (record.active)
      assert.deepEqual(
        namedWeights(mesh, i),
        namedWeights(reference, i),
        'Native named weights mismatch',
      );
  }
  const clip = loaded.animations.find((c) => c.name === 'rep');
  assert.equal(
    loaded.animations.length,
    1,
    'Expected only real exercise rep, not stress aliases',
  );
  assert(
    clip && Math.abs(clip.duration - 4) < 1e-5,
    'Expected four-second exercise rep',
  );
  for (const primitive of doc.meshes.flatMap((m) => m.primitives)) {
    for (const key of ['POSITION', 'WEIGHTS_0'])
      if (primitive.attributes[key] !== undefined)
        floatAccessor(bytes, doc, primitive.attributes[key]);
  }
  const names = new Map(mesh.skeleton.bones.map((b) => [b.name, b]));
  assert.equal(names.size, 50, 'Duplicate semantic joints');
  const restRotations = new Map(
    reference.skeleton.bones.map((b) => [
      b.name,
      b.getWorldQuaternion(new Quaternion()),
    ]),
  );
  const targets = doc.meshes.find((m) => m.extras?.targetNames)?.extras
    .targetNames;
  assert.deepEqual(targets?.slice().sort(), [
    'hip-flexion-patch',
    'shoulder-elevation-patch',
  ]);
  const position = reference.geometry.attributes.position;
  const skinIndices = reference.geometry.attributes.skinIndex,
    weights = reference.geometry.attributes.skinWeight;
  const groups = Object.fromEntries(
    ['left_foot', 'right_foot', 'left_hand', 'right_hand', 'head'].map(
      (name) => [name, []],
    ),
  );
  for (let i = 0; i < position.count; i++) {
    let best = -1,
      bone;
    for (let j = 0; j < 4; j++) {
      const w = weights.array[i * 4 + j];
      assert(Number.isFinite(w) && w >= 0 && w <= 1, 'Invalid skin weight');
      if (w > best) {
        best = w;
        bone = reference.skeleton.bones[skinIndices.array[i * 4 + j]].name;
      }
    }
    if (bone === 'head') groups.head.push(i);
    for (const side of ['left', 'right']) {
      if (
        position.getY(i) < 0.14 &&
        position.getX(i) * (side === 'left' ? 1 : -1) > 0.04
      )
        groups[side + '_foot'].push(i);
      if (
        bone === side + '_hand' ||
        new RegExp(`^${side}_(index|middle|ring|little|thumb)_[123]$`).test(
          bone,
        )
      )
        groups[side + '_hand'].push(i);
    }
  }
  assert(
    Object.values(groups).every((v) => v.length > 20),
    'Missing actual support/head surfaces',
  );
  const mixer = new AnimationMixer(loaded.scene),
    action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const edges = [],
    seenEdges = new Set();
  const triangles = reference.geometry.index.array;
  for (let face = 0; face < triangles.length; face += 3)
    for (let corner = 0; corner < 3; corner++) {
      const a = triangles[face + corner],
        b = triangles[face + ((corner + 1) % 3)];
      const key = Math.min(a, b) + ':' + Math.max(a, b);
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      const rest = new Vector3()
        .fromBufferAttribute(position, a)
        .distanceTo(new Vector3().fromBufferAttribute(position, b));
      if (rest >= 0.001) edges.push({ a, b, rest });
    }
  const hipIndex = mesh.morphTargetDictionary['hip-flexion-patch'];
  const oldHipIndex = old.morphTargetDictionary['hip-flexion-patch'];
  const hipDelta = mesh.geometry.morphAttributes.position[hipIndex];
  const oldHipDelta = old.geometry.morphAttributes.position[oldHipIndex];
  let hipGradient = 0,
    hipEnergy = 0,
    oldHipEnergy = 0;
  for (let i = 0; i < position.count; i++) {
    hipEnergy += new Vector3().fromBufferAttribute(hipDelta, i).lengthSq();
    oldHipEnergy += new Vector3()
      .fromBufferAttribute(oldHipDelta, i)
      .lengthSq();
  }
  for (const edge of edges)
    hipGradient = Math.max(
      hipGradient,
      new Vector3()
        .fromBufferAttribute(hipDelta, edge.a)
        .distanceTo(new Vector3().fromBufferAttribute(hipDelta, edge.b)) /
        edge.rest,
    );
  assert(
    hipGradient <= 2.001,
    'Hip corrective displacement gradient exceeds bound',
  );
  assert(
    hipEnergy >= oldHipEnergy * 0.2,
    'Hip corrective was zeroed or lost meaningful energy',
  );
  let hipSupport = new Set();
  for (let i = 0; i < position.count; i++)
    if (new Vector3().fromBufferAttribute(oldHipDelta, i).lengthSq() > 1e-20)
      hipSupport.add(i);
  for (let ring = 0; ring < 2; ring++) {
    const expanded = new Set(hipSupport);
    for (let face = 0; face < triangles.length; face += 3) {
      const vertices = [
        triangles[face],
        triangles[face + 1],
        triangles[face + 2],
      ];
      if (vertices.some((i) => hipSupport.has(i)))
        for (const i of vertices) expanded.add(i);
    }
    hipSupport = expanded;
  }
  for (let i = 0; i < position.count; i++) {
    if (!hipSupport.has(i))
      assert(
        new Vector3()
          .fromBufferAttribute(hipDelta, i)
          .distanceTo(new Vector3().fromBufferAttribute(oldHipDelta, i)) < 1e-8,
        'Hip corrective escaped declared support',
      );
    const previous = namedWeights(old, i),
      current = namedWeights(mesh, i);
    if (
      Object.keys(previous).some((name) =>
        /_(index|middle|ring|little|thumb)_[123]$/.test(name),
      )
    ) {
      if (
        proximalPalmSupport(new Vector3().fromBufferAttribute(position, i)) ===
        0
      )
        assert.deepEqual(
          current,
          previous,
          'Distal digit skin weights changed',
        );
    } else if (
      armDomain(new Vector3().fromBufferAttribute(position, i)) === 1
    ) {
      assert(
        Object.keys(current).every(
          (name) =>
            name === 'chest' ||
            /^(left|right)_(clavicle|upper_arm|forearm|hand)$/.test(name),
        ),
        'Whole-arm core retains unrelated torso influence',
      );
      if (Math.abs(position.getX(i)) >= 0.28)
        assert(
          !('chest' in current),
          'Whole-arm limb retains stationary trunk influence',
        );
    }
    assert(
      Object.values(current).every(
        (value) => Number.isFinite(value) && value > 0,
      ) &&
        Object.keys(current).length <= 4 &&
        Math.abs(Object.values(current).reduce((a, b) => a + b, 0) - 1) < 1e-6,
      'Invalid whole-arm normalized sparse weights',
    );
    if (
      armDomain(new Vector3().fromBufferAttribute(position, i)) === 0 &&
      position.getY(i) >= 0.25
    )
      assert.deepEqual(current, previous, 'Remote exercise skin field changed');
  }
  const changedProximalDigitIndices = [];
  const distalDigitIndices = [];
  let preservedDistalDigitVertices = 0;
  for (let i = 0; i < position.count; i++) {
    const previous = namedWeights(old, i);
    if (
      !Object.keys(previous).some((name) =>
        /_(index|middle|ring|little|thumb)_[123]$/.test(name),
      )
    )
      continue;
    const support = proximalPalmSupport(
      new Vector3().fromBufferAttribute(position, i),
    );
    if (support === 0) {
      preservedDistalDigitVertices++;
      distalDigitIndices.push(i);
    }
    if (JSON.stringify(previous) !== JSON.stringify(namedWeights(mesh, i)))
      changedProximalDigitIndices.push(i);
  }
  const semantic = Array.from({ length: position.count }, (_, i) =>
    semanticWeights(namedWeights(mesh, i)),
  );
  const active = Array.from(
    { length: position.count },
    (_, i) =>
      armDomain(new Vector3().fromBufferAttribute(position, i)) > 0 &&
      (proximalPalmSupport(new Vector3().fromBufferAttribute(position, i)) >
        0 ||
        !Object.keys(namedWeights(old, i)).some((name) =>
          /_(index|middle|ring|little|thumb)_[123]$/.test(name),
        )),
  );
  let armGradient = 0;
  for (const edge of edges)
    if (active[edge.a] || active[edge.b]) {
      const left = semantic[edge.a],
        right = semantic[edge.b];
      const difference = [
        ...new Set([...Object.keys(left), ...Object.keys(right)]),
      ].reduce(
        (sum, name) => sum + Math.abs((left[name] ?? 0) - (right[name] ?? 0)),
        0,
      );
      armGradient = Math.max(armGradient, difference / edge.rest);
    }
  assert(
    armGradient <= 24.01,
    'Whole-arm semantic adjacency gradient exceeds bound: ' + armGradient,
  );
  const shoulderIndex = mesh.morphTargetDictionary['shoulder-elevation-patch'];
  const shoulderDelta = mesh.geometry.morphAttributes.position[shoulderIndex];
  let shoulderGradient = 0,
    shoulderEnergy = 0;
  const shoulderSupport = new Set();
  for (let i = 0; i < position.count; i++) {
    shoulderEnergy += new Vector3()
      .fromBufferAttribute(shoulderDelta, i)
      .lengthSq();
    const point = new Vector3().fromBufferAttribute(position, i);
    if (
      Math.min(
        point.distanceTo(new Vector3(0.22, 1.43, 0)),
        point.distanceTo(new Vector3(-0.22, 1.43, 0)),
      ) < 0.21
    )
      shoulderSupport.add(i);
  }
  for (let ring = 0; ring < 2; ring++) {
    const expanded = new Set(shoulderSupport);
    for (let face = 0; face < triangles.length; face += 3) {
      const vertices = [
        triangles[face],
        triangles[face + 1],
        triangles[face + 2],
      ];
      if (vertices.some((i) => shoulderSupport.has(i)))
        for (const i of vertices) expanded.add(i);
    }
    for (const i of expanded) shoulderSupport.add(i);
  }
  for (const edge of edges)
    shoulderGradient = Math.max(
      shoulderGradient,
      new Vector3()
        .fromBufferAttribute(shoulderDelta, edge.a)
        .distanceTo(new Vector3().fromBufferAttribute(shoulderDelta, edge.b)) /
        edge.rest,
    );
  for (let i = 0; i < position.count; i++)
    if (!shoulderSupport.has(i))
      assert(
        new Vector3().fromBufferAttribute(shoulderDelta, i).length() < 1e-8,
        'Shoulder corrective escaped declared support',
      );
  assert(
    shoulderGradient <= 2.001,
    'Shoulder corrective displacement gradient exceeds bound: ' +
      shoulderGradient,
  );
  const shoulderContract =
    contract.contactCorrection.shoulderDisplacementRegularization;
  assert(
    shoulderContract.energyBefore > 1e-8 &&
      shoulderEnergy >= shoulderContract.energyBefore * 0.2,
    'Shoulder corrective was zeroed or lost meaningful energy',
  );

  const report = {
    exercise,
    nativeWeightVerticesVerified,
    nativeWeightProofSha256: sha(nativeBytes),
    preservedRemoteWeightVertices,
    changedProximalDigitIndices,
    changedProximalDigitVertexCount: changedProximalDigitIndices.length,
    preservedDistalDigitVertices,
    distalDigitSkinTravelMeters: 0,
    wholeArmSemanticGradient: armGradient,
    shoulderDisplacementGradient: shoulderGradient,
    shoulderCorrectionEnergyRatio:
      shoulderEnergy / shoulderContract.energyBefore,
    hipDisplacementGradient: hipGradient,
    hipCorrectionEnergyRatio: hipEnergy / oldHipEnergy,
    canonicalJointErrorMeters: 0,
    declaredRootOffsetMeters: rootOffset.toArray(),
    contactAdjustmentMeters: 0,
    rawCanonicalJointDifferenceMeters: 0,
    canonicalRotationError: 0,
    morphError: 0,
    movementMeters: 0,
    loopErrorMeters: 0,
    contacts: {},
    headEquipmentClearanceMeters: null,
    gripSurfaceDistanceMeters: {},
    samples: 121,
    anatomicalValidation: false,
    wholeMeshEdgeStretch: {
      maximumRatio: 0,
      threshold: 6,
      minimumRestEdgeMeters: 0.001,
      testedEdges: edges.length,
      worst: null,
    },
  };
  const contacts = [
    'left_foot',
    'right_foot',
    ...(exercise === 'push-up' ? ['left_hand', 'right_hand'] : []),
  ];
  const surfaces = Object.fromEntries(contacts.map((n) => [n, []]));
  const sourceFrames = contract.exercises[exercise].canonicalFrames;
  assert.equal(sourceFrames.length, 121);
  let firstPositions;
  const props = ['left_hand_dumbbell', 'right_hand_dumbbell'].map((n) =>
    loaded.scene.getObjectByName(n),
  );
  if (exercise === 'dumbbell-shoulder-press')
    assert(props.every(Boolean), 'Missing two real dumbbells');
  for (let index = 0; index < sourceFrames.length; index++) {
    const frame = sourceFrames[index],
      time = frame.time;
    action.paused = false;
    action.enabled = true;
    mixer.setTime(time);
    loaded.scene.updateMatrixWorld(true);
    mesh.skeleton.update();
    const points = Array.from({ length: position.count }, (_, i) =>
      vertex(mesh, i),
    );
    if (firstPositions)
      for (const i of distalDigitIndices)
        report.distalDigitSkinTravelMeters = Math.max(
          report.distalDigitSkinTravelMeters,
          points[i].distanceTo(firstPositions[i]),
        );
    assert(
      points.every((v) => v.toArray().every(Number.isFinite)),
      'Non-finite actual skin',
    );
    for (const edge of edges) {
      const length = points[edge.a].distanceTo(points[edge.b]),
        ratio = length / edge.rest;
      if (ratio > report.wholeMeshEdgeStretch.maximumRatio) {
        report.wholeMeshEdgeStretch.maximumRatio = ratio;
        report.wholeMeshEdgeStretch.worst = {
          vertices: [edge.a, edge.b],
          time,
          restMeters: edge.rest,
          posedMeters: length,
          neutralPosition: new Vector3()
            .fromBufferAttribute(position, edge.a)
            .toArray(),
        };
      }
    }
    const expectedJoints = { ...frame.joints, ...frame.contactJoints };
    for (const [name, expected] of Object.entries(expectedJoints)) {
      const bone = names.get(name);
      assert(bone, 'Missing semantic joint');
      const actual = bone.getWorldPosition(new Vector3());
      report.canonicalJointErrorMeters = Math.max(
        report.canonicalJointErrorMeters,
        actual.distanceTo(new Vector3(...expected.position).add(rootOffset)),
      );
      const original = new Vector3(...frame.joints[name].position);
      report.contactAdjustmentMeters = Math.max(
        report.contactAdjustmentMeters,
        new Vector3(...expected.position).distanceTo(original),
      );
      report.rawCanonicalJointDifferenceMeters = Math.max(
        report.rawCanonicalJointDifferenceMeters,
        actual.distanceTo(original),
      );
      const delta = bone
        .getWorldQuaternion(new Quaternion())
        .multiply(restRotations.get(name).clone().invert());
      report.canonicalRotationError = Math.max(
        report.canonicalRotationError,
        1 - Math.abs(delta.dot(new Quaternion(...expected.rotation))),
      );
      const start = (
        sourceFrames[0].contactJoints[name] ?? sourceFrames[0].joints[name]
      ).position;
      report.movementMeters = Math.max(
        report.movementMeters,
        actual.distanceTo(new Vector3(...start).add(rootOffset)),
      );
    }
    for (const [name, expected] of Object.entries(frame.morphWeights)) {
      const actual =
        mesh.morphTargetInfluences[mesh.morphTargetDictionary[name]];
      report.morphError = Math.max(
        report.morphError,
        Math.abs(actual - expected),
      );
    }
    for (const contact of contacts)
      surfaces[contact].push(
        Math.min(...groups[contact].map((i) => points[i].y)),
      );
    if (exercise === 'dumbbell-shoulder-press') {
      for (const [side, prop] of ['left', 'right'].map((side, i) => [
        side,
        props[i],
      ])) {
        const expected = frame.joints[side + '_hand'];
        const center = new Vector3(
          side === 'left' ? 0.02 : -0.02,
          -0.055,
          0.005,
        )
          .applyQuaternion(new Quaternion(...expected.rotation))
          .add(new Vector3(...expected.position))
          .add(rootOffset);
        assert(
          prop.getWorldPosition(new Vector3()).distanceTo(center) < 2e-5,
          'Dumbbell detached from canonical palm grip',
        );
        const inverse = prop.matrixWorld.clone().invert();
        const hand = groups[side + '_hand'].map((i) =>
          points[i].clone().applyMatrix4(inverse),
        );
        const grip = Math.min(
          ...hand
            .filter((v) => Math.abs(v.x) < 0.065)
            .map((v) => Math.abs(Math.hypot(v.y, v.z) - 0.016)),
        );
        assert(Number.isFinite(grip), 'No actual surface near handle');
        report.gripSurfaceDistanceMeters[side] = Math.max(
          report.gripSurfaceDistanceMeters[side] ?? 0,
          grip,
        );
        const clearance = Math.min(
          ...groups.head.map((i) =>
            equipmentDistance(points[i].clone().applyMatrix4(inverse)),
          ),
        );
        report.headEquipmentClearanceMeters = Math.min(
          report.headEquipmentClearanceMeters ?? Infinity,
          clearance,
        );
      }
    }
    if (index === 0 || index === 120) {
      if (!index) firstPositions = points;
      else
        report.loopErrorMeters = Math.max(
          ...points.map((v, i) => v.distanceTo(firstPositions[i])),
        );
    }
  }
  assert(
    report.canonicalJointErrorMeters < 2e-5,
    'Retarget joint trajectory/rest basis mismatch',
  );
  assert(
    report.contactAdjustmentMeters <= (exercise === 'push-up' ? 0.012 : 1e-9),
    'Undeclared or excessive contact IK correction',
  );
  assert(
    report.canonicalRotationError < 2e-5,
    'Retarget orientation/rest basis mismatch',
  );
  assert(
    report.morphError < 2e-5,
    'Corrective influence not derived from actual exercise pose',
  );
  assert(report.movementMeters > 0.1, 'Exercise motion is static');
  assert(report.loopErrorMeters < 2e-5, 'Exercise does not loop');
  assert(
    report.wholeMeshEdgeStretch.maximumRatio <=
      report.wholeMeshEdgeStretch.threshold,
    'Whole-mesh skinned edge elongation exceeds engineering bound: ' +
      JSON.stringify(report.wholeMeshEdgeStretch),
  );
  for (const contact of contacts) {
    const values = surfaces[contact],
      minimum = Math.min(...values),
      maximum = Math.max(...values);
    report.contacts[contact] = {
      minimumY: minimum,
      maximumY: maximum,
      driftMeters: maximum - minimum,
    };
  }
  if (process.env.PILOT_CONTACT_DIAGNOSTICS)
    console.log(JSON.stringify(report));
  for (const [contact, value] of Object.entries(report.contacts))
    assert(
      value.minimumY >= -0.008 &&
        value.maximumY <= 0.008 &&
        value.driftMeters < 0.008,
      `Actual ${contact} surface loses floor contact: ${value.minimumY}..${value.maximumY}`,
    );
  if (exercise === 'dumbbell-shoulder-press') {
    assert(
      Object.values(report.gripSurfaceDistanceMeters).every((d) => d < 0.008),
      'Actual hand surface detached from handle',
    );
    assert(
      report.headEquipmentClearanceMeters > 0.002,
      'Dumbbell penetrates head safety envelope',
    );
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(loaded.scene);
  if (exercise === 'dumbbell-shoulder-press')
    assert(
      report.distalDigitSkinTravelMeters > 0.05,
      'Distal digit skin is frozen or absent',
    );
  return report;
}

/** Each full exercise asset has its own hash-bound copy of the same draft domain. */
export async function rebindPilotMasks(exercise, bytes) {
  const proof = await validatePilot(exercise, bytes);
  const catalog = JSON.parse(
    await readFile(
      'pipeline/character-v2/muscles-upper-arm-draft/catalog.json',
      'utf8',
    ),
  );
  const doc = readGlb(bytes);
  const meshIndex = doc.meshes.findIndex((m) =>
    m.primitives.some((p) => p.attributes.WEIGHTS_0 !== undefined),
  );
  catalog.catalogVersion = exercise + '-pilot-mask-draft-1';
  catalog.character = {
    ...catalog.character,
    id: 'kimorel-' + exercise + '-pilot-draft',
    version: 'exercise-pilot-draft-1',
    file: pilotFolder + exercise + '.glb',
    sha256: sha(bytes),
  };
  const proposed = [];
  for (const mapping of catalog.surfaceMappings) {
    const payload = JSON.parse(await readFile(mapping.mask.file, 'utf8'));
    mapping.characterId = catalog.character.id;
    mapping.characterVersion = catalog.character.version;
    mapping.geometrySha256 = catalog.character.sha256;
    mapping.catalogVersion = catalog.catalogVersion;
    mapping.meshIndex = meshIndex;
    mapping.mask.file = `pipeline/character-v2/masks/exercise-pilot/${exercise}/${mapping.id}.json`;
    payload.binding = maskBinding(mapping);
    mapping.mask.sha256 = sha(serializeSparseMask(payload));
    proposed.push({ mapping, payload });
  }
  await mkdir(`pipeline/character-v2/masks/exercise-pilot/${exercise}`, {
    recursive: true,
  });
  await publishMaskBundle({
    catalog,
    proposed,
    catalogFile: pilotFolder + exercise + '-muscle-catalog.json',
  });
  return proof;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert(
    process.argv.length === 2 ||
      (process.argv.length === 3 && process.argv[2] === '--bind-masks'),
    'Usage: pilot-qa [--bind-masks]',
  );
  const reports = [];
  for (const id of pilotIds)
    reports.push(
      await (
        process.argv.includes('--bind-masks') ? rebindPilotMasks : validatePilot
      )(id, await readFile(pilotFolder + id + '.glb')),
    );
  console.log(
    JSON.stringify(
      {
        status: 'experimental-pilot-engineering-proof',
        humanApproval: false,
        reports,
        bodySha256: sha(await readFile(pilotFolder + 'character.glb')),
      },
      null,
      2,
    ),
  );
}
