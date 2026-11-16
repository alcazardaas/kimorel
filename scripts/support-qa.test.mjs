import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validateGlb,
  validateEquipment,
  readGlb,
  qaProfiles,
} from './glb-qa.mjs';

function reencode(source, changeDocument, changeBinary = () => {}) {
  const document = readGlb(source);
  const binaryOffset = 20 + source.readUInt32LE(12) + 8;
  const binary = Buffer.from(source.subarray(binaryOffset));
  changeDocument(document);
  changeBinary(document, binary);
  let json = Buffer.from(JSON.stringify(document));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + binary.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binary.length);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, json, binHeader, binary]);
}

test('original bench, box and wall exports contain only finite meter-scaled rigid geometry', async () => {
  for (const [id, dimensions] of [
    ['bench', [0.65, 0.45, 0.4]],
    ['box', [0.65, 0.25, 0.55]],
    ['wall', [1.2, 2, 0.1]],
  ]) {
    const path = `assets/equipment/${id}.glb`;
    const report = await validateEquipment(path);
    assert.ok(report.bytes < 10000);
    dimensions.forEach((v, axis) =>
      assert.ok(Math.abs(v - report.dimensionsMeters[axis]) < 0.0001),
    );
    const doc = readGlb(await readFile(path));
    assert.equal(doc.skins, undefined);
    assert.equal(doc.animations, undefined);
    assert.equal(doc.nodes.length, 1);
  }
});

test('seating, stepping, rear-foot and wall contacts use actual rigid supports', async () => {
  for (const id of [
    'seated-trunk-rotation',
    'seated-knee-extension',
    'seated-calf-raise',
    'sit-to-stand',
    'step-up',
    'bulgarian-split-squat',
    'wall-sit',
  ]) {
    const result = await validateGlb(`assets/exercises/${id}.glb`);
    assert.equal(result.rigidProps, 1);
    assert.ok(result.maximumPropPenetrationMeters <= 0.015);
    assert.ok(result.maximumSurfaceGapMeters <= 0.035);
  }
  assert.equal(qaProfiles['step-up'].supportSurfaces[0].height, 0.35);
});

test('exported QA rejects missing, shifted or malformed rigid supports and false elevated planes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kimorel-support-'));
  const source = await readFile('assets/exercises/step-up.glb');
  try {
    const path = join(directory, 'broken.glb');
    await writeFile(
      path,
      reencode(source, (doc) => {
        doc.nodes.find((n) => n.name === 'equipment_box').name = 'absent_box';
      }),
    );
    await assert.rejects(
      () => validateGlb(path, 'rep', 'step-up'),
      /Missing rigid support equipment/,
    );
    await writeFile(
      path,
      reencode(source, (doc) => {
        doc.nodes.find((n) => n.name === 'equipment_box').translation[1] += 0.1;
      }),
    );
    await assert.rejects(
      () => validateGlb(path, 'rep', 'step-up'),
      /transform mismatch/,
    );
    await writeFile(
      path,
      reencode(
        source,
        () => {},
        (doc, bin) => {
          const node = doc.nodes.find((n) => n.name === 'equipment_box');
          const a =
            doc.accessors[
              doc.meshes[node.mesh].primitives[0].attributes.POSITION
            ];
          bin.writeFloatLE(0.5, doc.bufferViews[a.bufferView].byteOffset);
        },
      ),
    );
    await assert.rejects(
      () => validateGlb(path, 'rep', 'step-up'),
      /geometry mismatch/,
    );
    // Corrupt only the authored foot track: valid GLB/rig, no longer on declared top plane.
    await writeFile(
      path,
      reencode(
        source,
        () => {},
        (doc, bin) => {
          const channel = doc.animations[0].channels.find(
            (c) =>
              doc.nodes[c.target.node].name === 'left_foot' &&
              c.target.path === 'rotation',
          );
          const a =
            doc.accessors[doc.animations[0].samplers[channel.sampler].output];
          const offset = doc.bufferViews[a.bufferView].byteOffset;
          for (let i = 0; i < a.count; i++) {
            bin.writeFloatLE(Math.sin(0.25), offset + i * 16);
            bin.writeFloatLE(0, offset + i * 16 + 4);
            bin.writeFloatLE(0, offset + i * 16 + 8);
            bin.writeFloatLE(Math.cos(0.25), offset + i * 16 + 12);
          }
        },
      ),
    );
    await assert.rejects(
      () => validateGlb(path, 'rep', 'step-up'),
      /drift|support|penetrates/i,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('actual skinned body vertices cannot occupy the wall volume', async () => {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { AnimationMixer, Matrix4, Vector3 } = await import('three');
  const source = await readFile('assets/exercises/wall-sit.glb');
  const loaded = await new GLTFLoader().parseAsync(
    source.buffer.slice(
      source.byteOffset,
      source.byteOffset + source.byteLength,
    ),
    '',
  );
  const mixer = new AnimationMixer(loaded.scene);
  mixer.clipAction(loaded.animations[0]).play();
  mixer.setTime(0);
  loaded.scene.updateMatrixWorld(true);
  let skin;
  loaded.scene.traverse((object) => {
    if (object.isSkinnedMesh) skin = object;
  });
  skin.skeleton.update();
  const origin = skin.applyBoneTransform(0, new Vector3());
  const axes = [
    new Vector3(1, 0, 0),
    new Vector3(0, 1, 0),
    new Vector3(0, 0, 1),
  ].map((point) => skin.applyBoneTransform(0, point).sub(origin));
  const transform = new Matrix4().set(
    axes[0].x,
    axes[1].x,
    axes[2].x,
    origin.x,
    axes[0].y,
    axes[1].y,
    axes[2].y,
    origin.y,
    axes[0].z,
    axes[1].z,
    axes[2].z,
    origin.z,
    0,
    0,
    0,
    1,
  );
  const corruptSource = new Vector3(0, 1, -0.24).applyMatrix4(
    transform.invert(),
  );
  const directory = await mkdtemp(join(tmpdir(), 'kimorel-penetration-'));
  try {
    const path = join(directory, 'wall.glb');
    await writeFile(
      path,
      reencode(
        source,
        () => {},
        (doc, bin) => {
          const human = doc.meshes.find(
            (mesh) => mesh.name === 'neutral-human-skin',
          );
          const a = doc.accessors[human.primitives[0].attributes.POSITION];
          const offset = doc.bufferViews[a.bufferView].byteOffset;
          corruptSource
            .toArray()
            .forEach((v, axis) => bin.writeFloatLE(v, offset + axis * 4));
        },
      ),
    );
    await assert.rejects(
      () => validateGlb(path, 'hold', 'wall-sit'),
      /Body penetrates rigid equipment/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
    mixer.uncacheRoot(loaded.scene);
  }
});
