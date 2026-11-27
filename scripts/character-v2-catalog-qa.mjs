/** Independent exported-GLB proof. Source truth is the frozen v1 GLB, not exporter frames. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { AnimationMixer, LoopOnce, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const folder = 'pipeline/character-v2/catalog-v2-groin-1/';
const existing = ['bodyweight-squat', 'push-up', 'dumbbell-shoulder-press'];
export const ids = [
  ...existing,
  'reverse-lunge',
  'standing-calf-raise',
  'lateral-lunge',
];
const bodySha =
  'c7b0bcd52e36f0f281cd13e990c65db9907e3a27ee162a1790837d7236a50571';
const cacheSha =
  '18ad766419af8d78a799925932db71af9613f42ed82d7ee621cefb9b04c691af';
const nativeSha =
  'eb625a1cd87b5ba652b2d9204d6b225f5db0f93a0556a53e5de8f0ff6940800a';
const offset = new Vector3(0, -0.008360867388546467, 0);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function load(bytes) {
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
}
function body(gltf) {
  const values = gltf.scene.getObjectsByProperty('isSkinnedMesh', true);
  assert.equal(values.length, 1, 'Expected one actual skinned body');
  return values[0];
}
function bones(mesh) {
  return new Map(mesh.skeleton.bones.map((bone) => [bone.name, bone]));
}
function weights(mesh, index) {
  const result = {};
  for (let slot = 0; slot < 4; slot++) {
    const weight = mesh.geometry.attributes.skinWeight.getComponent(
      index,
      slot,
    );
    if (weight > 0)
      result[
        mesh.skeleton.bones[
          mesh.geometry.attributes.skinIndex.getComponent(index, slot)
        ].name
      ] = weight;
  }
  return result;
}
function position(mesh, index) {
  return mesh
    .getVertexPosition(index, new Vector3())
    .applyMatrix4(mesh.matrixWorld);
}
function timeline(gltf) {
  assert.equal(
    gltf.animations.length,
    1,
    'Expected only the actual exercise clip',
  );
  const clip = gltf.animations[0];
  assert.equal(clip.name, 'rep', 'Expected actual exercise rep');
  assert(Math.abs(clip.duration - 4) < 1e-6, 'Expected four-second rep');
  const mixer = new AnimationMixer(gltf.scene);
  const action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  return {
    sample(time) {
      action.paused = false;
      action.enabled = true;
      mixer.setTime(time);
      gltf.scene.updateMatrixWorld(true);
      body(gltf).skeleton.update();
    },
    close() {
      mixer.stopAllAction();
      mixer.uncacheRoot(gltf.scene);
    },
  };
}
function envelope(source, rest, part, child, parent, onset, peak) {
  const angles = ['left', 'right'].map((side) => {
    const name = side + '_' + part;
    const relative = source
      .get(parent)
      .getWorldQuaternion(new Quaternion())
      .invert()
      .multiply(source.get(name).getWorldQuaternion(new Quaternion()));
    const direction = rest
      .get(side + '_' + child)
      .clone()
      .sub(rest.get(name));
    return direction.angleTo(direction.clone().applyQuaternion(relative));
  });
  const t = Math.max(
    0,
    Math.min(
      1,
      ((Math.max(...angles) * 180) / Math.PI - onset) / (peak - onset),
    ),
  );
  return t * t * (3 - 2 * t);
}
function edgesOf(mesh, minimum = 0.001) {
  const result = [],
    seen = new Set(),
    indices = mesh.geometry.index.array;
  const point = (i) =>
    new Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i);
  for (let i = 0; i < indices.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const pair = [indices[i + k], indices[i + ((k + 1) % 3)]].sort(
          (a, b) => a - b,
        ),
        key = pair.join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      const rest = point(pair[0]).distanceTo(point(pair[1]));
      if (rest >= minimum) result.push({ pair, rest });
    }
  return result;
}

// Independently implemented analytic definition; native proof is evidence, not
// authority to choose arbitrary weights. The immutable neutral GLB is reference.
export function groinField(point, reference) {
  const smooth = (a, b, v) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const [x, y, z] = point;
  assert(
    point.length === 3 && point.every(Number.isFinite),
    'Invalid collar point',
  );
  const amount =
    (1 - smooth(0.025, 0.18, Math.abs(x))) *
    smooth(0.65, 0.8, y) *
    (1 - smooth(0.95, 1.1, y)) *
    (1 - smooth(0.15, 0.23, Math.abs(z)));
  if (amount === 0) return { ...reference };
  const left = smooth(-0.1, 0.1, x),
    target = {
      pelvis: 0.8,
      left_thigh: 0.2 * left,
      right_thigh: 0.2 * (1 - left),
    };
  const names = [
    ...new Set([...Object.keys(reference), ...Object.keys(target)]),
  ];
  const values = Object.fromEntries(
    names.map((name) => [
      name,
      (1 - amount) * (reference[name] ?? 0) + amount * (target[name] ?? 0),
    ]),
  );
  const cutoff = Object.values(values).sort((a, b) => b - a)[4] ?? 0;
  const residual = Object.fromEntries(
    Object.entries(values)
      .map(([name, value]) => [name, Math.max(0, value - cutoff)])
      .filter(([, value]) => value > 0),
  );
  const total = Object.values(residual).reduce((a, b) => a + b, 0);
  assert(total > 1e-12, 'Degenerate collar');
  return Object.fromEntries(
    Object.entries(residual).map(([name, value]) => [name, value / total]),
  );
}
function assertWeights(actual, expected) {
  assert.deepEqual(
    Object.keys(actual).sort(),
    Object.keys(expected).sort(),
    'Analytic native semantic weights mismatch',
  );
  for (const name of Object.keys(expected))
    assert(
      Math.abs(actual[name] - expected[name]) < 2e-7,
      'Analytic native weights mismatch',
    );
}
async function validateDerivedBody() {
  const oldBytes = await readFile(
    'pipeline/character-v2/exercise-pilot/character.glb',
  );
  assert.equal(sha(oldBytes), bodySha, 'Immutable neutral input changed');
  const original = body(await load(oldBytes));
  const derived = body(await load(await readFile(folder + 'character.glb')));
  for (const name of ['position', 'normal'])
    assert.deepEqual(
      original.geometry.attributes[name].array,
      derived.geometry.attributes[name].array,
      'Derived neutral geometry changed',
    );
  assert.deepEqual(
    original.geometry.index.array,
    derived.geometry.index.array,
    'Derived topology changed',
  );
  for (const name of Object.keys(original.geometry.morphAttributes))
    for (let i = 0; i < original.geometry.morphAttributes[name].length; i++)
      assert.deepEqual(
        original.geometry.morphAttributes[name][i].array,
        derived.geometry.morphAttributes[name][i].array,
        'Derived corrective geometry changed',
      );
  // The historical GLB dropped native influences below 1e-4. Its independently
  // hash-bound native proof (not the new writer proof) is the lossless input.
  const nativeBytes = await readFile(
    'pipeline/character-v2/exercise-pilot/native-weight-proof.json',
  );
  assert.equal(
    sha(nativeBytes),
    nativeSha,
    'Immutable native input proof changed',
  );
  const native = JSON.parse(nativeBytes);
  assert.equal(native.sourceBlendSha256, cacheSha);
  const input = new Map(
    native.records.map((record) => [record.position.join(','), record.weights]),
  );
  const proof = JSON.parse(
    await readFile(folder + 'native-weight-proof.json', 'utf8'),
  );
  assert.equal(proof.inputSourceBlendSha256, cacheSha);
  assert.equal(proof.inputNeutralGlbSha256, bodySha);
  assert.equal(
    proof.sourceBlendSha256,
    sha(await readFile(folder + 'source.blend')),
  );
  assert.equal(
    proof.fieldSourceSha256,
    sha(await readFile('pipeline/character-v2/groin_weights.py')),
  );
  const lookup = new Map(
    proof.records.map((record) => [record.position.join(','), record]),
  );
  assert.equal(
    lookup.size,
    proof.records.length,
    'Duplicate native collar proof points',
  );
  let changed = 0;
  const active = new Set();
  for (let i = 0; i < 26939; i++) {
    const point = new Vector3()
        .fromBufferAttribute(original.geometry.attributes.position, i)
        .toArray(),
      old = input.get(point.join(','));
    assert(old, 'Missing immutable native reference point');
    const expected = groinField(point, old),
      actual = weights(derived, i);
    if (JSON.stringify(old) === JSON.stringify(expected))
      assert.deepEqual(
        actual,
        weights(original, i),
        'Outside collar weights changed',
      );
    else {
      changed++;
      active.add(i);
      assertWeights(actual, expected);
      const record = lookup.get(point.join(','));
      assert(record, 'Missing native collar proof');
      assert.deepEqual(
        record.original,
        old,
        'Native reference weights changed',
      );
      assertWeights(record.weights, actual);
    }
  }
  const coordinateKey = (pair) =>
    pair
      .map((point) => point.join(','))
      .sort()
      .join('|');
  const pointAt = (i) =>
    new Vector3()
      .fromBufferAttribute(original.geometry.attributes.position, i)
      .toArray();
  const boundary = edgesOf(original, 0).filter(
    ({ pair: [a, b] }) => active.has(a) !== active.has(b),
  );
  const actualBoundary = new Set(
    boundary.map(({ pair }) => coordinateKey(pair.map(pointAt))),
  );
  const proofBoundary = new Set();
  for (const row of proof.field.boundaryEdges) {
    const [a, b] = row.vertices.map((i) => native.records[i]);
    assert(a && b, 'Invalid native boundary edge');
    proofBoundary.add(coordinateKey([a.position, b.position]));
    const distance = new Vector3(...a.position).distanceTo(
      new Vector3(...b.position),
    );
    assert(
      Math.abs(distance - row.lengthMeters) < 1e-10,
      'Boundary length evidence changed',
    );
    if (distance >= 0.001) {
      const wa = groinField(a.position, a.weights),
        wb = groinField(b.position, b.weights);
      const delta =
        [...new Set([...Object.keys(wa), ...Object.keys(wb)])].reduce(
          (sum, n) => sum + Math.abs((wa[n] ?? 0) - (wb[n] ?? 0)),
          0,
        ) / distance;
      assert(
        Math.abs(delta - row.gradientAfter) < 1e-8,
        'Boundary gradient evidence changed',
      );
    }
  }
  assert.deepEqual(
    actualBoundary,
    proofBoundary,
    'Incomplete collar boundary edge evidence',
  );
  assert(changed > 100, 'Missing compact derived collar');
  return {
    changedVertices: changed,
    boundaryEdges: proof.field.boundaryEdges.length,
  };
}

const pilotHashes = {
  'bodyweight-squat':
    'aa4d75481e1681078b6ba0122d2962937dc1b8515653091f4650c3f58f3b89c4',
  'push-up': '96b075f4a9868b8ea6e1d74cd2db347138f1363363d4953f98107d6f48170484',
  'dumbbell-shoulder-press':
    '1013c7f16017c34e50df2288291b4458f9d91f171d62cd6649f4434dcc614c42',
};
async function assertLegacyCopy(id, bytes) {
  const old = await readFile(
    'pipeline/character-v2/exercise-pilot/' + id + '.glb',
  );
  assert.equal(
    sha(old),
    pilotHashes[id],
    'Immutable pilot trajectory input changed',
  );
  assert.equal(
    bytes.length,
    old.length,
    'Legacy regression candidate changed container length',
  );
  const size = old.readUInt32LE(12),
    doc = JSON.parse(old.subarray(20, 20 + size));
  assert.deepEqual(
    bytes.subarray(0, 28 + size),
    old.subarray(0, 28 + size),
    'Legacy clip/equipment structure changed',
  );
  const allowed = [];
  for (const primitive of doc.meshes.flatMap((mesh) => mesh.primitives))
    for (const name of ['JOINTS_0', 'WEIGHTS_0']) {
      const attribute = primitive.attributes[name];
      if (attribute === undefined) continue;
      const accessor = doc.accessors[attribute],
        view = doc.bufferViews[accessor.bufferView],
        start = 28 + size + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      allowed.push([
        start,
        start +
          accessor.count *
            4 *
            (accessor.componentType === 5126
              ? 4
              : accessor.componentType === 5123
                ? 2
                : 1),
      ]);
    }
  for (let i = 0; i < bytes.length; i++)
    if (bytes[i] !== old[i])
      assert(
        allowed.some(([a, b]) => i >= a && i < b),
        'Legacy motion/grip/equipment bytes changed',
      );
}

/** Bytes may be deliberately corrupted in regression tests; manifest binding is a separate check. */
export async function validateCatalogExercise(id, bytes) {
  assert(ids.includes(id), 'Unsupported first catalog exercise');
  if (existing.includes(id)) await assertLegacyCopy(id, bytes);
  const catalog = JSON.parse(
    await readFile('packages/data/src/exercises.json', 'utf8'),
  );
  const entry = catalog.find((entry) => entry.id === id);
  const referenceBytes = await readFile(folder + 'character.glb');
  const originalBytes = await readFile(
    'pipeline/character-v2/exercise-pilot/character.glb',
  );
  assert.equal(sha(originalBytes), bodySha, 'Cached neutral body changed');
  const [reference, source, actual] = await Promise.all([
    load(referenceBytes),
    load(
      await readFile(
        existing.includes(id)
          ? 'pipeline/character-v2/exercise-pilot/' + id + '.glb'
          : 'assets/' + entry.animation.file,
      ),
    ),
    load(bytes),
  ]);
  const mesh = body(actual),
    neutral = body(reference),
    sourceMesh = body(source);
  actual.scene.updateMatrixWorld(true);
  reference.scene.updateMatrixWorld(true);
  source.scene.updateMatrixWorld(true);
  const named = bones(mesh),
    sourceBones = bones(sourceMesh),
    restBones = bones(neutral);
  assert.equal(named.size, 50, 'Expected 50 unique semantic joints');
  assert.equal(mesh.geometry.attributes.position.count, 26939);
  assert.deepEqual(
    mesh.geometry.index.array,
    neutral.geometry.index.array,
    'Neutral topology changed',
  );
  for (const name of ['position', 'normal'])
    assert.deepEqual(
      mesh.geometry.attributes[name].array,
      neutral.geometry.attributes[name].array,
      'Neutral geometry changed',
    );
  assert.deepEqual(
    mesh.morphTargetDictionary,
    neutral.morphTargetDictionary,
    'Corrective identities changed',
  );
  for (const name of Object.keys(neutral.geometry.morphAttributes)) {
    assert.equal(
      mesh.geometry.morphAttributes[name].length,
      neutral.geometry.morphAttributes[name].length,
    );
    for (let i = 0; i < neutral.geometry.morphAttributes[name].length; i++)
      assert.deepEqual(
        mesh.geometry.morphAttributes[name][i].array,
        neutral.geometry.morphAttributes[name][i].array,
        'Corrective geometry changed',
      );
  }
  const feet = { left: [], right: [] };
  const palms = { left: [], right: [] };
  for (let i = 0; i < 26939; i++) {
    assert.deepEqual(
      weights(mesh, i),
      weights(neutral, i),
      'Native named skin weights changed',
    );
    for (const side of ['left', 'right']) {
      const weight = weights(neutral, i);
      if ((weight[side + '_foot'] ?? 0) > 0.5) feet[side].push(i);
      if ((weight[side + '_hand'] ?? 0) > 0.5) palms[side].push(i);
    }
  }
  assert(
    feet.left.length > 50 && feet.right.length > 50,
    'Missing actual foot skin',
  );
  const restRotation = new Map(
    [...restBones].map(([name, bone]) => [
      name,
      bone.getWorldQuaternion(new Quaternion()),
    ]),
  );
  const sourceRest = new Map(
    [...sourceBones].map(([name, bone]) => [
      name,
      bone.getWorldPosition(new Vector3()),
    ]),
  );
  const edges = edgesOf(mesh),
    playback = timeline(actual),
    original = timeline(source);
  const report = {
    id,
    sha256: sha(bytes),
    samples: 121,
    source: existing.includes(id)
      ? 'pipeline/character-v2/exercise-pilot/' + id + '.glb'
      : 'assets/' + entry.animation.file,
    sourceSha256: sha(
      await readFile(
        existing.includes(id)
          ? 'pipeline/character-v2/exercise-pilot/' + id + '.glb'
          : 'assets/' + entry.animation.file,
      ),
    ),
    bodySha256: sha(referenceBytes),
    jointErrorMeters: 0,
    rotationError: 0,
    morphError: 0,
    loopErrorMeters: 0,
    movementMeters: 0,
    edgeRatio: 0,
    testedEdges: edges.length,
    worstEdge: null,
    contacts: {},
    heelRiseMeters: 0,
    anatomicalValidation: false,
    humanApproval: false,
  };
  const contactSamples = { left: [], right: [], leftPalm: [], rightPalm: [] },
    heelSamples = [],
    first = new Map();
  let firstPoints;
  try {
    for (let frame = 0; frame <= 120; frame++) {
      const time = frame / 30;
      original.sample(time);
      playback.sample(time);
      const points = Array.from({ length: 26939 }, (_, i) => position(mesh, i));
      assert(
        points.every((point) => point.toArray().every(Number.isFinite)),
        'Non-finite actual skin',
      );
      for (const [name, sourceBone] of sourceBones) {
        const target = named.get(name);
        assert(target, 'Missing source semantic joint');
        const world = target.getWorldPosition(new Vector3());
        report.jointErrorMeters = Math.max(
          report.jointErrorMeters,
          world.distanceTo(
            sourceBone
              .getWorldPosition(new Vector3())
              .add(existing.includes(id) ? new Vector3() : offset),
          ),
        );
        const delta = target
          .getWorldQuaternion(new Quaternion())
          .multiply(restRotation.get(name).clone().invert());
        report.rotationError = Math.max(
          report.rotationError,
          1 -
            Math.abs(
              (existing.includes(id)
                ? target.getWorldQuaternion(new Quaternion())
                : delta
              ).dot(sourceBone.getWorldQuaternion(new Quaternion())),
            ),
        );
        if (frame === 0) first.set(name, world.clone());
        report.movementMeters = Math.max(
          report.movementMeters,
          world.distanceTo(first.get(name)),
        );
        if (frame === 120)
          report.loopErrorMeters = Math.max(
            report.loopErrorMeters,
            world.distanceTo(first.get(name)),
          );
      }
      for (const [name, expected] of Object.entries({
        'shoulder-elevation-patch': envelope(
          sourceBones,
          sourceRest,
          'upper_arm',
          'forearm',
          'chest',
          25,
          65,
        ),
        'hip-flexion-patch': envelope(
          sourceBones,
          sourceRest,
          'thigh',
          'shin',
          'pelvis',
          20,
          55,
        ),
      }))
        report.morphError = Math.max(
          report.morphError,
          Math.abs(
            mesh.morphTargetInfluences[mesh.morphTargetDictionary[name]] -
              (existing.includes(id)
                ? sourceMesh.morphTargetInfluences[
                    sourceMesh.morphTargetDictionary[name]
                  ]
                : expected),
          ),
        );
      for (const { pair, rest } of edges) {
        const ratio = points[pair[0]].distanceTo(points[pair[1]]) / rest;
        if (ratio > report.edgeRatio) {
          report.edgeRatio = ratio;
          report.worstEdge = {
            vertices: pair,
            time,
            restMeters: rest,
            posedMeters: rest * ratio,
          };
        }
      }
      for (const side of ['left', 'right'])
        contactSamples[side].push(
          Math.min(...feet[side].map((i) => points[i].y)),
        );
      if (id === 'push-up')
        for (const side of ['left', 'right']) {
          assert(palms[side].length > 0);
          contactSamples[side + 'Palm'].push(
            Math.min(...palms[side].map((i) => points[i].y)),
          );
        }
      if (id === 'standing-calf-raise') {
        // Skin heel domain is fixed from neutral coordinates, not a writer-provided contact mask.
        const heels = feet.left.filter(
          (i) => neutral.geometry.attributes.position.getZ(i) < 0,
        );
        assert(heels.length > 0, 'Missing independent heel surface domain');
        heelSamples.push(Math.min(...heels.map((i) => points[i].y)));
        for (const side of ['left', 'right']) {
          const marker = actual.scene.getObjectByName(side + '_forefoot');
          const sourceMarker = source.scene.getObjectByName(side + '_forefoot');
          assert(marker && sourceMarker, 'Missing forefoot pivot marker');
          assert(
            marker
              .getWorldPosition(new Vector3())
              .distanceTo(
                sourceMarker.getWorldPosition(new Vector3()).add(offset),
              ) < 2e-5,
            'Forefoot marker diverges from frozen source',
          );
        }
      }
      if (frame === 0) firstPoints = points;
      if (frame === 120)
        for (let i = 0; i < points.length; i++)
          report.loopErrorMeters = Math.max(
            report.loopErrorMeters,
            points[i].distanceTo(firstPoints[i]),
          );
    }
  } finally {
    playback.close();
    original.close();
  }
  const planted =
    id === 'reverse-lunge'
      ? ['left']
      : id === 'push-up'
        ? ['left', 'right', 'leftPalm', 'rightPalm']
        : ['left', 'right'];
  for (const side of planted) {
    const values = contactSamples[side];
    report.contacts[side] = {
      minimumY: Math.min(...values),
      maximumY: Math.max(...values),
      driftMeters: Math.max(...values) - Math.min(...values),
    };
  }
  if (heelSamples.length)
    report.heelRiseMeters = Math.max(...heelSamples) - heelSamples[0];
  // Include complete measured diagnostics in failures; do not relax bounds or alter source to hide them.
  const failures = [];
  if (!(report.jointErrorMeters < 2e-5 && report.rotationError < 2e-5))
    failures.push('canonical trajectory/rest basis');
  if (!(report.morphError < 2e-5)) failures.push('pose-derived morph envelope');
  if (!(report.loopErrorMeters < 2e-5 && report.movementMeters > 0.01))
    failures.push('loop or frozen movement');
  if (!(report.edgeRatio <= 6))
    failures.push('whole-mesh 6x deformation bound');
  for (const [side, contact] of Object.entries(report.contacts))
    if (!(
      contact.minimumY >= -0.008 &&
      contact.maximumY <= 0.008 &&
      contact.driftMeters < 0.008
    ))
      failures.push(side + ' actual floor support');
  if (id === 'standing-calf-raise' && !(report.heelRiseMeters > 0.02))
    failures.push('heel rise absent');
  assert.equal(
    failures.length,
    0,
    failures.join(', ') + ': ' + JSON.stringify(report),
  );
  return report;
}

export async function validateCatalogBinding() {
  const manifest = JSON.parse(await readFile(folder + 'manifest.json', 'utf8'));
  await validateDerivedBody();
  assert.equal(
    manifest.derivedBody.sha256,
    sha(await readFile(folder + 'character.glb')),
  );
  assert.equal(
    manifest.derivedBody.sourceBlendSha256,
    sha(await readFile(folder + 'source.blend')),
  );
  assert.equal(
    manifest.derivedBody.nativeWeightProofSha256,
    sha(await readFile(folder + 'native-weight-proof.json')),
  );
  assert.equal(manifest.schema, 'kimorel.experimental-catalog/v1');
  assert.equal(manifest.totalSourceIds, 100);
  assert.equal(manifest.inventory.length, 100);
  assert.equal(new Set(manifest.inventory.map((row) => row.id)).size, 100);
  assert.equal(
    manifest.inventory.filter((row) => row.kind === 'hold').length,
    8,
  );
  assert.equal(manifest.bodySourceSha256, cacheSha);
  assert.equal(manifest.bodyGlbSha256, bodySha);
  assert.equal(manifest.nativeWeightProofSha256, nativeSha);
  for (const [path, expected] of [
    ['pipeline/character-v2/exercise-pilot/source.blend', cacheSha],
    [
      'pipeline/character-v2/exercise-pilot/native-weight-proof.json',
      nativeSha,
    ],
    ['pipeline/character-v2/build_catalog.py', manifest.sourceSha256],
    ['pipeline/character-v2/catalog_motion.py', manifest.adapterSha256],
  ])
    assert.equal(
      sha(await readFile(path)),
      expected,
      'Source/cache binding changed',
    );
  assert.equal(manifest.humanApproval, false);
  assert.equal(manifest.anatomicalValidation, false);
  const catalog = JSON.parse(
    await readFile('packages/data/src/exercises.json', 'utf8'),
  );
  assert.deepEqual(
    manifest.inventory.map((row) => row.id).sort(),
    catalog.map((row) => row.id).sort(),
  );
  for (const row of manifest.inventory) {
    assert.equal(row.humanApproval, false);
    assert.equal(row.anatomicalValidation, false);
    assert.equal(
      sha(await readFile(row.v1File)),
      row.v1Sha256,
      'Frozen clip binding changed',
    );
    assert.equal(
      sha(await readFile(row.source)),
      row.sourceSha256,
      'Frozen canonical source changed',
    );
  }
  for (const [name, entry] of Object.entries(manifest.files)) {
    assert(
      /^[a-z0-9-]+\.(glb|png|json|blend)$/.test(name),
      'Unsafe catalog output locator',
    );
    const bytes = await readFile(folder + name);
    assert.equal(bytes.length, entry.bytes);
    assert.equal(sha(bytes), entry.sha256);
  }
  assert.deepEqual(Object.keys(manifest.exercises).sort(), [...ids].sort());
  for (const id of ids)
    assert.equal(
      sha(await readFile(folder + id + '.glb')),
      manifest.exercises[id].sha256,
    );
  return manifest;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await validateCatalogBinding();
  for (const id of ids)
    console.log(
      JSON.stringify(
        await validateCatalogExercise(id, await readFile(folder + id + '.glb')),
      ),
    );
}
