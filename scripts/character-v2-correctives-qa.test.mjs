import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { readGlb } from './glb-qa.mjs';
import {
  correctivesFile,
  floatAccessor,
  playbackTimes,
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
  for (const clip of Object.values(report.clips)) {
    assert(clip.playback.samples >= 4);
    assert.equal(clip.playback.maxEndpointCorrectionMeters, 0);
    assert.equal(clip.playback.maxEndpointBaselineErrorMeters, 0);
  }
  assert(report.clips['shoulder-elevation'].playback.samples > 60);
  const originalMetrics = JSON.parse(JSON.stringify(report));
  for (const clip of Object.values(originalMetrics.clips)) delete clip.playback;
  assert.deepEqual(
    originalMetrics,
    JSON.parse(
      await readFile(
        'pipeline/character-v2/correctives/qa-report.json',
        'utf8',
      ),
    ),
    'Existing midpoint metrics changed',
  );
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

// Replace only an unrelated clip's weight sampler; all asset mutations stay in memory.
async function wristWeightFixture(times, values, interpolation = 'LINEAR') {
  return mutate((doc, binary) => {
    const clip = doc.animations.find((a) => a.name === 'wrist-flexion');
    const channel = clip.channels.find((c) => c.target.path === 'weights');
    const sampler = clip.samplers[channel.sampler];
    const chunks = [];
    for (const [field, data] of [
      ['input', times],
      ['output', values],
    ]) {
      const bytes = Buffer.from(new Float32Array(data).buffer);
      const view = doc.bufferViews.length;
      doc.bufferViews.push({
        buffer: 0,
        byteOffset: binary.length + chunks.reduce((n, b) => n + b.length, 0),
        byteLength: bytes.length,
      });
      sampler[field] = doc.accessors.length;
      doc.accessors.push({
        bufferView: view,
        componentType: 5126,
        count: data.length,
        type: 'SCALAR',
        ...(field === 'input' ? { min: [times[0]], max: [times.at(-1)] } : {}),
      });
      chunks.push(bytes);
    }
    sampler.interpolation = interpolation;
    const result = Buffer.concat([binary, ...chunks]);
    doc.buffers[0].byteLength = result.length;
    return result;
  });
}

test('reject matching nonzero morph corrections at both neutral endpoints', async () => {
  await assert.rejects(
    validateCorrectives(
      await mutate((doc, bin, offset) => {
        const a = weights(doc, 'shoulder-elevation'),
          start = offset(a);
        bin.writeFloatLE(0.2, start);
        bin.writeFloatLE(0.2, start + (a.count - 2) * 4);
      }),
    ),
    /endpoint/,
  );
});

test('reject unrelated corrective activation away from the midpoint', async () => {
  const times = [1 / 30, 0.5, 61 / 60, 1.5, 61 / 30];
  await assert.rejects(
    validateCorrectives(
      await wristWeightFixture(times, [0, 0, 0.2, 0, 0, 0, 0, 0, 0, 0]),
    ),
    /Unrelated morph activation/,
  );
});

test('reject unrelated cubic interpolation pulse between zero-valued keys', async () => {
  const times = [1 / 30, 0.45, 61 / 60, 61 / 30];
  // glTF triples: in-tangent, value, out-tangent; both target values stay zero.
  const values = [0, 0, 0, 0, 4, 0, -4, 0, 0, 0, 0, 0, ...Array(12).fill(0)];
  await assert.rejects(
    validateCorrectives(await wristWeightFixture(times, values, 'CUBICSPLINE')),
    /Unrelated morph activation/,
  );
});

test('analytical extrema expose positive off-midpoint overshoot that keys/midpoint miss', async () => {
  // Unit interval Hermite: p0=.9, p1=.1, out0=2, in1=0.
  // w'(t)=10.8(t-5/27)(t-1): minimum is .1, so no negative-weight failure.
  const upperBound = 1;
  const keyAndMidpointTimes = [0, 0.5, 1];
  const bytes = await wristWeightFixture(
    [0, 1],
    [0, 0, 0.9, 0, 2, 0, 0, 0, 0.1, 0, 0, 0],
    'CUBICSPLINE',
  );
  const doc = readGlb(bytes);
  const animation = doc.animations.find((a) => a.name === 'wrist-flexion');
  const channel = animation.channels.find((c) => c.target.path === 'weights');
  const values = floatAccessor(
    bytes,
    doc,
    animation.samplers[channel.sampler].output,
  );
  // Evaluate the ACTUAL encoded float32 curve using the Hermite basis, separate
  // from production's derivative-root calculation. Target two stays zero.
  const weight = (t) =>
    (2 * t ** 3 - 3 * t ** 2 + 1) * values[2] +
    (t ** 3 - 2 * t ** 2 + t) * values[4] +
    (-2 * t ** 3 + 3 * t ** 2) * values[8] +
    (t ** 3 - t ** 2) * values[6];
  assert(keyAndMidpointTimes.every((t) => weight(t) < upperBound));
  assert(Math.min(weight(0), weight(5 / 27), weight(1)) > 0);
  assert(weight(5 / 27) > upperBound);
  // Exercise only the real scheduling helper: full GLB validation would reject
  // unrelated activation/nonzero endpoints first and would not isolate extrema.
  const probes = playbackTimes(bytes, doc, 'wrist-flexion', 1, 2);
  assert(
    probes.some((t) => Math.abs(t - 5 / 27) < 1e-6),
    'Missing analytical extremum',
  );
  const detectsOvershoot = (times) =>
    assert(
      times.some((t) => weight(t) > upperBound),
      'Off-midpoint bound crossing not detected',
    );
  detectsOvershoot(probes);
  // Read-only mutation control: disable analytical-root probes, retaining every
  // key/segment midpoint. The SAME acceptance assertion must now fail.
  const withoutExtrema = probes.filter((t) => keyAndMidpointTimes.includes(t));
  assert.deepEqual(withoutExtrema, keyAndMidpointTimes);
  assert.throws(
    () => detectsOvershoot(withoutExtrema),
    /Off-midpoint bound crossing not detected/,
  );
});
