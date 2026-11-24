/** Independent exported shoulder engineering proof, never anatomy approval. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AnimationMixer, LoopOnce, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readGlb } from './glb-qa.mjs';
import {
  floatAccessor,
  correctivesFile,
} from './character-v2-correctives-qa.mjs';
import {
  validateDeformation,
  stressNames,
} from './character-v2-deformation-qa.mjs';
import {
  maskBinding,
  serializeSparseMask,
} from '../packages/schemas/dist/muscle-masks-v2.js';
import { publishMaskBundle } from './character-v2-mask-publication.mjs';

export const shoulderFile =
  'pipeline/character-v2/shoulder-refinement/character.glb';
const folder = 'pipeline/character-v2/shoulder-refinement/';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const weightSupport = (p) =>
  smooth(0.13, 0.18, Math.abs(p.x)) *
  (1 - smooth(0.37, 0.43, Math.abs(p.x))) *
  smooth(1.17, 1.24, p.y) *
  (1 - smooth(1.48, 1.56, p.y)) *
  (1 - smooth(0.12, 0.18, Math.abs(p.z)));
const roi = (p) =>
  Math.abs(p.x) > 0.15 &&
  Math.abs(p.x) < 0.33 &&
  p.y > 1.25 &&
  p.y < 1.44 &&
  Math.abs(p.z) < 0.09;
async function load(bytes) {
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
}
function player(gltf) {
  const mesh = gltf.scene.getObjectsByProperty('isSkinnedMesh', true)[0],
    mixer = new AnimationMixer(gltf.scene);
  return {
    mesh,
    gltf,
    start(name) {
      mixer.stopAllAction();
      const clip = gltf.animations.find((c) => c.name === name);
      assert(clip, 'Missing clip');
      const action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      return clip;
    },
    sample(time, off = false) {
      mixer.setTime(time);
      gltf.scene.updateMatrixWorld(true);
      mesh.skeleton.update();
      const saved = [...mesh.morphTargetInfluences];
      if (off) mesh.morphTargetInfluences.fill(0);
      const points = Array.from(
        { length: mesh.geometry.attributes.position.count },
        (_, i) => mesh.getVertexPosition(i, new Vector3()),
      );
      mesh.morphTargetInfluences.splice(0, saved.length, ...saved);
      return points;
    },
  };
}
const q = (values, f) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))];
};
export function patchMetrics(points, rest, indices) {
  const edges = new Map(),
    normals = [],
    edgeFaces = new Map(),
    areaRatios = [];
  for (let i = 0; i < indices.length; i += 3) {
    const ids = Array.from(indices.slice(i, i + 3));
    if (!ids.every((id) => roi(rest[id]))) continue;
    const cross = (p) =>
      new Vector3()
        .subVectors(p[ids[1]], p[ids[0]])
        .cross(new Vector3().subVectors(p[ids[2]], p[ids[0]]));
    const a = cross(points),
      r = cross(rest),
      face = normals.length;
    normals.push(a.clone().normalize());
    areaRatios.push(a.length() / r.length());
    for (const [x, y] of [
      [ids[0], ids[1]],
      [ids[1], ids[2]],
      [ids[2], ids[0]],
    ]) {
      const key = [Math.min(x, y), Math.max(x, y)].join(',');
      edges.set(key, [x, y]);
      if (!edgeFaces.has(key)) edgeFaces.set(key, []);
      edgeFaces.get(key).push(face);
    }
  }
  const ratios = [...edges.values()]
    .filter(([a, b]) => rest[a].distanceTo(rest[b]) > 0.001)
    .map(
      ([a, b]) => points[a].distanceTo(points[b]) / rest[a].distanceTo(rest[b]),
    );
  const turns = [...edgeFaces.values()]
    .filter((f) => f.length === 2)
    .map(([a, b]) =>
      Math.acos(Math.max(-1, Math.min(1, normals[a].dot(normals[b])))),
    );
  assert(
    ratios.length > 100 && ratios.every(Number.isFinite),
    'Invalid patch geometry',
  );
  return {
    edges: ratios.length,
    p95: q(ratios, 0.95),
    max: Math.max(...ratios),
    normalTurnP95Radians: q(turns, 0.95),
    areaRatioP05: q(areaRatios, 0.05),
  };
}
function namedWeights(mesh, i) {
  const a = mesh.geometry.attributes.skinIndex,
    w = mesh.geometry.attributes.skinWeight;
  const result = {};
  for (let k = 0; k < 4; k++) {
    const value = w.getComponent(i, k);
    if (value > 0)
      result[mesh.skeleton.bones[a.getComponent(i, k)].name] = value;
  }
  return result;
}
function equalArray(a, b, message) {
  assert.equal(a.length, b.length, message);
  assert(
    Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(
      Buffer.from(b.buffer, b.byteOffset, b.byteLength),
    ),
    message,
  );
}
export async function validateShoulder(bytes, oldBytes) {
  oldBytes ??= await readFile(correctivesFile);
  const next = player(await load(bytes)),
    old = player(await load(oldBytes)),
    geometry = next.mesh.geometry,
    original = old.mesh.geometry;
  equalArray(
    geometry.attributes.position.array,
    original.attributes.position.array,
    'Neutral vertex order/position changed',
  );
  equalArray(
    geometry.index.array,
    original.index.array,
    'Triangle index order changed',
  );
  equalArray(
    geometry.attributes.normal.array,
    original.attributes.normal.array,
    'Neutral normals changed',
  );
  assert.equal(geometry.attributes.position.count, 26939);
  assert.deepEqual(
    next.mesh.skeleton.bones.map((b) => b.name),
    old.mesh.skeleton.bones.map((b) => b.name),
    'Joint identity/order changed',
  );
  next.gltf.scene.updateMatrixWorld(true);
  old.gltf.scene.updateMatrixWorld(true);
  for (let i = 0; i < 50; i++)
    assert(
      next.mesh.skeleton.bones[i]
        .getWorldPosition(new Vector3())
        .distanceTo(
          old.mesh.skeleton.bones[i].getWorldPosition(new Vector3()),
        ) < 1e-6,
      'Joint center drift',
    );
  assert.deepEqual(
    next.gltf.animations.map((a) => a.name),
    old.gltf.animations.map((a) => a.name),
    'Clip names changed',
  );
  for (const clip of next.gltf.animations) {
    const before = old.gltf.animations.find((c) => c.name === clip.name);
    assert.equal(clip.duration, before.duration, 'Clip duration changed');
    assert.equal(
      clip.tracks.length,
      before.tracks.length,
      'Clip channels changed',
    );
    for (let i = 0; i < clip.tracks.length; i++) {
      const a = clip.tracks[i],
        b = before.tracks[i];
      assert.equal(a.name, b.name, 'Clip target changed');
      equalArray(a.times, b.times, 'Clip times changed');
      equalArray(a.values, b.values, 'Frozen/changed bone or morph animation');
    }
  }
  const doc = readGlb(bytes),
    oldDoc = readGlb(oldBytes),
    primitive = doc.meshes[0].primitives[0],
    oldPrimitive = oldDoc.meshes[0].primitives[0];
  const names = doc.meshes[0].extras.targetNames,
    oldNames = oldDoc.meshes[0].extras.targetNames;
  assert.deepEqual(names, oldNames, 'Morph identity/order changed');
  for (let t = 0; t < names.length; t++)
    for (const semantic of ['POSITION', 'NORMAL']) {
      const delta = floatAccessor(bytes, doc, primitive.targets[t][semantic]);
      if (names[t] === 'shoulder-elevation-patch' && semantic === 'POSITION')
        assert(
          !Buffer.from(delta.buffer).equals(
            Buffer.from(
              floatAccessor(oldBytes, oldDoc, oldPrimitive.targets[t][semantic])
                .buffer,
            ),
          ),
          'Stale shoulder corrective for modified weights',
        );
      assert([...delta].every(Number.isFinite), 'NaN morph');
      if (names[t] === 'hip-flexion-patch')
        equalArray(
          delta,
          floatAccessor(oldBytes, oldDoc, oldPrimitive.targets[t][semantic]),
          'Hip morph changed',
        );
      if (semantic === 'POSITION')
        for (let i = 0; i < delta.length; i += 3)
          assert(
            Math.hypot(...delta.subarray(i, i + 3)) <= 0.055001,
            'Excessive corrective smoothing/displacement',
          );
    }
  next.start('shoulder-elevation');
  old.start('shoulder-elevation');
  const rest = old.sample(0),
    restNext = next.sample(0);
  for (let i = 0; i < rest.length; i++)
    assert(rest[i].distanceTo(restNext[i]) < 1e-6, 'Neutral skin drift');
  let changed = 0,
    remote = 0;
  for (let i = 0; i < rest.length; i++) {
    const current = namedWeights(next.mesh, i),
      previous = namedWeights(old.mesh, i);
    const same =
      JSON.stringify(Object.entries(current).sort()) ===
      JSON.stringify(Object.entries(previous).sort());
    const values = Object.values(current);
    assert(
      values.length <= 4 &&
        values.every((v) => Number.isFinite(v) && v > 0) &&
        Math.abs(values.reduce((a, b) => a + b, 0) - 1) < 1e-6,
      'Invalid raw local weights',
    );
    if (weightSupport(rest[i]) === 0) {
      assert(same, 'Remote weight spill');
      remote++;
    } else if (!same) {
      changed++;
      const side = rest[i].x > 0 ? 'left' : 'right';
      assert(
        Object.keys(current).every((name) =>
          [
            'chest',
            `${side}_clavicle`,
            `${side}_upper_arm`,
            `${side}_forearm`,
          ].includes(name),
        ),
        'Nonlocal shoulder influence',
      );
    }
  }
  assert(changed > 100, 'Frozen shoulder weights');
  const samples = [];
  for (const fraction of [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
    const duration = next.gltf.animations.find(
        (c) => c.name === 'shoulder-elevation',
      ).duration,
      t = duration * fraction;
    const current = next.sample(t),
      baseline = old.sample(t),
      off = old.sample(t, true);
    const metrics = patchMetrics(current, rest, geometry.index.array),
      before = patchMetrics(baseline, rest, geometry.index.array);
    assert(
      metrics.p95 < before.p95 - 1e-5 && metrics.max < before.max - 1e-5,
      'Shoulder edge expansion did not improve',
    );
    assert(
      metrics.normalTurnP95Radians <= before.normalTurnP95Radians + 0.08,
      'Shoulder normal-turn regression',
    );
    assert(
      metrics.areaRatioP05 >= before.areaRatioP05 * 0.5,
      'Excessive patch collapse',
    );
    for (let i = 0; i < rest.length; i++)
      if (
        weightSupport(rest[i]) === 0 &&
        rest[i].distanceTo(new Vector3(0.22, 1.43, 0)) > 0.211 &&
        rest[i].distanceTo(new Vector3(-0.22, 1.43, 0)) > 0.211
      )
        assert(
          current[i].distanceTo(baseline[i]) < 2e-6,
          'Remote posed-skin drift',
        );
    const distal = rest
      .map((p, i) => (p.x > 0.35 && p.y > 0.85 && p.y < 1.17 ? i : -1))
      .filter((i) => i >= 0);
    const travel = Math.max(
        ...distal.map((i) => current[i].distanceTo(rest[i])),
      ),
      oldTravel = Math.max(
        ...distal.map((i) => baseline[i].distanceTo(rest[i])),
      );
    assert(
      travel >= oldTravel * 0.99 && travel > 0.01,
      'Frozen/distorted distal arm motion',
    );
    samples.push({
      fraction,
      candidate: metrics,
      baselineOn: before,
      baselineOff: patchMetrics(off, rest, geometry.index.array),
      distalTravelMeters: travel,
    });
  }
  for (const name of stressNames) {
    const clip = next.start(name);
    old.start(name);
    const start = next.sample(0),
      end = next.sample(clip.duration);
    for (let i = 0; i < start.length; i++)
      assert(start[i].distanceTo(end[i]) < 2e-6, 'Loop neutral return failed');
  }
  const engineering = await validateDeformation(bytes);
  return {
    status: 'engineering-proposal-needs-review',
    humanApproval: false,
    anatomicalValidation: false,
    changedWeightVertices: changed,
    unchangedRemoteWeightVertices: remote,
    vertices: 26939,
    samples,
    engineering,
  };
}
export async function rebindMasks(bytes) {
  // Exact export-domain proof must precede any new mask files.
  const proof = await validateShoulder(bytes);
  const catalog = JSON.parse(
    await readFile(
      'pipeline/character-v2/muscles-upper-arm-draft/catalog.json',
      'utf8',
    ),
  );
  catalog.catalogVersion = 'shoulder-refinement-mask-draft-1';
  catalog.character = {
    ...catalog.character,
    id: 'kimorel-shoulder-refinement-draft',
    version: 'shoulder-refinement-draft-1',
    file: shoulderFile,
    sha256: hash(bytes),
  };
  const proposed = [];
  for (const mapping of catalog.surfaceMappings) {
    const payload = JSON.parse(await readFile(mapping.mask.file, 'utf8'));
    mapping.characterId = catalog.character.id;
    mapping.characterVersion = catalog.character.version;
    mapping.geometrySha256 = catalog.character.sha256;
    mapping.catalogVersion = catalog.catalogVersion;
    mapping.mask.file = `pipeline/character-v2/masks/shoulder-refinement/${mapping.id}.json`;
    payload.binding = maskBinding(mapping);
    mapping.mask.sha256 = hash(serializeSparseMask(payload));
    proposed.push({ mapping, payload });
  }
  await publishMaskBundle({
    catalog,
    proposed,
    catalogFile: folder + 'muscle-catalog.json',
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
    'Usage: shoulder-qa [--bind-masks]',
  );
  const bytes = await readFile(shoulderFile);
  console.log(
    JSON.stringify(
      process.argv.includes('--bind-masks')
        ? await rebindMasks(bytes)
        : await validateShoulder(bytes),
      null,
      2,
    ),
  );
}
