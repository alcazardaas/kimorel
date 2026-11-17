import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readGlb, validateGlb, validateEquipment } from './glb-qa.mjs';
const ids = [
  'barbell-back-squat',
  'barbell-front-squat',
  'barbell-conventional-deadlift',
  'barbell-good-morning',
  'barbell-bench-press',
  'barbell-overhead-press',
  'barbell-bent-over-row',
  'hip-thrust',
];

function mutate(source, change) {
  const doc = readGlb(source),
    binary = Buffer.from(source.subarray(28 + source.readUInt32LE(12)));
  change(doc, binary);
  let json = Buffer.from(JSON.stringify(doc));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
  const header = Buffer.alloc(20),
    bin = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + binary.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  bin.writeUInt32LE(binary.length);
  bin.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, json, bin, binary]);
}
function outputs(doc, binary, names, freeze = false, deltaY = 0) {
  for (const channel of doc.animations[0].channels) {
    if (!names.includes(doc.nodes[channel.target.node].name)) continue;
    const a = doc.accessors[doc.animations[0].samplers[channel.sampler].output];
    const offset =
        doc.bufferViews[a.bufferView].byteOffset + (a.byteOffset ?? 0),
      width = a.type === 'VEC4' ? 16 : 12;
    if (freeze)
      for (let row = 1; row < a.count; row++)
        binary.copy(binary, offset + row * width, offset, offset + width);
    if (deltaY && channel.target.path === 'translation')
      for (let row = 0; row < a.count; row++)
        binary.writeFloatLE(
          binary.readFloatLE(offset + row * width + 4) + deltaY,
          offset + row * width + 4,
        );
  }
}

test('eight shared-bar clips verify two grips, actual surfaces, clearances and support', async () => {
  for (const id of ids) {
    const r = await validateGlb(`assets/exercises/${id}.glb`);
    assert.ok(r.barGripDriftMeters < 0.005, id);
    assert.ok(r.barShaftClearanceMeters >= -0.003, id);
    assert.ok(r.barPlateClearanceMeters >= 0.015, id);
  }
  assert.equal(
    (await validateEquipment('assets/equipment/barbell.glb')).vertices,
    72,
  );
  assert.equal(
    (await validateEquipment('assets/equipment/barbell-pad.glb')).vertices,
    24,
  );
});

test('shared-bar QA rejects independent-hand fakes, broken shafts, head contact and unsupported loads', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kimorel-bar-'));
  try {
    const cases = [
      [
        'barbell-front-squat',
        (d) => {
          d.nodes.find((n) => n.name === 'barbell').scale = [1, 1.1, 1];
        },
        /not rigid meter scale/,
      ],
      [
        'barbell-front-squat',
        (d) => {
          d.nodes.find((n) => n.name === 'left_hand_bar_grip').name =
            'missing_grip';
        },
        /two-hand bar grip/,
      ],
      [
        'barbell-overhead-press',
        (d, b) =>
          outputs(d, b, ['left_upper_arm', 'left_forearm', 'left_hand'], true),
        /Two-hand bar grip drift/,
      ],
      [
        'barbell-bent-over-row',
        (d, b) => outputs(d, b, ['barbell'], true),
        /Two-hand bar grip drift/,
      ],
      [
        'barbell-front-squat',
        (d) => {
          const i = d.nodes.findIndex((n) => n.name === 'barbell');
          d.scenes[0].nodes = d.scenes[0].nodes.filter((n) => n !== i);
          d.nodes.find((n) => n.name === 'left_hand').children.push(i);
        },
        /independent scene load/,
      ],
      [
        'barbell-front-squat',
        (d, b) => {
          const node = d.nodes.find((n) => n.name === 'barbell'),
            a =
              d.accessors[
                d.meshes[node.mesh].primitives[0].attributes.POSITION
              ];
          b.writeFloatLE(0, d.bufferViews[a.bufferView].byteOffset);
        },
        /Shared bar geometry mismatch/,
      ],
      [
        'barbell-front-squat',
        (d, b) => {
          const node = d.nodes.find((n) => n.name === 'barbell'),
            a = d.accessors[d.meshes[node.mesh].primitives[0].indices];
          b.writeUInt32LE(1, d.bufferViews[a.bufferView].byteOffset);
        },
        /Shared bar topology mismatch/,
      ],
      [
        'barbell-overhead-press',
        (d) => {
          d.nodes.find((n) => n.name === 'head').translation = [0, -0.11, 0.26];
        },
        /Bar shaft intersects body\/head/,
      ],
      [
        'barbell-conventional-deadlift',
        (d, b) => {
          d.nodes.find((n) => n.name === 'root').translation[1] -= 0.03;
          outputs(d, b, ['barbell'], false, -0.03);
        },
        /Bar plate penetrates ground/,
      ],
      [
        'hip-thrust',
        (d) => {
          d.nodes.find((n) => n.name === 'barbell_pad').name = 'missing_pad';
        },
        /Missing rigid bar geometry/,
      ],
      [
        'hip-thrust',
        (d) => {
          d.nodes.find((n) => n.name === 'barbell_pad').translation = [
            0, 0.02, 0,
          ];
        },
        /hip pad attachment/,
      ],
      [
        'barbell-bench-press',
        (d) => {
          d.nodes.find(
            (n) => n.name === 'right_hand_bar_grip',
          ).translation[0] += 0.02;
        },
        /displaced grip marker/,
      ],
    ];
    for (const [id, change, expected] of cases) {
      const path = join(directory, 'bad.glb');
      await writeFile(
        path,
        mutate(await readFile(`assets/exercises/${id}.glb`), change),
      );
      await assert.rejects(() => validateGlb(path, 'rep', id), expected, id);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
