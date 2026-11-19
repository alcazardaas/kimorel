import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { validatePrototype } from './character-v2-prototype-qa.mjs';

const file = 'pipeline/character-v2/prototype/character-v2.glb';
const mutate = async (change) => {
  const bytes = await readFile(file);
  const n = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.subarray(20, 20 + n).toString());
  change(doc);
  let json = Buffer.from(JSON.stringify(doc));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
  const binary = bytes.subarray(20 + n);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + json.length + binary.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, json, binary]);
};

test('v2 draft exported surface and finger deformation', async () => {
  const report = await validatePrototype(await readFile(file));
  assert.equal(report.joints, 50);
  assert(report.handSkinTravelMeters > 0.025);
});

test('reject missing hand motion and broken digit identity', async () => {
  await assert.rejects(
    validatePrototype(
      await mutate((doc) => {
        doc.animations = [];
      }),
    ),
    /Missing hand smoke/,
  );
  await assert.rejects(
    validatePrototype(
      await mutate((doc) => {
        doc.nodes.find((node) => node.name === 'left_thumb_1').name =
          'false_thumb';
      }),
    ),
    /Missing articulated digit/,
  );
});

test('rejects enlarged body and malformed surfaces', async () => {
  await assert.rejects(
    validatePrototype(
      await mutate((doc) => {
        for (const index of doc.scenes[0].nodes)
          doc.nodes[index].scale = [2, 2, 2];
      }),
    ),
    /Legacy stature|Legacy joint center/,
  );
  await assert.rejects(
    validatePrototype(
      await mutate((doc) => {
        delete doc.meshes[0].primitives[0].attributes.NORMAL;
      }),
    ),
    /Missing surface/,
  );
});

test('rejects raw NaN and unnormalized weights before loader normalization', async () => {
  for (const value of [NaN, 0.2]) {
    const bytes = Buffer.from(await readFile(file));
    const n = bytes.readUInt32LE(12);
    const doc = JSON.parse(bytes.subarray(20, 20 + n).toString());
    const accessor =
      doc.accessors[doc.meshes[0].primitives[0].attributes.WEIGHTS_0];
    const view = doc.bufferViews[accessor.bufferView];
    const offset = 28 + n + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    bytes.writeFloatLE(value, offset);
    if (Number.isFinite(value))
      for (let k = 1; k < 4; k++) bytes.writeFloatLE(0, offset + k * 4);
    await assert.rejects(
      validatePrototype(bytes),
      /raw skin weight|Raw skin weights/,
    );
  }
});
