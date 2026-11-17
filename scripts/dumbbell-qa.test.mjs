import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGlb, validateGlb, validateEquipment } from './glb-qa.mjs';

function mutate(source, change) {
  const doc = readGlb(source);
  const binary = Buffer.from(source.subarray(28 + source.readUInt32LE(12)));
  change(doc, binary);
  let json = Buffer.from(JSON.stringify(doc));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
  const header = Buffer.alloc(20),
    binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + binary.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(binary.length);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, json, binHeader, binary]);
}

function freeze(doc, binary, names) {
  for (const channel of doc.animations[0].channels) {
    if (!names.includes(doc.nodes[channel.target.node].name)) continue;
    const accessor =
      doc.accessors[doc.animations[0].samplers[channel.sampler].output];
    const offset =
      doc.bufferViews[accessor.bufferView].byteOffset +
      (accessor.byteOffset ?? 0);
    const width = accessor.type === 'VEC4' ? 16 : 12;
    for (let row = 1; row < accessor.count; row++)
      binary.copy(binary, offset + row * width, offset, offset + width);
  }
}

const ids = [
  'dumbbell-pullover',
  'dumbbell-reverse-fly',
  'lying-triceps-extension',
  'overhead-triceps-extension',
  'dumbbell-side-bend',
  'side-lying-dumbbell-external-rotation',
];
test('six distinct dumbbell clips and full-length physical bench pass exported QA', async () => {
  for (const id of ids)
    assert.equal((await validateGlb(`assets/exercises/${id}.glb`)).profile, id);
  assert.ok(
    (await validateEquipment('assets/equipment/flat-bench.glb'))
      .dimensionsMeters[2] > 1.49,
  );
});

test('exported QA rejects static aliases, false upper-arm motion, missing support and wrong load sides', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kimorel-dumbbell-'));
  try {
    const cases = [
      [
        'dumbbell-side-bend',
        (d) => {
          d.nodes.find((n) => n.name === 'right_hand_grip').translation = [
            0.105, -0.131, -0.01,
          ];
        },
        /Body penetrates dumbbell/,
      ],
      [
        'dumbbell-pullover',
        (d, b) => freeze(d, b, ['left_upper_arm', 'left_forearm', 'left_hand']),
        /Joint travel range/,
      ],
      [
        'dumbbell-reverse-fly',
        (d, b) =>
          freeze(d, b, [
            'left_upper_arm',
            'left_forearm',
            'left_hand',
            'left_clavicle',
          ]),
        /Joint travel range/,
      ],
      [
        'lying-triceps-extension',
        (d, b) => freeze(d, b, ['left_forearm']),
        /Missing authored articulation/,
      ],
      [
        'overhead-triceps-extension',
        (d, b) => freeze(d, b, ['right_forearm']),
        /Missing authored articulation/,
      ],
      [
        'dumbbell-side-bend',
        (d, b) => freeze(d, b, ['spine', 'chest']),
        /Joint travel range|Missing authored articulation/,
      ],
      [
        'side-lying-dumbbell-external-rotation',
        (d, b) => freeze(d, b, ['right_upper_arm']),
        /Joint travel range|Missing authored articulation/,
      ],
      [
        'lying-triceps-extension',
        (d) => {
          const channels = d.animations[0].channels;
          channels.find(
            (c) => d.nodes[c.target.node].name === 'left_upper_arm',
          ).sampler = channels.find(
            (c) => d.nodes[c.target.node].name === 'left_forearm',
          ).sampler;
        },
        /Excess authored articulation/,
      ],
      [
        'dumbbell-pullover',
        (d) => {
          d.nodes.find((n) => n.name === 'equipment_flat-bench').name =
            'missing_bench';
        },
        /Missing rigid support/,
      ],
      [
        'dumbbell-side-bend',
        (d) => {
          d.nodes.find((n) => n.name === 'right_hand_dumbbell').name =
            'left_hand_dumbbell';
        },
        /Missing stable equipment|Undeclared dumbbell|Missing dumbbell clearance geometry/,
      ],
    ];
    for (const [id, change, error] of cases) {
      const bytes = mutate(
        await readFile(`assets/exercises/${id}.glb`),
        change,
      );
      const path = join(directory, 'bad.glb');
      await writeFile(path, bytes);
      await assert.rejects(() => validateGlb(path, 'rep', id), error, id);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
