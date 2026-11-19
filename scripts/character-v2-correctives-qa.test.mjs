import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import {
  correctivesFile,
  floatAccessor,
  validateCorrectives,
} from './character-v2-correctives-qa.mjs';

async function mutate(change) {
  const bytes = await readFile(correctivesFile),
    size = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.subarray(20, 20 + size));
  let binary = Buffer.from(bytes.subarray(28 + size));
  const offset = (a) => {
    const s = a.sparse;
    return s
      ? (doc.bufferViews[s.values.bufferView].byteOffset ?? 0) +
          (s.values.byteOffset ?? 0)
      : (doc.bufferViews[a.bufferView].byteOffset ?? 0) + (a.byteOffset ?? 0);
  };
  binary = change(doc, binary, offset, bytes) ?? binary;
  let json = Buffer.from(JSON.stringify(doc));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
  const header = Buffer.from(bytes.subarray(0, 20));
  header.writeUInt32LE(28 + json.length + binary.length, 8);
  header.writeUInt32LE(json.length, 12);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binary.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, json, binHeader, binary]);
}

function weights(doc, name) {
  const clip = doc.animations.find((a) => a.name === name),
    channel = clip.channels.find((c) => c.target.path === 'weights');
  return doc.accessors[clip.samplers[channel.sampler].output];
}

test('exported corrective morphs play with skin and improve local sharp residual', async () => {
  const report = await validateCorrectives(await readFile(correctivesFile));
  for (const name of ['shoulder-elevation', 'hip-flexion']) {
    assert(report.clips[name].residualReduction > 0.01);
    assert(report.clips[name].maxSkinCorrectionMeters > 0.001);
  }
  assert.equal(report.engineering.preservedLegacyCenters, 18);
});

test('reject missing and frozen baked morph channels', async () => {
  await assert.rejects(
    validateCorrectives(
      await mutate((doc) => {
        const clip = doc.animations.find(
          (a) => a.name === 'shoulder-elevation',
        );
        clip.channels = clip.channels.filter(
          (c) => c.target.path !== 'weights',
        );
      }),
    ),
    /Missing baked morph track/,
  );
  await assert.rejects(
    validateCorrectives(
      await mutate((doc, bin, offset) => {
        const a = weights(doc, 'hip-flexion');
        bin.fill(0, offset(a), offset(a) + a.count * 4);
      }),
    ),
    /Frozen morph track/,
  );
});

test('reject NaN morph positions and raw skin weights', async () => {
  await assert.rejects(
    validateCorrectives(
      await mutate((doc, bin, offset) => {
        bin.writeFloatLE(
          NaN,
          offset(
            doc.accessors[doc.meshes[0].primitives[0].targets[0].POSITION],
          ),
        );
      }),
    ),
    /Non-finite raw morph/,
  );
  await assert.rejects(
    validateCorrectives(
      await mutate((doc, bin, offset) => {
        bin.writeFloatLE(
          NaN,
          offset(
            doc.accessors[doc.meshes[0].primitives[0].attributes.WEIGHTS_0],
          ),
        );
      }),
    ),
    /raw weight/,
  );
});

test('reject corrective on remote head geometry and corrupted legacy joint', async () => {
  await assert.rejects(
    validateCorrectives(
      await mutate((doc, bin, _offset, bytes) => {
        const primitive = doc.meshes[0].primitives[0],
          index = primitive.targets[0].POSITION,
          a = doc.accessors[index];
        const positions = floatAccessor(
            bytes,
            doc,
            primitive.attributes.POSITION,
          ),
          values = floatAccessor(bytes, doc, index);
        let remote = 0;
        for (let i = 1; i < a.count; i++)
          if (
            Math.hypot(...positions.slice(i * 3, i * 3 + 3)) >
            Math.hypot(...positions.slice(remote * 3, remote * 3 + 3))
          )
            remote = i;
        values[remote * 3] = 0.02;
        const data = Buffer.from(values.buffer);
        a.bufferView = doc.bufferViews.length;
        a.byteOffset = 0;
        delete a.sparse;
        doc.bufferViews.push({
          buffer: 0,
          byteOffset: bin.length,
          byteLength: data.length,
        });
        doc.buffers[0].byteLength = bin.length + data.length;
        return Buffer.concat([bin, data]);
      }),
    ),
    /remote region|unrelated skin|Non-target skin/,
  );
  await assert.rejects(
    validateCorrectives(
      await mutate((doc) => {
        doc.nodes.find((n) => n.name === 'left_thigh').translation[0] += 0.1;
      }),
    ),
    /Legacy joint center|Neutral silhouette|Height tolerance/,
  );
});

test('reject morph neutral-return failure', async () => {
  await assert.rejects(
    validateCorrectives(
      await mutate((doc, bin, offset) => {
        const a = weights(doc, 'shoulder-elevation'),
          start = offset(a);
        // Two targets per sample; force the final shoulder weight to one.
        bin.writeFloatLE(1, start + (a.count - 2) * 4);
      }),
    ),
    /loop does not close|neutral|Legacy joint|Height tolerance|silhouette/i,
  );
});
