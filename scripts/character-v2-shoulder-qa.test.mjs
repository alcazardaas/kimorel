import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { validateShoulder, shoulderFile } from './character-v2-shoulder-qa.mjs';
import {
  correctivesFile,
  floatAccessor,
} from './character-v2-correctives-qa.mjs';
import { readGlb } from './glb-qa.mjs';

const bytes = await readFile(shoulderFile),
  oldBytes = await readFile(correctivesFile);
function alter(run) {
  const changed = Buffer.from(bytes),
    doc = readGlb(changed),
    base = 28 + changed.readUInt32LE(12);
  run(changed, doc, base);
  return changed;
}
function offset(doc, base, accessor) {
  const a = doc.accessors[accessor],
    v = doc.bufferViews[a.bufferView];
  return base + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
}
function replaceMorph(original, source) {
  const doc = readGlb(original),
    old = readGlb(source),
    binary = original.subarray(28 + original.readUInt32LE(12));
  const i = doc.meshes[0].extras.targetNames.indexOf(
      'shoulder-elevation-patch',
    ),
    j = old.meshes[0].extras.targetNames.indexOf('shoulder-elevation-patch'),
    chunks = [binary];
  let length = binary.length;
  for (const semantic of ['POSITION', 'NORMAL']) {
    const values = floatAccessor(
        source,
        old,
        old.meshes[0].primitives[0].targets[j][semantic],
      ),
      chunk = Buffer.from(values.buffer);
    const view = doc.bufferViews.length;
    doc.bufferViews.push({
      buffer: 0,
      byteOffset: length,
      byteLength: chunk.length,
    });
    const accessor = doc.accessors.length;
    doc.accessors.push({
      bufferView: view,
      componentType: 5126,
      count: values.length / 3,
      type: 'VEC3',
    });
    doc.meshes[0].primitives[0].targets[i][semantic] = accessor;
    chunks.push(chunk);
    length += chunk.length;
  }
  doc.buffers[0].byteLength = length;
  let json = Buffer.from(JSON.stringify(doc));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const bin = Buffer.concat(chunks),
    header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + bin.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, json, binHeader, bin]);
}
test('actual shoulder variant improves every sampled pose while preserving exact bindings and motion', async () => {
  const report = await validateShoulder(bytes, oldBytes);
  assert.equal(report.humanApproval, false);
  assert.equal(report.vertices, 26939);
  assert.equal(report.samples.length, 7);
  assert(report.changedWeightVertices > 100);
});
test('unchanged baseline cannot masquerade as a rebuilt shoulder variant', async () => {
  await assert.rejects(
    validateShoulder(oldBytes, oldBytes),
    /Stale|Frozen|improve/,
  );
});
test('frozen arm animation is rejected independently of strain improvement', async () => {
  const bad = alter((b, d, base) => {
    const a = d.animations.find((a) => a.name === 'shoulder-elevation');
    for (const channel of a.channels.filter(
      (c) => c.target.path === 'rotation',
    )) {
      const index = a.samplers[channel.sampler].output,
        accessor = d.accessors[index],
        start = offset(d, base, index);
      for (let i = 0; i < accessor.count; i++) {
        b.writeFloatLE(0, start + i * 16);
        b.writeFloatLE(0, start + i * 16 + 4);
        b.writeFloatLE(0, start + i * 16 + 8);
        b.writeFloatLE(1, start + i * 16 + 12);
      }
    }
  });
  await assert.rejects(validateShoulder(bad, oldBytes), /Frozen|changed bone/);
});
test('remote weight spill and NaN skin weights are rejected', async () => {
  for (const value of [0.5, NaN]) {
    const bad = alter((b, d, base) => {
      const primitive = d.meshes[0].primitives[0],
        p = floatAccessor(b, d, primitive.attributes.POSITION);
      let i = 0;
      while (p[i * 3 + 1] > 0.7) i++;
      const a = d.accessors[primitive.attributes.WEIGHTS_0],
        view = d.bufferViews[a.bufferView],
        stride = view.byteStride ?? 16;
      const start =
        offset(d, base, primitive.attributes.WEIGHTS_0) + i * stride;
      b.writeFloatLE(value, start);
    });
    await assert.rejects(
      validateShoulder(bad, oldBytes),
      /Remote|weight|Neutral/,
    );
  }
});
test('old shoulder morph mixed with new weights fails the rebuilt-target gate', async () => {
  await assert.rejects(
    validateShoulder(replaceMorph(bytes, oldBytes), oldBytes),
    /Stale shoulder/,
  );
});
test('excessive smoothing and neutral/topology changes are rejected', async () => {
  const neutral = alter((b, d, base) => {
    const i = d.meshes[0].primitives[0].attributes.POSITION,
      start = offset(d, base, i);
    b.writeFloatLE(b.readFloatLE(start) + 0.01, start);
  });
  await assert.rejects(validateShoulder(neutral, oldBytes), /Neutral vertex/);
  const topology = alter((b, d, base) => {
    const accessor = d.meshes[0].primitives[0].indices;
    const start = offset(d, base, accessor),
      size = d.accessors[accessor].componentType === 5123 ? 2 : 4;
    const first = Buffer.from(b.subarray(start, start + size));
    b.copy(b, start, start + size, start + 2 * size);
    first.copy(b, start + size);
  });
  await assert.rejects(validateShoulder(topology, oldBytes), /Triangle index/);
  const excessive = alter((b, d, base) => {
    const p = d.meshes[0].primitives[0],
      target =
        p.targets[
          d.meshes[0].extras.targetNames.indexOf('shoulder-elevation-patch')
        ],
      a = d.accessors[target.POSITION];
    const start =
      a.bufferView === undefined
        ? base +
          (d.bufferViews[a.sparse.values.bufferView].byteOffset ?? 0) +
          (a.sparse.values.byteOffset ?? 0)
        : offset(d, base, target.POSITION);
    b.writeFloatLE(1, start);
  });
  await assert.rejects(validateShoulder(excessive, oldBytes), /Excessive/);
});
