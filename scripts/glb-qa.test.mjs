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
    if (!qaProfiles[id].regionVersion)
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

test('all registered original clips pass their declared contact, pivot and equipment profiles', async () => {
  assert.equal(Object.keys(qaProfiles).length, 60);
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
    assert.equal(report.bones, qaProfiles[id].rig ? 20 : 18);
    assert.ok(report.groundPenetrationMeters <= 0.015, id);
    assert.ok(report.maximumGroundGapMeters < 0.035, id);
    assert.equal(report.clinicalValidation, false);
  }
  assert.equal(
    fingerprints.size,
    60,
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

test('isometric, supported-slide, paired-foot and spinal contracts are explicit', async () => {
  const plank = await validateGlb('assets/exercises/forearm-plank.glb');
  assert.equal(plank.kind, 'hold');
  assert.equal(plank.clip, 'hold');
  const slide = await validateGlb('assets/exercises/supine-heel-slide.glb');
  assert.ok(slide.slidingBoneDriftMeters < 0.005);
  assert.ok(slide.slidingSkinDriftMeters < 0.007);
  const clamshell = await validateGlb(
    'assets/exercises/side-lying-clamshell.glb',
  );
  assert.ok(clamshell.pairedContactDriftMeters < 0.005);
  const spine = await validateGlb('assets/exercises/cat-cow.glb');
  assert.ok(spine.articulations.spine >= 0.2);
  assert.ok(spine.articulations.chest >= 0.08);
});

test('rejects fake oscillating holds, unsupported sliding, separated feet and rigid-spine substitutes', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'kimorel-milestone25-'));
  const path = join(directory, 'broken.glb');
  const trackInfo = (bytes, node, channel) => {
    const doc = readGlb(bytes);
    const index = doc.nodes.findIndex((entry) => entry.name === node);
    const track = doc.animations[0].channels.find(
      (entry) => entry.target.node === index && entry.target.path === channel,
    );
    const accessor =
      doc.accessors[doc.animations[0].samplers[track.sampler].output];
    return {
      count: accessor.count,
      offset:
        28 +
        bytes.readUInt32LE(12) +
        doc.bufferViews[accessor.bufferView].byteOffset +
        (accessor.byteOffset ?? 0),
    };
  };
  const quaternion = (bytes, track, frame, value) =>
    value.forEach((number, index) =>
      bytes.writeFloatLE(number, track.offset + (frame * 4 + index) * 4),
    );
  const rewrite = (bytes, change) => {
    const doc = readGlb(bytes);
    change(doc);
    let json = Buffer.from(JSON.stringify(doc));
    json = Buffer.concat([
      json,
      Buffer.alloc((4 - (json.length % 4)) % 4, 0x20),
    ]);
    const binary = bytes.subarray(20 + bytes.readUInt32LE(12));
    const header = Buffer.alloc(20);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(20 + json.length + binary.length, 8);
    header.writeUInt32LE(json.length, 12);
    header.writeUInt32LE(0x4e4f534a, 16);
    return Buffer.concat([header, json, binary]);
  };
  try {
    const hold = Buffer.from(
      await readFile('assets/exercises/forearm-plank.glb'),
    );
    const arm = trackInfo(hold, 'left_upper_arm', 'rotation');
    quaternion(hold, arm, 60, [0, 0, 0, 1]);
    await writeFile(path, hold);
    await assert.rejects(
      () => validateGlb(path, 'hold', 'forearm-plank'),
      /Isometric hold must remain stable/,
    );
    const slide = Buffer.from(
      await readFile('assets/exercises/supine-heel-slide.glb'),
    );
    quaternion(
      slide,
      trackInfo(slide, 'left_foot', 'rotation'),
      60,
      [0, 0, 0, 1],
    );
    await writeFile(path, slide);
    await assert.rejects(
      () => validateGlb(path, 'rep', 'supine-heel-slide'),
      /Sliding contact drift/,
    );
    const pair = rewrite(
      await readFile('assets/exercises/side-lying-clamshell.glb'),
      (doc) => {
        doc.nodes.find((node) => node.name === 'right_foot').translation[1] +=
          0.1;
      },
    );
    await writeFile(path, pair);
    await assert.rejects(
      () => validateGlb(path, 'rep', 'side-lying-clamshell'),
      /Paired contact separation/,
    );
    const spine = Buffer.from(await readFile('assets/exercises/cat-cow.glb'));
    const track = trackInfo(spine, 'spine', 'rotation');
    for (let frame = 0; frame < track.count; frame++)
      quaternion(spine, track, frame, [0, 0, 0, 1]);
    await writeFile(path, spine);
    await assert.rejects(
      () => validateGlb(path, 'rep', 'cat-cow'),
      /Missing authored articulation: spine/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
