import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  validateGlb,
  readGlb,
  validateEquipment,
  qaProfiles,
} from './glb-qa.mjs';
test('real squat GLB has a skeleton, rep, finite weights and stable contacts', async () => {
  const report = await validateGlb('assets/exercises/bodyweight-squat.glb');
  assert.equal(report.clip, 'rep');
  assert.ok(report.vertexCount > 1000);
  assert.ok(report.footDriftMeters < 0.005);
  assert.equal(report.duration, 4);
});
test('rejects broken GLB and missing animation', async () => {
  assert.throws(() => readGlb(Buffer.alloc(20)), /Invalid GLB/);
  await assert.rejects(
    () => validateGlb('assets/exercises/bodyweight-squat.glb', 'missing'),
    /Missing animation/,
  );
  const broken = Buffer.from(
    await readFile('assets/exercises/bodyweight-squat.glb'),
  );
  broken.writeUInt32LE(0, 8);
  assert.throws(() => readGlb(broken), /length/);
});
test('push-up and curl use exercise-specific contacts and equipment rules', async () => {
  const push = await validateGlb('assets/exercises/push-up.glb');
  assert.ok(push.handDriftMeters < 0.005);
  assert.ok(push.groundPenetrationMeters < 0.015);
  const curl = await validateGlb('assets/exercises/dumbbell-biceps-curl.glb');
  assert.ok(curl.equipmentAttachmentDriftMeters < 0.001);
  await assert.rejects(
    () =>
      validateGlb(
        'assets/exercises/bodyweight-squat.glb',
        'rep',
        'dumbbell-biceps-curl',
      ),
    /equipment attachment/,
  );
  await assert.rejects(
    () =>
      validateGlb('assets/exercises/bodyweight-squat.glb', 'rep', 'unknown'),
    /Unknown QA profile/,
  );
});

test('standalone dumbbell contains only reusable meter-scaled equipment', async () => {
  const report = await validateEquipment();
  assert.ok(report.bytes < 10000);
  assert.equal(report.vertices, 72);
});

test('exported region labels stay identical on the canonical skin across clips', async () => {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const definitions = [];
  for (const id of Object.keys(qaProfiles)) {
    const bytes = await readFile(`assets/exercises/${id}.glb`);
    const loaded = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
    let skin;
    loaded.scene.traverse((object) => {
      if (object.isSkinnedMesh) skin = object;
    });
    definitions.push([...skin.geometry.getAttribute('_muscle_region').array]);
  }
  for (const definition of definitions)
    assert.deepEqual(definition, definitions[0]);
});

test('rejects missing or invalid exported muscle-region labels', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'kimorel-region-'));
  try {
    const source = await readFile('assets/exercises/bodyweight-squat.glb');
    const missing = Buffer.from(source);
    const offset = missing.indexOf('_MUSCLE_REGION');
    missing.write('_BROKEN_REGION', offset);
    const path = join(directory, 'bad.glb');
    await writeFile(path, missing);
    await assert.rejects(
      () => validateGlb(path, 'rep', 'bodyweight-squat'),
      /Missing muscle-region/,
    );
    const invalid = Buffer.from(source);
    const doc = readGlb(source);
    const accessor =
      doc.accessors[doc.meshes[0].primitives[0].attributes._MUSCLE_REGION];
    const view = doc.bufferViews[accessor.bufferView];
    const binaryOffset = 20 + source.readUInt32LE(12) + 8;
    invalid.writeUInt16LE(
      999,
      binaryOffset + view.byteOffset + (accessor.byteOffset ?? 0),
    );
    await writeFile(path, invalid);
    await assert.rejects(
      () => validateGlb(path, 'rep', 'bodyweight-squat'),
      /Invalid muscle-region/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('all thirteen original clips pass their declared contact, pivot and equipment profiles', async () => {
  assert.equal(Object.keys(qaProfiles).length, 13);
  const fingerprints = new Set();
  for (const id of Object.keys(qaProfiles)) {
    const bytes = await readFile(`assets/exercises/${id}.glb`);
    const document = readGlb(bytes);
    const binaryOffset = 20 + bytes.readUInt32LE(12) + 8;
    const digest = createHash('sha256');
    for (const sampler of document.animations[0].samplers) {
      const accessor = document.accessors[sampler.output];
      const view = document.bufferViews[accessor.bufferView];
      digest.update(
        bytes.subarray(
          binaryOffset + view.byteOffset,
          binaryOffset + view.byteOffset + view.byteLength,
        ),
      );
    }
    fingerprints.add(digest.digest('hex'));
    const report = await validateGlb(`assets/exercises/${id}.glb`);
    assert.equal(report.duration, 4);
    assert.equal(report.bones, 18);
    assert.ok(report.groundPenetrationMeters <= 0.015, id);
    assert.ok(report.maximumGroundGapMeters < 0.035, id);
    assert.equal(report.clinicalValidation, false);
  }
  assert.equal(
    fingerprints.size,
    13,
    'Every exported clip must contain distinct animation data',
  );
});

test('contact phase, forefoot marker and floor QA reject deliberately broken expanded clips', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'kimorel-contact-'));
  const path = join(directory, 'broken.glb');
  const outputOffset = (bytes, node, channel) => {
    const doc = readGlb(bytes);
    const index = doc.nodes.findIndex((n) => n.name === node);
    const track = doc.animations[0].channels.find(
      (c) => c.target.node === index && c.target.path === channel,
    );
    const accessor =
      doc.accessors[doc.animations[0].samplers[track.sampler].output];
    return {
      count: accessor.count,
      offset:
        20 +
        bytes.readUInt32LE(12) +
        8 +
        doc.bufferViews[accessor.bufferView].byteOffset +
        (accessor.byteOffset ?? 0),
    };
  };
  try {
    const bird = Buffer.from(await readFile('assets/exercises/bird-dog.glb'));
    const track = outputOffset(bird, 'right_upper_arm', 'rotation');
    // The right hand must stay planted during the first support phase.
    [0, 0, 0, 1].forEach((v, k) =>
      bird.writeFloatLE(v, track.offset + (30 * 4 + k) * 4),
    );
    await writeFile(path, bird);
    await assert.rejects(
      () => validateGlb(path, 'rep', 'bird-dog'),
      /Contact\/root\/skin/,
    );
    const calf = Buffer.from(
      await readFile('assets/exercises/standing-calf-raise.glb'),
    );
    calf.write('lost_forefoot', calf.indexOf('left_forefoot'));
    await writeFile(path, calf);
    await assert.rejects(
      () => validateGlb(path, 'rep', 'standing-calf-raise'),
      /Missing contact marker/,
    );
    const dead = Buffer.from(await readFile('assets/exercises/dead-bug.glb'));
    const pelvis = outputOffset(dead, 'pelvis', 'translation');
    // Raise every frame together: zero relative drift must not hide floating supports.
    for (let i = 0; i < pelvis.count; i++) {
      const y = pelvis.offset + (i * 3 + 1) * 4;
      dead.writeFloatLE(dead.readFloatLE(y) + 0.2, y);
    }
    await writeFile(path, dead);
    await assert.rejects(
      () => validateGlb(path, 'rep', 'dead-bug'),
      /Contact\/root\/skin/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
