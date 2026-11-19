import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import {
  deformationFile,
  validateDeformation,
} from './character-v2-deformation-qa.mjs';

async function mutate(change) {
  const bytes = await readFile(deformationFile);
  const size = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.subarray(20, 20 + size));
  const binary = Buffer.from(bytes.subarray(28 + size));
  const offset = (a) =>
    (doc.bufferViews[a.bufferView].byteOffset ?? 0) + (a.byteOffset ?? 0);
  change(doc, binary, offset);
  let json = Buffer.from(JSON.stringify(doc));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
  const header = Buffer.from(bytes.subarray(0, 20));
  header.writeUInt32LE(28 + json.length + binary.length, 8);
  header.writeUInt32LE(json.length, 12);
  const binHeader = Buffer.from(bytes.subarray(20 + size, 28 + size));
  return Buffer.concat([header, json, binHeader, binary]);
}

test('connected reduced draft has real stress deformation and sagittal knee travel', async () => {
  const report = await validateDeformation(await readFile(deformationFile));
  assert(report.triangles <= 60000 && report.triangleReductionFactor > 4);
  assert.equal(report.connectedComponents, 1);
  assert.equal(
    report.stresses['knee-flexion'].kneeEndpoint.xDriftMeters < 1e-5,
    true,
  );
});

test('reject missing stress, missing digit and budget explosion', async () => {
  await assert.rejects(
    validateDeformation(
      await mutate((doc) => {
        doc.animations = doc.animations.filter(
          (a) => a.name !== 'forearm-twist',
        );
      }),
    ),
    /Missing stress clip/,
  );
  await assert.rejects(
    validateDeformation(
      await mutate((doc) => {
        doc.nodes.find((n) => n.name === 'left_thumb_2').name = 'missing';
      }),
    ),
    /Missing articulated digit/,
  );
  await assert.rejects(
    validateDeformation(
      await mutate((doc) => {
        doc.accessors[doc.meshes[0].primitives[0].indices].count = 180003;
      }),
    ),
    /budget exceeded/,
  );
});

test('reject raw NaN weights and open wrist topology', async () => {
  await assert.rejects(
    validateDeformation(
      await mutate((doc, bin, offset) => {
        const a =
          doc.accessors[doc.meshes[0].primitives[0].attributes.WEIGHTS_0];
        bin.writeFloatLE(NaN, offset(a));
      }),
    ),
    /Invalid raw weight/,
  );
  await assert.rejects(
    validateDeformation(
      await mutate((doc) => {
        doc.accessors[doc.meshes[0].primitives[0].indices].count -= 3;
      }),
    ),
    /two-manifold|disconnected/,
  );
});

test('reject frozen skin animation and nonclosing stress loop', async () => {
  const alter = (close) =>
    mutate((doc, bin, offset) => {
      const clip = doc.animations.find((a) => a.name === 'knee-flexion');
      for (const sampler of clip.samplers) {
        const a = doc.accessors[sampler.output],
          components = { VEC3: 3, VEC4: 4 }[a.type];
        assert(components, 'Unexpected animation accessor');
        const start = offset(a),
          stride = components * 4;
        if (close)
          bin.copy(
            bin,
            start + (a.count - 1) * stride,
            start + Math.floor(a.count / 2) * stride,
            start + (Math.floor(a.count / 2) + 1) * stride,
          );
        else
          for (let i = 1; i < a.count; i++)
            bin.copy(bin, start + i * stride, start, start + stride);
      }
    });
  await assert.rejects(
    validateDeformation(await alter(false)),
    /Frozen skin stress|wrong flexion direction/,
  );
  await assert.rejects(
    validateDeformation(await alter(true)),
    /Stress loop does not close/,
  );
});

test('reject anatomically unrelated upper-body influence on thighs', async () => {
  await assert.rejects(
    validateDeformation(
      await mutate((doc, bin, offset) => {
        const primitive = doc.meshes[0].primitives[0];
        const p = doc.accessors[primitive.attributes.POSITION],
          j = doc.accessors[primitive.attributes.JOINTS_0],
          w = doc.accessors[primitive.attributes.WEIGHTS_0];
        const skin = doc.skins[0],
          joint = skin.joints.findIndex(
            (index) => doc.nodes[index].name === 'left_forearm',
          );
        const jSize = j.componentType === 5121 ? 1 : 2;
        for (let i = 0; i < p.count; i++) {
          const x = bin.readFloatLE(offset(p) + i * 12),
            y = bin.readFloatLE(offset(p) + i * 12 + 4);
          if (y < 0.9 && y > 0.7 && Math.abs(x) < 0.25) {
            const target = offset(j) + i * 4 * jSize;
            if (jSize === 1) bin.writeUInt8(joint, target);
            else bin.writeUInt16LE(joint, target);
            for (let k = 0; k < 4; k++)
              bin.writeFloatLE(k === 0 ? 1 : 0, offset(w) + i * 16 + k * 4);
          }
        }
      }),
    ),
    /Non-target skin moved/,
  );
});
