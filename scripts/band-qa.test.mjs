import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readGlb, validateGlb, validateEquipment } from './glb-qa.mjs';

function mutate(source, change) {
  const d = readGlb(source),
    b = Buffer.from(source.subarray(28 + source.readUInt32LE(12)));
  change(d, b);
  let json = Buffer.from(JSON.stringify(d));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
  const header = Buffer.alloc(20),
    bin = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + b.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  bin.writeUInt32LE(b.length);
  bin.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, json, bin, b]);
}
const primitive = (d) =>
  d.meshes.find((m) => m.name === 'elastic-band').primitives[0];
const offset = (d, a) => d.bufferViews[d.accessors[a].bufferView].byteOffset;
function channel(d, b, name, change) {
  const c = d.animations[0].channels.find(
    (c) =>
      d.nodes[c.target.node].name === name && c.target.path === 'translation',
  );
  const a = d.accessors[d.animations[0].samplers[c.sampler].output],
    o = d.bufferViews[a.bufferView].byteOffset;
  for (let i = 0; i < a.count; i++) change(b, o + i * 12, i);
}

test('five elastic clips deform with real palm/anchor attachment and body clearance', async () => {
  for (const id of [
    'band-row',
    'band-chest-press',
    'band-pull-apart',
    'band-face-pull',
    'band-external-rotation',
  ]) {
    const r = await validateGlb(`assets/exercises/${id}.glb`);
    assert.ok(r.bandAttachmentDriftMeters < 0.002, id);
    assert.ok(
      r.bandLengthRangeMeters[1] - r.bandLengthRangeMeters[0] > 0.15,
      id,
    );
    assert.ok(r.bandMinimumClearanceMeters >= -0.003, id);
  }
  assert.equal(
    (await validateEquipment('assets/equipment/resistance-band.glb')).vertices,
    72,
  );
  assert.equal(
    (await validateEquipment('assets/equipment/band-anchor.glb')).vertices,
    72,
  );
});

test('band exports reject fake endpoints, geometry, weights, transforms, stretch and skin crossings', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kimorel-band-'));
  const source = await readFile('assets/exercises/band-row.glb');
  try {
    const cases = [
      [
        (d) => {
          d.nodes.find((n) => n.name === 'elastic_band').skin = 0;
        },
        /two-endpoint skin/,
      ],
      [
        (d) => {
          d.nodes.find((n) => n.name === 'band_endpoint_0').name =
            'missing_endpoint';
        },
        /endpoint hierarchy/,
      ],
      [
        (d) => {
          d.nodes.find((n) => n.name === 'elastic_band').scale = [1.1, 1, 1];
        },
        /mesh transform/,
      ],
      [
        (d) => {
          d.nodes.find((n) => n.name === 'band_endpoint_1').scale = [1, 1.1, 1];
        },
        /endpoint scale/,
      ],
      [
        (d, b) => {
          b.writeFloatLE(
            0.4,
            offset(d, primitive(d).attributes.WEIGHTS_0) + 32 * 16,
          );
        },
        /skin weights/,
      ],
      [
        (d, b) => {
          b.writeUInt16LE(1, offset(d, primitive(d).attributes.JOINTS_0));
        },
        /skin weights/,
      ],
      [
        (d, b) => {
          b.writeFloatLE(0.02, offset(d, primitive(d).attributes.POSITION));
        },
        /rest geometry/,
      ],
      [
        (d, b) => {
          b.writeUInt32LE(1, offset(d, primitive(d).indices));
        },
        /topology/,
      ],
      [
        (d, b) => {
          b.writeFloatLE(
            0.1,
            offset(d, d.skins[1].inverseBindMatrices) + 12 * 4,
          );
        },
        /inverse bind/,
      ],
      [
        (d) => {
          d.nodes.find(
            (n) => n.name === 'right_hand_band_grip',
          ).translation[1] = 0;
        },
        /palm marker/,
      ],
      [
        (d, b) => {
          channel(d, b, 'band_endpoint_1', (b, o) => b.writeFloatLE(2, o));
        },
        /attachment drift/,
      ],
      [
        (d, b) => {
          channel(d, b, 'band_endpoint_0', (b, o, i) => {
            if (i === 1) b.writeFloatLE(0.03, o + 4);
          });
        },
        /attachment drift/,
      ],
      [
        (d, b) => {
          channel(d, b, 'band_endpoint_1', (b, o) =>
            b.writeFloatLE(0.48, o + 8),
          );
        },
        /attachment drift/,
      ],
      [
        (d) => {
          const c = d.animations[0].channels.find(
            (c) =>
              d.nodes[c.target.node].name === 'band_endpoint_0' &&
              c.target.path === 'translation',
          );
          c.target.node = d.nodes.findIndex(
            (n) => n.name === 'equipment_band-anchor',
          );
        },
        /attachment drift|anchor moved|stretch/,
      ],
      [
        (d, b) => {
          // A real body triangle intersects the band halfway, well outside any palm exemption.
          const p = d.meshes[0].primitives[0],
            po = offset(d, p.attributes.POSITION),
            jo = offset(d, p.attributes.JOINTS_0),
            wo = offset(d, p.attributes.WEIGHTS_0),
            io = offset(d, p.indices);
          for (let j = 0; j < 3; j++) {
            const v = b.readUInt32LE(io + j * 4),
              point = [
                -0.4 + (j === 1 ? 0.02 : 0),
                1.17 + (j === 2 ? 0.02 : 0),
                0.9,
              ];
            for (let k = 0; k < 3; k++)
              b.writeFloatLE(point[k], po + v * 12 + k * 4);
            for (let k = 0; k < 4; k++) {
              b.writeUInt16LE(0, jo + v * 8 + k * 2);
              b.writeFloatLE(k === 0 ? 1 : 0, wo + v * 16 + k * 4);
            }
          }
        },
        /Band intersects body/,
      ],
    ];
    for (const [change, expected] of cases) {
      const file = join(directory, 'corrupt.glb');
      await writeFile(file, mutate(source, change));
      await assert.rejects(
        () => validateGlb(file, 'rep', 'band-row'),
        expected,
      );
    }
    // The same endpoint geometry cannot pass a false physical rest-length contract.
    const { qaProfiles } = await import('./glb-qa.mjs');
    const original = qaProfiles['band-row'].elasticBand.restLength;
    try {
      qaProfiles['band-row'].elasticBand.restLength = 0.1;
      await assert.rejects(
        () => validateGlb('assets/exercises/band-row.glb'),
        /stretch/,
      );
    } finally {
      qaProfiles['band-row'].elasticBand.restLength = original;
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
