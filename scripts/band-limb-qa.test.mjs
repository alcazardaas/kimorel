import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readGlb, validateGlb, validateEquipment } from './glb-qa.mjs';
const ids = [
  'band-internal-rotation',
  'band-pallof-press',
  'band-triceps-pushdown',
  'seated-band-hamstring-curl',
  'band-terminal-knee-extension',
  'band-hip-adduction',
  'band-ankle-dorsiflexion',
  'band-ankle-plantarflexion',
];
function mutate(source, change) {
  const d = readGlb(source),
    b = Buffer.from(source.subarray(28 + source.readUInt32LE(12)));
  change(d, b);
  let j = Buffer.from(JSON.stringify(d));
  j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 32)]);
  const h = Buffer.alloc(20),
    tail = Buffer.alloc(8);
  h.writeUInt32LE(0x46546c67);
  h.writeUInt32LE(2, 4);
  h.writeUInt32LE(28 + j.length + b.length, 8);
  h.writeUInt32LE(j.length, 12);
  h.writeUInt32LE(0x4e4f534a, 16);
  tail.writeUInt32LE(b.length);
  tail.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([h, j, tail, b]);
}
const offset = (d, index) =>
  d.bufferViews[d.accessors[index].bufferView].byteOffset;
function detach(d, name, parent) {
  const index = d.nodes.findIndex((n) => n.name === name);
  for (const node of d.nodes)
    if (node.children) node.children = node.children.filter((i) => i !== index);
  d.scenes[0].nodes = d.scenes[0].nodes.filter((i) => i !== index);
  d.nodes.find((n) => n.name === parent).children ??= [];
  d.nodes.find((n) => n.name === parent).children.push(index);
}

test('eight band actions prove cuff/skin or two-hand contact with distinct deformation', async () => {
  for (const id of ids) {
    const r = await validateGlb(`assets/exercises/${id}.glb`);
    assert.ok(r.bandAttachmentDriftMeters < 0.002, id);
    assert.ok(r.bandMinimumClearanceMeters >= -0.003, id);
    assert.ok(r.bandCuffSkinGapMeters <= 0.025, id);
  }
  for (const kind of [
    'band-shin-strap',
    'band-knee-strap',
    'band-foot-strap',
    'band-handle',
  ])
    assert.ok(
      (await validateEquipment(`assets/equipment/${kind}.glb`)).vertices >= 24,
    );
});

test('limb bands reject fake cuffs, hand substitutions, invalid binds, moved roots and broken handle grips', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kimorel-limb-band-'));
  try {
    const cases = [
      [
        'band-ankle-dorsiflexion',
        (d) => {
          d.nodes.find((n) => n.name === 'band_strap_0').name = 'missing_cuff';
        },
        /Missing physical band strap/,
      ],
      [
        'band-ankle-dorsiflexion',
        (d) => {
          d.nodes.find((n) => n.name === 'band_distal_0').translation[1] +=
            0.03;
        },
        /Band palm marker moved|attachment moved/,
      ],
      [
        'band-ankle-dorsiflexion',
        (d) => detach(d, 'band_distal_0', 'right_hand'),
        /attachment marker/,
      ],
      [
        'band-ankle-dorsiflexion',
        (d) => detach(d, 'band_strap_0', 'right_shin'),
        /not attached/,
      ],
      [
        'band-ankle-dorsiflexion',
        (d) => {
          d.nodes.find((n) => n.name === 'band_strap_0').translation[2] += 0.1;
        },
        /cuff moved/,
      ],
      [
        'band-ankle-dorsiflexion',
        (d) => {
          d.nodes.find((n) => n.name === 'band_strap_0').scale = [1.1, 1, 1];
        },
        /cuff moved/,
      ],
      [
        'band-ankle-dorsiflexion',
        (d, b) => {
          const node = d.nodes.find((n) => n.name === 'band_strap_0'),
            p = d.meshes[node.mesh].primitives[0];
          b.writeFloatLE(0.1, offset(d, p.attributes.POSITION));
        },
        /geometry mismatch/,
      ],
      [
        'band-ankle-dorsiflexion',
        (d, b) => {
          const node = d.nodes.find((n) => n.name === 'band_strap_0'),
            p = d.meshes[node.mesh].primitives[0];
          b.writeUInt32LE(1, offset(d, p.indices));
        },
        /topology mismatch/,
      ],
      [
        'band-ankle-dorsiflexion',
        (d, b) => {
          b.writeFloatLE(NaN, offset(d, d.skins[1].inverseBindMatrices));
        },
        /Non-finite limb-band inverse bind/,
      ],
      [
        'band-ankle-dorsiflexion',
        (d) => {
          const i = d.nodes.findIndex(
            (n) => n.name === 'equipment_band-anchor',
          );
          d.scenes[0].nodes = d.scenes[0].nodes.filter((n) => n !== i);
          d.scenes[0].nodes.push(d.nodes.length);
          d.nodes.push({
            name: 'moved_anchor_parent',
            translation: [0.5, 0, 0],
            children: [i],
          });
        },
        /independent roots/,
      ],
      [
        'band-pallof-press',
        (d) => {
          d.nodes.find((n) => n.name === 'band_handle').name = 'missing_handle';
        },
        /Missing two-hand/,
      ],
      [
        'band-pallof-press',
        (d) => {
          d.nodes.find((n) => n.name === 'band_handle').scale = [1.5, 1, 1];
        },
        /handle transform/,
      ],
      [
        'band-pallof-press',
        (d, b) => {
          const a = d.animations[0],
            c = a.channels.find(
              (c) =>
                d.nodes[c.target.node].name === 'band_handle' &&
                c.target.path === 'translation',
            );
          const accessor = d.accessors[a.samplers[c.sampler].output],
            o = offset(d, a.samplers[c.sampler].output);
          for (let i = 0; i < accessor.count; i++)
            b.writeFloatLE(0.06, o + i * 12);
        },
        /attachment drift|two-hand handle grip/,
      ],
      [
        'band-pallof-press',
        (d) => detach(d, 'band_distal_1', 'left_hand'),
        /attachment marker/,
      ],
    ];
    for (const [id, change, expected] of cases) {
      const bytes = await readFile(`assets/exercises/${id}.glb`),
        file = join(directory, 'bad.glb');
      await writeFile(file, mutate(bytes, change));
      await assert.rejects(() => validateGlb(file, 'rep', id), expected);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('standalone new band attachments reject node scale and broken topology', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kimorel-band-standalone-'));
  try {
    const source = await readFile('assets/equipment/band-foot-strap.glb'),
      file = join(directory, 'band-foot-strap.glb');
    await writeFile(
      file,
      mutate(source, (d) => {
        d.nodes[0].scale = [2, 1, 1];
      }),
    );
    await assert.rejects(() => validateEquipment(file), /attachment transform/);
    await writeFile(
      file,
      mutate(source, (d, b) => {
        b.writeUInt32LE(1, offset(d, d.meshes[0].primitives[0].indices));
      }),
    );
    await assert.rejects(() => validateEquipment(file), /topology mismatch/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
