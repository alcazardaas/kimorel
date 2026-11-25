import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { AnimationMixer, LoopOnce, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  pilotFolder,
  pilotIds,
  validatePilot,
} from './character-v2-pilot-qa.mjs';

async function mutate(id, change) {
  const bytes = await readFile(pilotFolder + id + '.glb');
  const size = bytes.readUInt32LE(12),
    doc = JSON.parse(bytes.subarray(20, 20 + size));
  const binary = Buffer.from(bytes.subarray(28 + size));
  const offset = (accessor) =>
    (doc.bufferViews[accessor.bufferView].byteOffset ?? 0) +
    (accessor.byteOffset ?? 0);
  change(doc, binary, offset);
  let json = Buffer.from(JSON.stringify(doc));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
  const header = Buffer.from(bytes.subarray(0, 20));
  header.writeUInt32LE(28 + json.length + binary.length, 8);
  header.writeUInt32LE(json.length, 12);
  const tail = Buffer.alloc(8);
  tail.writeUInt32LE(binary.length, 0);
  tail.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, json, tail, binary]);
}

test('three real exercise exports preserve canonical trajectories, skin, morphs and physical contacts', async () => {
  for (const id of pilotIds) {
    const report = await validatePilot(
      id,
      await readFile(pilotFolder + id + '.glb'),
    );
    assert(report.movementMeters > 0.1);
    assert(report.canonicalJointErrorMeters < 2e-5);
    assert(report.loopErrorMeters < 2e-5);
  }
});
test('stress aliases cannot substitute for the real rep', async () => {
  await assert.rejects(
    validatePilot(
      'bodyweight-squat',
      await mutate('bodyweight-squat', (doc) => {
        doc.animations[0].name = 'shoulder-elevation';
      }),
    ),
    /four-second exercise rep/,
  );
});
test('wrong local rotation basis and frozen joint curves are rejected', async () => {
  await assert.rejects(
    validatePilot(
      'push-up',
      await mutate('push-up', (doc, binary, offset) => {
        for (const channel of doc.animations[0].channels.filter(
          (c) => c.target.path === 'rotation',
        )) {
          const accessor =
            doc.accessors[doc.animations[0].samplers[channel.sampler].output];
          for (let i = 0; i < accessor.count; i++)
            for (let k = 0; k < 4; k++)
              binary.writeFloatLE(
                k === 3 ? 1 : 0,
                offset(accessor) + (i * 4 + k) * 4,
              );
        }
      }),
    ),
    /trajectory\/rest basis|orientation\/rest basis|floor contact/,
  );
});
test('detached dumbbell trajectories are rejected', async () => {
  await assert.rejects(
    validatePilot(
      'dumbbell-shoulder-press',
      await mutate('dumbbell-shoulder-press', (doc, binary, offset) => {
        const node = doc.nodes.findIndex(
          (n) => n.name === 'left_hand_dumbbell',
        );
        const channel = doc.animations[0].channels.find(
          (c) => c.target.node === node && c.target.path === 'translation',
        );
        assert(channel, 'Expected actual rigid equipment track');
        const accessor =
          doc.accessors[doc.animations[0].samplers[channel.sampler].output];
        for (let i = 0; i < accessor.count; i++) {
          const at = offset(accessor) + i * 12;
          binary.writeFloatLE(binary.readFloatLE(at) + 0.1, at);
        }
      }),
    ),
    /detached from canonical palm grip/,
  );
});
test('frozen corrective weights and changed neutral geometry are rejected', async () => {
  await assert.rejects(
    validatePilot(
      'bodyweight-squat',
      await mutate('bodyweight-squat', (doc, binary, offset) => {
        for (const channel of doc.animations[0].channels.filter(
          (c) => c.target.path === 'weights',
        )) {
          const accessor =
            doc.accessors[doc.animations[0].samplers[channel.sampler].output];
          binary.fill(
            0,
            offset(accessor),
            offset(accessor) + accessor.count * 4,
          );
        }
      }),
    ),
    /not derived from actual exercise pose/,
  );
  await assert.rejects(
    validatePilot(
      'bodyweight-squat',
      await mutate('bodyweight-squat', (doc, binary, offset) => {
        const accessor =
          doc.accessors[
            doc.meshes.find(
              (m) => m.primitives[0].attributes.WEIGHTS_0 !== undefined,
            ).primitives[0].attributes.POSITION
          ];
        binary.writeFloatLE(
          binary.readFloatLE(offset(accessor)) + 0.01,
          offset(accessor),
        );
      }),
    ),
    /bind geometry changed/,
  );
});

test('annular chest ownership on adjacent arm vertices cannot pass deformation proof', async () => {
  await assert.rejects(
    validatePilot(
      'dumbbell-shoulder-press',
      await mutate('dumbbell-shoulder-press', (doc, binary, offset) => {
        const node = doc.nodes.find(
          (n) => n.skin !== undefined && n.mesh !== undefined,
        );
        const primitive = doc.meshes[node.mesh].primitives[0];
        const joints = doc.accessors[primitive.attributes.JOINTS_0],
          weights = doc.accessors[primitive.attributes.WEIGHTS_0];
        const boneIndices = doc.skins[node.skin].joints;
        for (const [vertex, name] of [
          [16715, 'chest'],
          [16718, 'right_upper_arm'],
        ]) {
          const joint = boneIndices.findIndex(
            (index) => doc.nodes[index].name === name,
          );
          assert(joint >= 0);
          for (let component = 0; component < 4; component++) {
            const at =
              offset(joints) +
              (vertex * 4 + component) *
                (joints.componentType === 5121 ? 1 : 2);
            if (joints.componentType === 5121)
              binary.writeUInt8(component === 0 ? joint : 0, at);
            else binary.writeUInt16LE(component === 0 ? joint : 0, at);
            binary.writeFloatLE(
              component === 0 ? 1 : 0,
              offset(weights) + (vertex * 4 + component) * 4,
            );
          }
        }
      }),
    ),
    /Native named weights mismatch|Whole-mesh skinned edge elongation|Whole-arm (core retains unrelated torso influence|limb retains stationary trunk influence)|Whole-arm semantic adjacency gradient/,
  );
});

test('actual sparse corrective corruption is rejected by surface deformation proof', async () => {
  await assert.rejects(
    validatePilot(
      'dumbbell-shoulder-press',
      await mutate('dumbbell-shoulder-press', (doc, binary) => {
        const mesh = doc.meshes.find((m) => m.extras?.targetNames);
        const target = mesh.extras.targetNames.indexOf(
          'shoulder-elevation-patch',
        );
        const accessor =
          doc.accessors[mesh.primitives[0].targets[target].POSITION];
        assert(accessor.sparse, 'Expected actual exported sparse corrective');
        const values = accessor.sparse.values;
        const start =
          (doc.bufferViews[values.bufferView].byteOffset ?? 0) +
          (values.byteOffset ?? 0);
        for (let i = 0; i < accessor.sparse.count; i++)
          binary.writeFloatLE(0.5, start + i * 12 + 4);
      }),
    ),
    (error) => {
      assert.match(
        error.message,
        /Whole-mesh skinned edge elongation|Shoulder corrective displacement gradient/,
      );
      if (error.message.startsWith('Shoulder')) {
        assert(
          Number(error.message.split(': ').at(-1)) > 20,
          'Mutation must fail beyond normal shoulder gradient',
        );
        return true;
      }
      const report = JSON.parse(
        error.message.slice(error.message.indexOf('{')),
      );
      assert(
        report.maximumRatio > 20,
        'Mutation must fail beyond the existing positive-candidate defect',
      );
      return true;
    },
  );
});

test('rough hip displacement gradients are rejected without changing activation', async () => {
  await assert.rejects(
    validatePilot(
      'bodyweight-squat',
      await mutate('bodyweight-squat', (doc, binary, offset) => {
        const mesh = doc.meshes.find((m) => m.extras?.targetNames);
        const accessor =
          doc.accessors[
            mesh.primitives[0].targets[
              mesh.extras.targetNames.indexOf('hip-flexion-patch')
            ].POSITION
          ];
        const start = accessor.sparse
          ? (doc.bufferViews[accessor.sparse.values.bufferView].byteOffset ??
              0) + (accessor.sparse.values.byteOffset ?? 0)
          : offset(accessor);
        binary.writeFloatLE(0.2, start + 4);
      }),
    ),
    /Hip corrective displacement gradient/,
  );
});

test('elbow torso contamination is rejected in the semantic arm core', async () => {
  await assert.rejects(
    validatePilot(
      'dumbbell-shoulder-press',
      await mutate('dumbbell-shoulder-press', (doc, binary, offset) => {
        const node = doc.nodes.find(
            (n) => n.skin !== undefined && n.mesh !== undefined,
          ),
          primitive = doc.meshes[node.mesh].primitives[0];
        const joints = doc.accessors[primitive.attributes.JOINTS_0],
          weights = doc.accessors[primitive.attributes.WEIGHTS_0];
        const pelvis = doc.skins[node.skin].joints.findIndex(
          (i) => doc.nodes[i].name === 'pelvis',
        );
        for (let k = 0; k < 4; k++) {
          const at =
            offset(joints) +
            (13174 * 4 + k) * (joints.componentType === 5121 ? 1 : 2);
          if (joints.componentType === 5121)
            binary.writeUInt8(k === 0 ? pelvis : 0, at);
          else binary.writeUInt16LE(k === 0 ? pelvis : 0, at);
          binary.writeFloatLE(
            k === 0 ? 1 : 0,
            offset(weights) + (13174 * 4 + k) * 4,
          );
        }
      }),
    ),
    /Native named weights mismatch|Whole-arm (core retains unrelated torso influence|limb retains stationary trunk influence)|Whole-arm semantic adjacency gradient/,
  );
});

test('old stitched shoulder field is rejected by whole-arm adjacency proof', async () => {
  await assert.rejects(
    validatePilot(
      'bodyweight-squat',
      await mutate('bodyweight-squat', (doc, binary, offset) => {
        const node = doc.nodes.find(
            (n) => n.skin !== undefined && n.mesh !== undefined,
          ),
          primitive = doc.meshes[node.mesh].primitives[0];
        const joints = doc.accessors[primitive.attributes.JOINTS_0],
          weights = doc.accessors[primitive.attributes.WEIGHTS_0];
        for (const [vertex, field] of [
          [
            16468,
            {
              chest: 0.475337714,
              right_upper_arm: 0.43998301,
              right_forearm: 0.082757466,
              spine: 0.001921812,
            },
          ],
          [
            16466,
            {
              chest: 0.349983037,
              right_upper_arm: 0.534780741,
              right_forearm: 0.113106936,
              spine: 0.002129298,
            },
          ],
        ])
          for (const [k, [name, weight]] of Object.entries(field).entries()) {
            const joint = doc.skins[node.skin].joints.findIndex(
              (i) => doc.nodes[i].name === name,
            );
            const at =
              offset(joints) +
              (vertex * 4 + k) * (joints.componentType === 5121 ? 1 : 2);
            if (joints.componentType === 5121) binary.writeUInt8(joint, at);
            else binary.writeUInt16LE(joint, at);
            binary.writeFloatLE(weight, offset(weights) + (vertex * 4 + k) * 4);
          }
      }),
    ),
    /Native named weights mismatch|Whole-arm core retains unrelated torso influence|Whole-arm semantic adjacency gradient/,
  );
});

test('rough shoulder corrective gradients cannot pass with correct pose activation', async () => {
  await assert.rejects(
    validatePilot(
      'dumbbell-shoulder-press',
      await mutate('dumbbell-shoulder-press', (doc, binary, offset) => {
        const mesh = doc.meshes.find((m) => m.extras?.targetNames),
          target = mesh.extras.targetNames.indexOf('shoulder-elevation-patch');
        const accessor =
          doc.accessors[mesh.primitives[0].targets[target].POSITION];
        const start = accessor.sparse
          ? (doc.bufferViews[accessor.sparse.values.bufferView].byteOffset ??
              0) + (accessor.sparse.values.byteOffset ?? 0)
          : offset(accessor);
        binary.writeFloatLE(0.2, start + 4);
      }),
    ),
    /Shoulder corrective displacement gradient/,
  );
});

test('restored bad proximal palm weights fail the unchanged actual deformation gate', async () => {
  const bad = [
    [
      7260,
      {
        right_hand: 0.4748743176460266,
        right_thumb_1: 0.21609938144683838,
        right_forearm: 0.1624073088169098,
        right_ring_1: 0.14661899209022522,
      },
    ],
    [
      7324,
      {
        right_hand: 0.45610275864601135,
        right_thumb_1: 0.22813956439495087,
        right_ring_1: 0.16646522283554077,
        right_little_1: 0.149292454123497,
      },
    ],
  ];
  const corrupted = await mutate(
    'dumbbell-shoulder-press',
    (doc, binary, offset) => {
      const body = doc.meshes.find((m) =>
        m.primitives.some((p) => p.attributes.WEIGHTS_0 !== undefined),
      );
      const primitive = body.primitives[0];
      const skin =
        doc.skins[
          doc.nodes.find((n) => n.mesh === doc.meshes.indexOf(body)).skin
        ];
      const joints = doc.accessors[primitive.attributes.JOINTS_0];
      const weights = doc.accessors[primitive.attributes.WEIGHTS_0];
      assert.equal(joints.componentType, 5121);
      for (const [index, old] of bad)
        for (const [slot, [name, weight]] of Object.entries(
          Object.entries(old),
        )) {
          const joint = skin.joints.findIndex(
            (i) => doc.nodes[i].name === name,
          );
          assert(joint >= 0);
          binary.writeUInt8(joint, offset(joints) + index * 4 + Number(slot));
          binary.writeFloatLE(
            weight,
            offset(weights) + (index * 4 + Number(slot)) * 4,
          );
        }
    },
  );
  const loaded = await new GLTFLoader().parseAsync(
    corrupted.buffer.slice(
      corrupted.byteOffset,
      corrupted.byteOffset + corrupted.byteLength,
    ),
    '',
  );
  const mesh = loaded.scene.getObjectsByProperty('isSkinnedMesh', true)[0];
  const rest = new Vector3()
    .fromBufferAttribute(mesh.geometry.attributes.position, 7260)
    .distanceTo(
      new Vector3().fromBufferAttribute(
        mesh.geometry.attributes.position,
        7324,
      ),
    );
  const mixer = new AnimationMixer(loaded.scene);
  const action = mixer.clipAction(loaded.animations[0]);
  action.clampWhenFinished = true;
  action.setLoop(LoopOnce, 1).play();
  mixer.setTime(4);
  loaded.scene.updateMatrixWorld(true);
  mesh.skeleton.update();
  const point = (i) =>
    mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld);
  assert(
    point(7260).distanceTo(point(7324)) / rest > 7.4,
    'Restored original weights must independently exceed unchanged6x gate',
  );
  await assert.rejects(
    validatePilot('dumbbell-shoulder-press', corrupted),
    /Native named weights mismatch|Whole-arm semantic adjacency|Whole-mesh skinned edge elongation/,
  );
});

test('exporter-style tiny influence pruning is rejected against native provenance', async () => {
  await assert.rejects(
    validatePilot(
      'dumbbell-shoulder-press',
      await mutate('dumbbell-shoulder-press', (doc, binary, offset) => {
        const body = doc.meshes.find((m) =>
          m.primitives.some((p) => p.attributes.WEIGHTS_0 !== undefined),
        );
        const accessor = doc.accessors[body.primitives[0].attributes.WEIGHTS_0];
        for (let i = 0; i < accessor.count; i++) {
          const base = offset(accessor) + i * 16;
          const values = Array.from({ length: 4 }, (_, slot) =>
            binary.readFloatLE(base + slot * 4),
          );
          const slot = values.findIndex(
            (weight) => weight > 0 && weight <= 0.0001,
          );
          if (slot < 0) continue;
          values[slot] = 0;
          const total = values.reduce((a, b) => a + b, 0);
          values.forEach((weight, slot) =>
            binary.writeFloatLE(weight / total, base + slot * 4),
          );
          return;
        }
        assert.fail('Expected restored tiny influence');
      }),
    ),
    /Native named weights mismatch/,
  );
});
