/** Standard morph+skin playback and ablation proof; not anatomical acceptance. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { AnimationMixer, LoopOnce, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readGlb } from './glb-qa.mjs';
import {
  validateDeformation,
  stressNames,
} from './character-v2-deformation-qa.mjs';

export const correctivesFile =
  'pipeline/character-v2/correctives/character-v2-correctives.glb';
const definitions = {
  'shoulder-elevation-patch': {
    clip: 'shoulder-elevation',
    y: 1.43,
    x: 0.22,
    radius: 0.21,
  },
  'hip-flexion-patch': { clip: 'hip-flexion', y: 0.94, x: 0.145, radius: 0.2 },
};
const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function floatAccessor(bytes, doc, index) {
  const a = doc.accessors[index];
  assert(
    a?.componentType === 5126 && components[a.type],
    'Expected float accessor',
  );
  const n = components[a.type],
    values = new Float32Array(a.count * n),
    base = 28 + bytes.readUInt32LE(12);
  if (a.bufferView !== undefined) {
    const v = doc.bufferViews[a.bufferView],
      start = base + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    for (let i = 0; i < a.count; i++)
      for (let k = 0; k < n; k++)
        values[i * n + k] = bytes.readFloatLE(
          start + i * (v.byteStride ?? n * 4) + k * 4,
        );
  }
  if (a.sparse) {
    const s = a.sparse,
      iv = doc.bufferViews[s.indices.bufferView],
      vv = doc.bufferViews[s.values.bufferView];
    const size = { 5121: 1, 5123: 2, 5125: 4 }[s.indices.componentType];
    assert(size, 'Invalid sparse index type');
    for (let i = 0; i < s.count; i++) {
      const offset =
        base + (iv.byteOffset ?? 0) + (s.indices.byteOffset ?? 0) + i * size;
      const vertex =
        size === 1
          ? bytes.readUInt8(offset)
          : size === 2
            ? bytes.readUInt16LE(offset)
            : bytes.readUInt32LE(offset);
      assert(vertex < a.count, 'Sparse morph index out of range');
      for (let k = 0; k < n; k++)
        values[vertex * n + k] = bytes.readFloatLE(
          base +
            (vv.byteOffset ?? 0) +
            (s.values.byteOffset ?? 0) +
            (i * n + k) * 4,
        );
    }
  }
  assert(
    [...values].every(Number.isFinite),
    'Non-finite raw morph/animation data',
  );
  return values;
}

async function load(bytes) {
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
}

function player(loaded) {
  const mesh = loaded.scene.getObjectsByProperty('isSkinnedMesh', true)[0];
  assert(mesh, 'Missing skinned surface');
  const mixer = new AnimationMixer(loaded.scene);
  let active;
  return {
    mesh,
    start(name) {
      mixer.stopAllAction();
      const clip = loaded.animations.find((a) => a.name === name);
      assert(clip, `Missing stress clip: ${name}`);
      active = mixer.clipAction(clip).setLoop(LoopOnce, 1);
      active.clampWhenFinished = true;
      active.play();
      return clip;
    },
    sample(time, off = false) {
      active.paused = false;
      active.enabled = true;
      mixer.setTime(time);
      if (off) mesh.morphTargetInfluences?.fill(0);
      loaded.scene.updateMatrixWorld(true);
      mesh.skeleton.update();
      return Array.from(
        { length: mesh.geometry.getAttribute('position').count },
        (_, i) =>
          mesh
            .getVertexPosition(i, new Vector3())
            .applyMatrix4(mesh.matrixWorld),
      );
    },
    stop() {
      mixer.stopAllAction();
      mixer.uncacheRoot(loaded.scene);
    },
  };
}

function patchMetrics(positions, triangles, allowed) {
  const adjacency = positions.map(() => new Set()),
    faceNormals = [],
    edges = new Map();
  for (let i = 0; i < triangles.length; i += 3) {
    const tri = [triangles[i], triangles[i + 1], triangles[i + 2]];
    const [a, b, c] = tri.map((j) => positions[j]);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    assert(normal.length() > 1e-12, 'Degenerate posed triangle');
    normal.normalize();
    faceNormals.push(normal);
    for (let k = 0; k < 3; k++) {
      const u = tri[k],
        v = tri[(k + 1) % 3],
        key = u < v ? `${u}:${v}` : `${v}:${u}`;
      adjacency[u].add(v);
      adjacency[v].add(u);
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push(i / 3);
    }
  }
  let roughness = 0,
    count = 0;
  for (let i = 0; i < positions.length; i++)
    if (allowed[i] && adjacency[i].size) {
      const average = new Vector3();
      for (const j of adjacency[i]) average.add(positions[j]);
      average.divideScalar(adjacency[i].size);
      roughness += positions[i].distanceTo(average);
      count++;
    }
  const turns = [];
  for (const [key, faces] of edges) {
    const [a, b] = key.split(':').map(Number);
    if (faces.length === 2 && allowed[a] && allowed[b])
      turns.push(
        (Math.acos(
          Math.max(
            -1,
            Math.min(1, faceNormals[faces[0]].dot(faceNormals[faces[1]])),
          ),
        ) *
          180) /
          Math.PI,
      );
  }
  assert(
    count > 20 && turns.length > 20,
    'Insufficient local patch observations',
  );
  turns.sort((a, b) => a - b);
  return {
    vertices: count,
    meanNeighborResidualMeters: roughness / count,
    meanNormalTurnDegrees: turns.reduce((a, b) => a + b, 0) / turns.length,
    p95NormalTurnDegrees: turns[Math.floor(turns.length * 0.95)],
  };
}

function patchChange(before, after, triangles, allowed) {
  const adjacency = before.map(() => new Set()),
    stretches = [];
  for (let i = 0; i < triangles.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const a = triangles[i + k],
        b = triangles[i + ((k + 1) % 3)];
      if (adjacency[a].has(b)) continue;
      adjacency[a].add(b);
      adjacency[b].add(a);
      if (allowed[a] && allowed[b])
        stretches.push(
          after[a].distanceTo(after[b]) / before[a].distanceTo(before[b]),
        );
    }
  let dot = 0,
    scale = 0;
  for (let i = 0; i < before.length; i++)
    if (allowed[i] && adjacency[i].size) {
      const laplace = new Vector3();
      for (const j of adjacency[i]) laplace.add(before[j]);
      laplace.divideScalar(adjacency[i].size).sub(before[i]);
      const delta = after[i].clone().sub(before[i]);
      dot += laplace.dot(delta);
      scale += laplace.length() * delta.length();
    }
  assert(
    stretches.every(Number.isFinite) && scale > 0,
    'Invalid patch change metrics',
  );
  stretches.sort((a, b) => a - b);
  return {
    laplacianDirectionAlignment: dot / scale,
    edgeLengthRatioP05: stretches[Math.floor(stretches.length * 0.05)],
    edgeLengthRatioP95: stretches[Math.floor(stretches.length * 0.95)],
    maxEdgeLengthRatio: stretches.at(-1),
  };
}

export async function validateCorrectives(bytes) {
  const doc = readGlb(bytes),
    primitive = doc.meshes[0].primitives[0];
  const names = doc.meshes[0].extras?.targetNames;
  assert.deepEqual(
    names?.slice().sort(),
    Object.keys(definitions).sort(),
    'Missing corrective targets',
  );
  assert.equal(primitive.targets?.length, 2, 'Expected two localized targets');
  for (const target of primitive.targets) {
    for (const semantic of ['POSITION', 'NORMAL']) {
      assert(
        target[semantic] !== undefined,
        'Missing morph position/normal deltas',
      );
      floatAccessor(bytes, doc, target[semantic]);
    }
  }
  for (const name of Object.values(definitions).map((v) => v.clip)) {
    const animation = doc.animations?.find((a) => a.name === name);
    const weights = animation?.channels.find(
      (c) => c.target.path === 'weights',
    );
    assert(weights, `Missing baked morph track: ${name}`);
    const sampler = animation.samplers[weights.sampler],
      values = floatAccessor(bytes, doc, sampler.output);
    assert(
      values.some((v) => v > 0.9),
      `Frozen morph track: ${name}`,
    );
    assert(
      [...values].every((v) => v >= 0 && v <= 1),
      'Invalid morph influence',
    );
  }
  const engineering = await validateDeformation(bytes);
  const candidate = player(await load(bytes)),
    baseline = player(
      await load(
        await readFile(
          'pipeline/character-v2/deformation/character-v2-deformation.glb',
        ),
      ),
    );
  candidate.start('hand-closure');
  baseline.start('hand-closure');
  const neutral = candidate.sample(0),
    oldNeutral = baseline.sample(0);
  const key = (p) =>
    p
      .toArray()
      .map((v) => v.toFixed(6))
      .join(',');
  const lookup = new Map(oldNeutral.map((p, i) => [key(p), i]));
  const mapping = neutral.map((p) => {
    const i = lookup.get(key(p));
    assert(i !== undefined, 'Neutral geometry changed');
    assert(p.distanceTo(oldNeutral[i]) < 1e-6, 'Neutral geometry changed');
    return i;
  });
  const targets = candidate.mesh.geometry.morphAttributes.position;
  const support = {};
  for (let t = 0; t < names.length; t++) {
    const d = definitions[names[t]],
      attribute = targets[t];
    let changed = 0,
      maxRest = 0;
    for (let i = 0; i < neutral.length; i++) {
      const delta = new Vector3().fromBufferAttribute(attribute, i);
      if (!candidate.mesh.geometry.morphTargetsRelative)
        delta.sub(
          new Vector3().fromBufferAttribute(
            candidate.mesh.geometry.getAttribute('position'),
            i,
          ),
        );
      assert(delta.toArray().every(Number.isFinite), 'Non-finite morph delta');
      maxRest = Math.max(maxRest, delta.length());
      if (delta.length() > 1e-7) {
        const p = neutral[i],
          distance = Math.hypot(Math.abs(p.x) - d.x, p.y - d.y, p.z);
        assert(distance < d.radius + 1e-5, 'Corrective modifies remote region');
        changed++;
      }
    }
    assert(
      changed > 20 && maxRest <= 0.05501,
      'Invalid corrective displacement/support',
    );
    support[names[t]] = {
      verticesChanged: changed,
      maxRestDeltaMeters: maxRest,
    };
  }
  const reports = {};
  for (const name of stressNames) {
    const clip = candidate.start(name);
    baseline.start(name);
    const start = candidate.sample(0),
      on = candidate.sample(clip.duration / 2),
      weights = [...candidate.mesh.morphTargetInfluences];
    const off = candidate.sample(clip.duration / 2, true),
      old = baseline.sample(clip.duration / 2),
      end = candidate.sample(clip.duration);
    let correction = 0,
      loop = 0,
      offError = 0,
      remote = 0;
    const definition = Object.values(definitions).find((d) => d.clip === name);
    const allowed = neutral.map(
      (p) =>
        definition &&
        Math.hypot(Math.abs(p.x) - definition.x, p.y - definition.y, p.z) <
          definition.radius * 0.8,
    );
    for (let i = 0; i < on.length; i++) {
      const distance = on[i].distanceTo(off[i]);
      correction = Math.max(correction, distance);
      loop = Math.max(loop, start[i].distanceTo(end[i]));
      offError = Math.max(offError, off[i].distanceTo(old[mapping[i]]));
      const within =
        definition &&
        Math.hypot(
          Math.abs(neutral[i].x) - definition.x,
          neutral[i].y - definition.y,
          neutral[i].z,
        ) <
          definition.radius + 1e-5;
      if (!within) remote = Math.max(remote, distance);
      assert(
        on[i].toArray().every(Number.isFinite),
        'Non-finite corrected skin',
      );
    }
    assert(offError < 2e-5, 'Morph OFF does not match frozen skin/bones');
    assert(loop < 1e-5, 'Corrective loop does not close');
    assert(remote < 1e-6, 'Morph changes unrelated skin');
    const report = {
      durationSeconds: clip.duration,
      peakMorphWeights: weights,
      maxSkinCorrectionMeters: correction,
      morphOffBaselineErrorMeters: offError,
      neutralReturnErrorMeters: loop,
      remoteSkinCorrectionMeters: remote,
    };
    if (definition) {
      assert(
        correction > 0.001 && correction <= 0.0281,
        'Missing or excessive actual skin correction',
      );
      const triangles = Array.from(candidate.mesh.geometry.index.array);
      const before = patchMetrics(off, triangles, allowed),
        after = patchMetrics(on, triangles, allowed);
      assert(
        after.meanNeighborResidualMeters <
          before.meanNeighborResidualMeters * 0.99,
        'Corrective did not reduce local sharp residual',
      );
      const change = patchChange(off, on, triangles, allowed);
      assert(
        change.laplacianDirectionAlignment > 0.1,
        'Corrective moves against intended smoothing direction',
      );
      report.patchChange = change;
      report.patchBefore = before;
      report.patchAfter = after;
      report.residualReduction =
        1 -
        after.meanNeighborResidualMeters / before.meanNeighborResidualMeters;
    } else assert(correction < 1e-6, 'Unrelated clip activates correction');
    reports[name] = report;
  }
  candidate.stop();
  baseline.stop();
  return {
    status: 'automated-corrective-proposal-needs-review',
    clinicalValidation: false,
    engineering,
    neutralVertexCorrespondence: mapping.length,
    support,
    clips: reports,
    limitations: [
      'Patch residual/normal-turn metrics are not anatomical quality or no-collapse proof.',
      'Known engineering stress poses only; untested combinations/contact/clinical behavior remain pending.',
    ],
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(
    JSON.stringify(
      await validateCorrectives(await readFile(correctivesFile)),
      null,
      2,
    ),
  );
