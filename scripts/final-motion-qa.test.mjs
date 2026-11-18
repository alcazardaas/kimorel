import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readGlb, validateGlb, validateEquipment } from './glb-qa.mjs';
const ids = [
  'pull-up',
  'inverted-row',
  'dead-hang',
  'hanging-knee-raise',
  'bench-dip',
  'pike-push-up',
  'ab-wheel-rollout',
  'shoulder-pendulum',
  'forearm-wall-slide',
  'scapular-retraction',
  'chin-tuck',
  'cervical-rotation',
  'cervical-lateral-flexion',
  'ankle-dorsiflexion-rock',
  'ninety-ninety-hip-rotation',
  'half-kneeling-hip-flexor-stretch',
  'childs-pose',
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
const node = (d, name) => d.nodes.find((n) => n.name === name);
function freeze(d, b, name, path) {
  const i = d.nodes.findIndex((n) => n.name === name),
    a = d.animations[0];
  const channel = a.channels.find(
    (c) => c.target.node === i && c.target.path === path,
  );
  assert.ok(channel, `${name}.${path}`);
  const accessor = d.accessors[a.samplers[channel.sampler].output],
    offset = d.bufferViews[accessor.bufferView].byteOffset,
    size = path === 'rotation' ? 4 : 3;
  for (let frame = 1; frame < accessor.count; frame++)
    b.copy(b, offset + frame * size * 4, offset, offset + size * 4);
}
function reparent(d, name) {
  const id = d.nodes.findIndex((n) => n.name === name);
  d.scenes[0].nodes = d.scenes[0].nodes.filter((i) => i !== id);
  d.nodes.push({
    name: 'unexpected_parent',
    translation: [0, 0.2, 0],
    children: [id],
  });
  d.scenes[0].nodes.push(d.nodes.length - 1);
}

test('final seventeen exercise exports prove real support, rolling and mobility', async () => {
  for (const id of ids) {
    const r = await validateGlb(`assets/exercises/${id}.glb`);
    assert.equal(r.profile, id);
    if (id === 'ab-wheel-rollout') assert.ok(r.wheelNoSlipRadians < 0.002);
    if (id === 'forearm-wall-slide') assert.ok(r.wallForearmGapMeters < 0.035);
  }
  for (const id of ['hanging-frame', 'low-frame', 'pendulum-table', 'ab-wheel'])
    assert.ok(
      (await validateEquipment(`assets/equipment/${id}.glb`)).bytes > 0,
    );
});

test('hanging and rolling exports reject displaced grips, animated supports and fake wheel travel', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimorel-final100-'));
  try {
    const cases = [
      [
        'pull-up',
        (d, b) => {
          const mesh = d.meshes[node(d, 'equipment_hanging-frame').mesh];
          const a = d.accessors[mesh.primitives[0].indices],
            offset = d.bufferViews[a.bufferView].byteOffset;
          b.writeUInt32LE(0, offset + 4);
        },
        /support topology/,
      ],
      [
        'ab-wheel-rollout',
        (d, b) => {
          const mesh = d.meshes[node(d, 'ab_wheel').mesh];
          const a = d.accessors[mesh.primitives[0].indices],
            offset = d.bufferViews[a.bufferView].byteOffset;
          b.writeUInt32LE(0, offset + 4);
        },
        /wheel topology/,
      ],

      [
        'ab-wheel-rollout',
        (d) => {
          node(d, 'right_shin').translation[1] += 0.06;
        },
        /contact|grip|drift/i,
      ],
      [
        'childs-pose',
        (d) => {
          node(d, 'right_shin').translation[1] += 0.06;
        },
        /contact|drift/i,
      ],
      [
        'pull-up',
        (d) => {
          node(d, 'human').translation = [0, 0.2, 0];
        },
        /human mesh transform/,
      ],

      [
        'pull-up',
        (d) => {
          node(d, 'left_hand_support_grip').translation[0] += 0.05;
        },
        /support grip/,
      ],
      [
        'pull-up',
        (d) => {
          node(d, 'equipment_hanging-frame').translation[2] += 0.1;
        },
        /physical|equipment/,
      ],
      [
        'pull-up',
        (d) => reparent(d, 'equipment_hanging-frame'),
        /physical hanging|inherited|physical support/i,
      ],
      [
        'pull-up',
        (d, b) => freeze(d, b, 'pelvis', 'translation'),
        /Joint travel|physical|support/i,
      ],
      [
        'hanging-knee-raise',
        (d, b) => freeze(d, b, 'left_thigh', 'rotation'),
        /Joint travel|contact|drift|physical/i,
      ],
      [
        'ab-wheel-rollout',
        (d) => {
          node(d, 'left_wheel_grip').translation[0] = 0.2;
        },
        /Wheel axle grip/,
      ],
      [
        'ab-wheel-rollout',
        (d, b) => freeze(d, b, 'ab_wheel', 'rotation'),
        /rolling invariant|ground contact/,
      ],
      [
        'ab-wheel-rollout',
        (d) => {
          node(d, 'ab_wheel').scale = [2, 1, 1];
        },
        /wheel topology|root rolling/,
      ],
      ['ab-wheel-rollout', (d) => reparent(d, 'ab_wheel'), /root rolling/],
      [
        'forearm-wall-slide',
        (d) => {
          node(d, 'equipment_wall').translation[2] += 0.1;
        },
        /equipment transform|wall support|physical wall|support transform/i,
      ],
      [
        'scapular-retraction',
        (d, b) => freeze(d, b, 'left_clavicle', 'translation'),
        /Translation range/,
      ],
      [
        'chin-tuck',
        (d, b) => freeze(d, b, 'neck', 'translation'),
        /Translation range/,
      ],
      [
        'cervical-rotation',
        (d, b) => freeze(d, b, 'neck', 'rotation'),
        /authored motion|articulation/i,
      ],
      [
        'cervical-lateral-flexion',
        (d, b) => freeze(d, b, 'neck', 'rotation'),
        /authored motion|articulation/i,
      ],
      [
        'ninety-ninety-hip-rotation',
        (d, b) => freeze(d, b, 'left_thigh', 'rotation'),
        /articulation|drift/,
      ],
    ];
    for (const [id, change, match] of cases) {
      const bytes = await readFile(`assets/exercises/${id}.glb`);
      const p = join(dir, `${id}.glb`);
      await writeFile(p, mutate(bytes, change));
      await assert.rejects(() => validateGlb(p, undefined, id), match, id);
    }
    const bytes = await readFile('assets/equipment/ab-wheel.glb');
    const p = join(dir, 'ab-wheel.glb');
    await writeFile(
      p,
      mutate(bytes, (d) => {
        d.nodes[0].scale = [2, 1, 1];
      }),
    );
    await assert.rejects(() => validateEquipment(p), /wheel topology or scale/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
