/** Independent connected draft proof. This is NOT anatomical acceptance. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { AnimationMixer, Box3, LoopOnce, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readGlb } from './glb-qa.mjs';

export const stressNames = [
  'shoulder-elevation',
  'elbow-flexion',
  'forearm-twist',
  'wrist-flexion',
  'hip-flexion',
  'knee-flexion',
  'hand-closure',
];
export const deformationFile =
  'pipeline/character-v2/deformation/character-v2-deformation.glb';

function rawWeights(bytes, doc) {
  const binary = 28 + bytes.readUInt32LE(12);
  for (const mesh of doc.meshes)
    for (const p of mesh.primitives) {
      const a = doc.accessors[p.attributes.WEIGHTS_0];
      assert(
        a?.componentType === 5126 && a.type === 'VEC4',
        'Missing raw float weights',
      );
      const view = doc.bufferViews[a.bufferView];
      const start = binary + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
      for (let i = 0; i < a.count; i++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          const value = bytes.readFloatLE(
            start + i * (view.byteStride ?? 16) + k * 4,
          );
          assert(
            Number.isFinite(value) && value >= 0 && value <= 1,
            'Invalid raw weight',
          );
          sum += value;
        }
        assert(Math.abs(sum - 1) < 1e-5, 'Raw weights not normalized');
      }
    }
}

function topology(geometry) {
  const p = geometry.getAttribute('position'),
    index = geometry.index;
  assert(index && index.count % 3 === 0, 'Missing triangle topology');
  const map = new Map(),
    ids = [],
    points = [];
  for (let i = 0; i < p.count; i++) {
    const point = new Vector3().fromBufferAttribute(p, i);
    assert(point.toArray().every(Number.isFinite), 'Non-finite vertex');
    const key = point
      .toArray()
      .map((v) => v.toFixed(7))
      .join(',');
    if (!map.has(key)) {
      map.set(key, points.length);
      points.push(point);
    }
    ids.push(map.get(key));
  }
  const edges = new Map(),
    adjacency = points.map(() => new Set());
  for (let i = 0; i < index.count; i += 3) {
    const tri = [0, 1, 2].map((k) => ids[index.getX(i + k)]);
    assert(new Set(tri).size === 3, 'Collapsed triangle');
    const [a, b, c] = tri.map((k) => points[k]);
    assert(
      b.clone().sub(a).cross(c.clone().sub(a)).length() > 1e-12,
      'Degenerate triangle',
    );
    for (let k = 0; k < 3; k++) {
      const u = tri[k],
        v = tri[(k + 1) % 3];
      const key = u < v ? `${u}:${v}` : `${v}:${u}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
      adjacency[u].add(v);
      adjacency[v].add(u);
    }
  }
  assert(
    [...edges.values()].every((n) => n === 2),
    'Surface is not closed two-manifold',
  );
  const components = (allowed) => {
    const seen = new Set();
    let count = 0;
    for (let i = 0; i < points.length; i++)
      if (allowed(points[i]) && !seen.has(i)) {
        count++;
        const queue = [i];
        seen.add(i);
        while (queue.length)
          for (const n of adjacency[queue.pop()])
            if (!seen.has(n) && allowed(points[n])) {
              seen.add(n);
              queue.push(n);
            }
      }
    return count;
  };
  assert.equal(
    components(() => true),
    1,
    'Wrist/body surface is disconnected',
  );
  return { points, components, triangles: index.count / 3, vertices: p.count };
}

export async function validateDeformation(bytes) {
  const doc = readGlb(bytes);
  const triangleCount = doc.meshes.reduce(
    (sum, m) =>
      sum +
      m.primitives.reduce((n, p) => n + doc.accessors[p.indices].count / 3, 0),
    0,
  );
  assert(triangleCount <= 60000, 'Triangle engineering budget exceeded');
  rawWeights(bytes, doc);
  const loaded = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  loaded.scene.updateMatrixWorld(true);
  const meshes = [],
    bones = new Map();
  loaded.scene.traverse((o) => {
    if (o.isMesh) meshes.push(o);
    if (o.isBone) bones.set(o.name, o);
  });
  assert.equal(meshes.length, 1, 'Expected one connected skinned surface');
  assert.equal(bones.size, 50, 'Expected 50 export joints');
  const mesh = meshes[0];
  assert(mesh.isSkinnedMesh, 'Missing skin');
  const geometry = mesh.geometry;
  const normal = geometry.getAttribute('normal'),
    joints = geometry.getAttribute('skinIndex');
  assert(normal && joints, 'Missing normal or skin attributes');
  for (let i = 0; i < normal.count; i++) {
    const n = new Vector3().fromBufferAttribute(normal, i);
    assert(
      n.toArray().every(Number.isFinite) && Math.abs(n.length() - 1) < 1e-4,
      'Invalid normals',
    );
    for (let k = 0; k < 4; k++)
      assert(
        Number.isInteger(joints.getComponent(i, k)) &&
          joints.getComponent(i, k) < 50,
        'Invalid skin joint',
      );
  }
  const graph = topology(geometry);
  const oldBytes = await readFile(
    'pipeline/character-v2/prototype/character-v2.glb',
  );
  const old = await new GLTFLoader().parseAsync(
    oldBytes.buffer.slice(
      oldBytes.byteOffset,
      oldBytes.byteOffset + oldBytes.byteLength,
    ),
    '',
  );
  old.scene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(loaded.scene),
    oldBounds = new Box3().setFromObject(old.scene);
  const height = bounds.max.y - bounds.min.y,
    oldHeight = oldBounds.max.y - oldBounds.min.y;
  assert(Math.abs(height - oldHeight) <= 0.01, 'Height tolerance exceeded');
  for (const axis of ['x', 'y', 'z'])
    for (const edge of ['min', 'max'])
      assert(
        Math.abs(bounds[edge][axis] - oldBounds[edge][axis]) <= 0.02,
        'Neutral silhouette bounds changed',
      );
  const legacy = readGlb(await readFile('assets/characters/neutral-human.glb'));
  let preserved = 0;
  const visit = (index, parent = new Vector3()) => {
    const node = legacy.nodes[index],
      p = parent.clone().add(new Vector3(...(node.translation ?? [0, 0, 0])));
    if (bones.has(node.name)) {
      assert(
        bones.get(node.name).getWorldPosition(new Vector3()).distanceTo(p) <
          1e-5,
        'Legacy joint center changed',
      );
      preserved++;
    }
    for (const child of node.children ?? []) visit(child, p);
  };
  for (const index of legacy.scenes[legacy.scene ?? 0].nodes) visit(index);
  assert.equal(preserved, 18, 'Missing legacy centers');
  const digitProof = {};
  const digitVertices = new Map();
  for (const side of ['left', 'right']) {
    const wrist = bones.get(`${side}_hand`).getWorldPosition(new Vector3());
    const elbow = bones.get(`${side}_forearm`).getWorldPosition(new Vector3());
    const along = wrist.clone().sub(elbow).normalize();
    for (const digit of ['thumb', 'index', 'middle', 'ring', 'little'])
      for (let i = 1; i <= 3; i++) {
        const bone = bones.get(`${side}_${digit}_${i}`);
        assert(bone, 'Missing articulated digit');
        assert.equal(
          bone.parent.name,
          i === 1 ? `${side}_hand` : `${side}_${digit}_${i - 1}`,
          'Invalid digit hierarchy',
        );
        const joint = mesh.skeleton.bones.indexOf(bone),
          weights = geometry.getAttribute('skinWeight');
        let influenced = 0;
        const vertices = digitVertices.get(`${side}_${digit}`) ?? new Set();
        digitVertices.set(`${side}_${digit}`, vertices);
        for (let v = 0; v < joints.count; v++)
          for (let k = 0; k < 4; k++)
            if (
              joints.getComponent(v, k) === joint &&
              weights.getComponent(v, k) > 0.1
            ) {
              influenced++;
              if (
                i === 3 &&
                weights.getComponent(v, k) >=
                  Math.max(
                    ...[0, 1, 2, 3].map((j) => weights.getComponent(v, j)),
                  )
              )
                vertices.add(v);
            }
        assert(influenced > 2, 'Digit has no meaningful skin influence');
      }
    // Cut distal to the palm: four separate long-finger components, not a mitten.
    const distal = graph.components(
      (p) =>
        p.clone().applyMatrix4(mesh.matrixWorld).sub(wrist).dot(along) >
          0.075 && Math.sign(p.x) === (side === 'left' ? 1 : -1),
    );
    assert(distal === 4, 'Long digits not geometrically separated');
    const across = new Vector3(
      (side === 'left' ? 1 : -1) * Math.abs(along.y),
      Math.abs(along.x),
      0,
    ).normalize();
    const thumb = graph.components((p) => {
      const q = p.clone().applyMatrix4(mesh.matrixWorld).sub(wrist);
      return q.length() < 0.16 && q.dot(along) > 0 && q.dot(across) > 0.045;
    });
    assert.equal(thumb, 1, 'Thumb distal surface not separately resolved');
    digitProof[side] = {
      thumbDistalComponents: thumb,
      distalLongFingerComponents: distal,
      thumbJointChain: true,
    };
  }
  const mixer = new AnimationMixer(loaded.scene),
    reports = {};
  let activeAction;
  const sample = (time) => {
    activeAction.paused = false;
    activeAction.enabled = true;
    mixer.setTime(time);
    loaded.scene.updateMatrixWorld(true);
    mesh.skeleton.update();
    const positions = [];
    for (let i = 0; i < geometry.getAttribute('position').count; i++) {
      const p = mesh
        .getVertexPosition(i, new Vector3())
        .applyMatrix4(mesh.matrixWorld);
      assert(p.toArray().every(Number.isFinite), 'Non-finite deformed vertex');
      positions.push(p);
    }
    return positions;
  };
  for (const name of stressNames) {
    const clip = loaded.animations.find((a) => a.name === name);
    assert(
      clip && clip.duration > 1.9 && clip.duration < 2.1,
      `Missing stress clip: ${name}`,
    );
    mixer.stopAllAction();
    const action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
    activeAction = action;
    action.clampWhenFinished = true;
    action.play();
    const start = sample(0),
      peak = sample(clip.duration / 2),
      end = sample(clip.duration);
    sample(clip.duration * 0.25);
    sample(clip.duration * 0.75);
    let travel = 0,
      loop = 0;
    const lowerOnly = name === 'hip-flexion' || name === 'knee-flexion';
    let nonTargetTravel = 0;
    for (let i = 0; i < start.length; i++) {
      const p = start[i];
      const isolated = lowerOnly
        ? p.y > 1.16
        : p.y < 1.04 && Math.abs(p.x) < 0.29;
      if (isolated)
        nonTargetTravel = Math.max(nonTargetTravel, p.distanceTo(peak[i]));
    }
    assert(nonTargetTravel < 1e-5, `Non-target skin moved: ${name}`);
    let kneeEndpoint = null;
    if (name === 'knee-flexion') {
      sample(0);
      const foot = bones.get('left_foot').getWorldPosition(new Vector3());
      sample(clip.duration / 2);
      const bent = bones.get('left_foot').getWorldPosition(new Vector3());
      assert(
        Math.abs(foot.x - bent.x) < 1e-5,
        'Knee endpoint left sagittal plane',
      );
      assert(
        bent.y > foot.y + 0.15 && bent.z < foot.z - 0.15,
        'Knee endpoint has wrong flexion direction',
      );
      kneeEndpoint = {
        xDriftMeters: Math.abs(foot.x - bent.x),
        elevationMeters: bent.y - foot.y,
        backwardTravelMeters: foot.z - bent.z,
      };
    }

    for (let i = 0; i < start.length; i++) {
      travel = Math.max(travel, start[i].distanceTo(peak[i]));
      loop = Math.max(loop, start[i].distanceTo(end[i]));
    }
    assert(
      travel > (name === 'forearm-twist' ? 0.005 : 0.015),
      `Frozen skin stress: ${name}`,
    );
    assert(loop < 1e-5, `Stress loop does not close: ${name}`);
    const digitTravel = {};
    if (name === 'hand-closure')
      for (const [digit, vertices] of digitVertices) {
        const movement = Math.max(
          ...[...vertices].map((i) => start[i].distanceTo(peak[i])),
        );
        assert(movement > 0.005, `Frozen digit skin: ${digit}`);
        digitTravel[digit] = movement;
      }
    const jointName = {
      'shoulder-elevation': 'left_upper_arm',
      'elbow-flexion': 'left_forearm',
      'forearm-twist': 'left_forearm',
      'wrist-flexion': 'left_hand',
      'hip-flexion': 'left_thigh',
      'knee-flexion': 'left_shin',
      'hand-closure': 'left_index_2',
    }[name];
    sample(0);
    const center = bones.get(jointName).getWorldPosition(new Vector3());
    const cohort = start
      .map((p, i) => ({ i, r: p.distanceTo(center) }))
      .filter((v) => v.r < 0.12 && v.r > 0.01);
    sample(clip.duration / 2);
    const posedCenter = bones.get(jointName).getWorldPosition(new Vector3());
    const ratios = cohort
      .map((v) => peak[v.i].distanceTo(posedCenter) / v.r)
      .sort((a, b) => a - b);
    assert(ratios.length > 5, 'Missing joint neighborhood samples');
    reports[name] = {
      durationSeconds: clip.duration,
      maxSkinTravelMeters: travel,
      loopErrorMeters: loop,
      nonTargetSkinTravelMeters: nonTargetTravel,
      kneeEndpoint,
      digitTravelMeters: digitTravel,
      jointNeighborhoodSamples: ratios.length,
      radiusRatioP10: ratios[Math.floor(ratios.length * 0.1)],
      radiusRatioMedian: ratios[Math.floor(ratios.length / 2)],
    };
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(loaded.scene);
  return {
    status: 'engineering-draft-needs-review',
    clinicalValidation: false,
    vertices: graph.vertices,
    triangles: graph.triangles,
    triangleReductionFactor: 282372 / graph.triangles,
    connectedComponents: 1,
    closedTwoManifold: true,
    surfaces: 1,
    joints: bones.size,
    preservedLegacyCenters: preserved,
    heightMeters: height,
    baselineHeightMeters: oldHeight,
    digitProof,
    stresses: reports,
    limitations: [
      'Neighborhood radius is not cross-section volume or no-collapse proof.',
      'No self-collision/contact or anatomical ROM acceptance.',
      'Automatic topology and generated weights require artist review.',
    ],
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(
    JSON.stringify(
      await validateDeformation(await readFile(deformationFile)),
      null,
      2,
    ),
  );
