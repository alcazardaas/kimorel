import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import {
  folder,
  ids,
  validateCatalogBinding,
  validateCatalogExercise,
} from './character-v2-catalog-qa.mjs';

async function mutate(id, change) {
  const bytes = await readFile(folder + id + '.glb');
  const size = bytes.readUInt32LE(12),
    doc = JSON.parse(bytes.subarray(20, 20 + size));
  const binary = Buffer.from(bytes.subarray(28 + size));
  const at = (accessor) =>
    (doc.bufferViews[accessor.bufferView].byteOffset ?? 0) +
    (accessor.byteOffset ?? 0);
  change(doc, binary, at);
  let json = Buffer.from(JSON.stringify(doc));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
  const header = Buffer.from(bytes.subarray(0, 20));
  header.writeUInt32LE(28 + json.length + binary.length, 8);
  header.writeUInt32LE(json.length, 12);
  const tail = Buffer.alloc(8);
  tail.writeUInt32LE(binary.length);
  tail.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, json, tail, binary]);
}

test('six actual derived-body exports match independent source clips, native skin and contact phases', async () => {
  await validateCatalogBinding();
  for (const id of ids) {
    const report = await validateCatalogExercise(
      id,
      await readFile(folder + id + '.glb'),
    );
    assert.equal(report.samples, 121);
    assert(report.edgeRatio <= 6);
    assert.equal(report.anatomicalValidation, false);
  }
});
test('frozen/wrong-rest-basis joint tracks cannot substitute for the exercise', async () => {
  await assert.rejects(
    validateCatalogExercise(
      'reverse-lunge',
      await mutate('reverse-lunge', (doc, binary, at) => {
        for (const channel of doc.animations[0].channels.filter(
          (channel) => channel.target.path === 'rotation',
        )) {
          const accessor =
            doc.accessors[doc.animations[0].samplers[channel.sampler].output];
          for (let i = 0; i < accessor.count; i++)
            for (let k = 0; k < 4; k++)
              binary.writeFloatLE(
                k === 3 ? 1 : 0,
                at(accessor) + (i * 4 + k) * 4,
              );
        }
      }),
    ),
    /canonical trajectory\/rest basis/,
  );
});
test('changed native geometry and tiny skin weights are rejected independently of manifest hashes', async () => {
  for (const attribute of ['POSITION', 'WEIGHTS_0']) {
    await assert.rejects(
      validateCatalogExercise(
        'lateral-lunge',
        await mutate('lateral-lunge', (doc, binary, at) => {
          const primitive = doc.meshes
            .flatMap((mesh) => mesh.primitives)
            .find((primitive) => primitive.attributes.WEIGHTS_0 !== undefined);
          binary.writeFloatLE(
            0.123,
            at(doc.accessors[primitive.attributes[attribute]]),
          );
        }),
      ),
      /Neutral geometry|Native named skin weights/,
    );
  }
});
test('frozen corrective influences are rejected against independent v1 joint-angle envelopes', async () => {
  await assert.rejects(
    validateCatalogExercise(
      'lateral-lunge',
      await mutate('lateral-lunge', (doc, binary, at) => {
        for (const channel of doc.animations[0].channels.filter(
          (channel) => channel.target.path === 'weights',
        )) {
          const accessor =
            doc.accessors[doc.animations[0].samplers[channel.sampler].output];
          for (let i = 0; i < accessor.count; i++)
            binary.writeFloatLE(0, at(accessor) + i * 4);
        }
      }),
    ),
    /pose-derived morph envelope/,
  );
});
test('detached calf forefoot pivots are rejected against the frozen v1 marker, not writer frames', async () => {
  await assert.rejects(
    validateCatalogExercise(
      'standing-calf-raise',
      await mutate('standing-calf-raise', (doc, binary, at) => {
        const node = doc.nodes.findIndex(
          (node) => node.name === 'left_forefoot',
        );
        const channel = doc.animations[0].channels.find(
          (channel) =>
            channel.target.node === node &&
            channel.target.path === 'translation',
        );
        assert(channel);
        const accessor =
          doc.accessors[doc.animations[0].samplers[channel.sampler].output];
        for (let i = 0; i < accessor.count; i++)
          binary.writeFloatLE(
            binary.readFloatLE(at(accessor) + i * 12) + 0.1,
            at(accessor) + i * 12,
          );
      }),
    ),
    /Forefoot marker diverges/,
  );
});

test('unmodified inherited groin field is not accepted as the derived candidate', async () => {
  await assert.rejects(
    validateCatalogExercise(
      'reverse-lunge',
      await readFile('pipeline/character-v2/catalog-v2/reverse-lunge.glb'),
    ),
    /Native named skin weights/,
  );
});

test('independent analytic collar is continuous across the old left/right weight jump and exact outside', async () => {
  const { groinField } = await import('./character-v2-catalog-qa.mjs');
  const a = groinField([-0.000001, 0.85, 0], { right_thigh: 1 }),
    b = groinField([0.000001, 0.85, 0], { left_thigh: 1 });
  assert(Object.keys(a).every((name) => Math.abs(a[name] - b[name]) < 0.00001));
  for (const point of [
    [0.18, 0.85, 0],
    [0, 0.65, 0],
    [0, 1.1, 0],
    [0, 0.85, 0.23],
  ])
    assert.deepEqual(groinField(point, { right_thigh: 1 }), { right_thigh: 1 });
});
