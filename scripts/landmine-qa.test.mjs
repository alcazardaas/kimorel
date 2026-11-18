import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readGlb, validateGlb, validateEquipment } from './glb-qa.mjs';

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

test('landmine press and row prove anchored rotation, actual grip and rotated clearances', async () => {
  for (const id of ['landmine-press', 'landmine-row']) {
    const report = await validateGlb(`assets/exercises/${id}.glb`);
    assert.ok(report.landmineGripDriftMeters < 0.005);
    assert.ok(report.landmineShaftClearanceMeters >= -0.003);
    assert.ok(report.landminePlateClearanceMeters >= -0.003);
    assert.ok(report.landmineMinimumGroundMeters > 0);
  }
  assert.equal(
    (await validateEquipment('assets/equipment/landmine-bar.glb')).vertices,
    48,
  );
  assert.equal(
    (await validateEquipment('assets/equipment/landmine-anchor.glb')).vertices,
    48,
  );
});

test('landmine exports reject floating pivots, fake distal grips and corrupted rigid geometry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kimorel-landmine-'));
  const source = await readFile('assets/exercises/landmine-press.glb');
  try {
    const cases = [
      [(d, b) => outputs(d, b, ['landmine'], false, 0.02), /pivot moved/],
      [
        (d) => {
          d.nodes.find(
            (n) => n.name === 'equipment_landmine-anchor',
          ).translation[1] += 0.02;
        },
        /transform mismatch|anchor moved/,
      ],
      [
        (d) => {
          d.nodes.find((n) => n.name === 'landmine').scale = [1.1, 1, 1];
        },
        /pivot moved or load scaled/,
      ],
      [
        (d) => {
          d.nodes.find((n) => n.name === 'right_hand_landmine_grip').name =
            'missing';
        },
        /distal landmine hand grip/,
      ],
      [
        (d) => {
          d.nodes.find(
            (n) => n.name === 'landmine_distal_grip',
          ).translation[0] -= 0.05;
        },
        /displaced landmine grip/,
      ],
      [
        (d, b) => outputs(d, b, ['landmine'], true),
        /Distal landmine grip drift/,
      ],
      [
        (d, b) =>
          outputs(
            d,
            b,
            ['right_upper_arm', 'right_forearm', 'right_hand'],
            true,
          ),
        /Distal landmine grip drift/,
      ],
      [
        (d) => {
          const index = d.nodes.findIndex((n) => n.name === 'landmine');
          d.scenes[0].nodes = d.scenes[0].nodes.filter((n) => n !== index);
          d.nodes.find((n) => n.name === 'right_hand').children.push(index);
        },
        /independent bar/,
      ],
      [
        (d, b) => {
          const mesh =
            d.meshes[d.nodes.find((n) => n.name === 'landmine').mesh];
          const a = d.accessors[mesh.primitives[0].attributes.POSITION];
          b.writeFloatLE(0.1, d.bufferViews[a.bufferView].byteOffset);
        },
        /Landmine geometry mismatch/,
      ],
      [
        (d, b) => {
          const mesh =
            d.meshes[d.nodes.find((n) => n.name === 'landmine').mesh];
          const a = d.accessors[mesh.primitives[0].indices];
          b.writeUInt32LE(1, d.bufferViews[a.bufferView].byteOffset);
        },
        /Landmine topology mismatch/,
      ],
      [
        (d) => {
          d.nodes.find((n) => n.name === 'head').translation = [-0.4, -0.32, 0];
        },
        /Landmine shaft intersects body\/head/,
      ],
      [
        (d, b) => {
          const primitive = d.meshes[0].primitives[0];
          const offset = (key) =>
            d.bufferViews[d.accessors[primitive.attributes[key]].bufferView]
              .byteOffset;
          const index = d.accessors[primitive.indices],
            io = d.bufferViews[index.bufferView].byteOffset;
          for (let j = 0; j < 3; j++) {
            const vertex = b.readUInt32LE(io + j * 4);
            for (const [axis, value] of [
              -0.3,
              0.12 + 1.425 * Math.sin(0.78),
              1.15 - 1.425 * Math.cos(0.78),
            ].entries())
              b.writeFloatLE(
                value +
                  (axis === 0 && j === 1
                    ? 0.002
                    : axis === 1 && j === 2
                      ? 0.002
                      : 0),
                offset('POSITION') + vertex * 12 + axis * 4,
              );
            for (let axis = 0; axis < 4; axis++) {
              b.writeUInt16LE(0, offset('JOINTS_0') + vertex * 8 + axis * 2);
              b.writeFloatLE(
                axis === 0 ? 1 : 0,
                offset('WEIGHTS_0') + vertex * 16 + axis * 4,
              );
            }
          }
        },
        /Landmine plate intersects skin/,
      ],
      [
        (d, b) => {
          const channel = d.animations[0].channels.find(
            (c) =>
              d.nodes[c.target.node].name === 'landmine' &&
              c.target.path === 'rotation',
          );
          const a =
              d.accessors[d.animations[0].samplers[channel.sampler].output],
            o = d.bufferViews[a.bufferView].byteOffset;
          for (let i = 0; i < a.count; i++)
            for (const [j, v] of [0, 0, -Math.SQRT1_2, Math.SQRT1_2].entries())
              b.writeFloatLE(v, o + i * 16 + j * 4);
        },
        /load penetrates ground/,
      ],
      [
        (d) => {
          const channel = d.animations[0].channels.find(
            (c) =>
              d.nodes[c.target.node].name === 'landmine' &&
              c.target.path === 'rotation',
          );
          channel.target.node = d.nodes.findIndex(
            (n) => n.name === 'equipment_landmine-anchor',
          );
        },
        /anchor moved/,
      ],
      // Initial transform is valid: corruption only appears after animation sampling.
      [
        (d, b) => {
          const channel = d.animations[0].channels.find(
            (c) =>
              d.nodes[c.target.node].name === 'landmine' &&
              c.target.path === 'translation',
          );
          const a =
            d.accessors[d.animations[0].samplers[channel.sampler].output];
          const o = d.bufferViews[a.bufferView].byteOffset;
          b.writeFloatLE(0.15, o + 12 + 4);
        },
        /pivot moved/,
      ],
    ];
    for (const [change, expected] of cases) {
      const file = join(directory, 'corrupt.glb');
      await writeFile(file, mutate(source, change));
      await assert.rejects(
        () => validateGlb(file, 'rep', 'landmine-press'),
        expected,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
