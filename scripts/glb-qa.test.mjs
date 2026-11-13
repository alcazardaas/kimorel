import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateGlb, readGlb, validateEquipment } from './glb-qa.mjs';
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
  for (const id of ['bodyweight-squat', 'push-up', 'dumbbell-biceps-curl']) {
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
  assert.deepEqual(definitions[0], definitions[1]);
  assert.deepEqual(definitions[1], definitions[2]);
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
