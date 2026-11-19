/** Independent exported draft proof, not anatomical or release approval. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { AnimationMixer, Box3, LoopOnce, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readGlb } from './glb-qa.mjs';

function validateRawWeights(bytes) {
  const doc = readGlb(bytes);
  const binary = 28 + bytes.readUInt32LE(12);
  for (const mesh of doc.meshes ?? [])
    for (const primitive of mesh.primitives) {
      const accessor = doc.accessors[primitive.attributes.WEIGHTS_0];
      assert(
        accessor?.componentType === 5126 && accessor.type === 'VEC4',
        'Expected raw float skin weights',
      );
      const view = doc.bufferViews[accessor.bufferView];
      const start =
        binary + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      for (let i = 0; i < accessor.count; i++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          const weight = bytes.readFloatLE(
            start + i * (view.byteStride ?? 16) + k * 4,
          );
          assert(
            Number.isFinite(weight) && weight >= 0 && weight <= 1,
            'Invalid raw skin weight',
          );
          sum += weight;
        }
        assert(Math.abs(sum - 1) < 1e-5, 'Raw skin weights not normalized');
      }
    }
}

function surfaceComponents(position, index) {
  const parent = Array.from({ length: position.count }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a, b) => {
    parent[find(a)] = find(b);
  };
  const welded = new Map();
  for (let i = 0; i < position.count; i++) {
    const key = [position.getX(i), position.getY(i), position.getZ(i)]
      .map((v) => v.toFixed(6))
      .join(',');
    if (welded.has(key)) union(i, welded.get(key));
    else welded.set(key, i);
  }
  for (let i = 0; i < index.count; i += 3) {
    union(index.getX(i), index.getX(i + 1));
    union(index.getX(i), index.getX(i + 2));
  }
  return new Set(parent.map((_, i) => find(i))).size;
}

export async function validatePrototype(bytes) {
  validateRawWeights(bytes);
  const loaded = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  loaded.scene.updateMatrixWorld(true);
  const meshes = [];
  const bones = new Map();
  loaded.scene.traverse((object) => {
    if (object.isBone) bones.set(object.name, object);
    if (object.isMesh) meshes.push(object);
  });
  assert.equal(bones.size, 50, 'Expected 50 semantic export joints');
  const legacy = readGlb(await readFile('assets/characters/neutral-human.glb'));
  const verifyCenters = (index, parent = new Vector3()) => {
    const node = legacy.nodes[index];
    const point = parent
      .clone()
      .add(new Vector3(...(node.translation ?? [0, 0, 0])));
    if (bones.has(node.name))
      assert(
        bones.get(node.name).getWorldPosition(new Vector3()).distanceTo(point) <
          1e-5,
        'Legacy joint center changed',
      );
    for (const child of node.children ?? []) verifyCenters(child, point);
  };
  for (const index of legacy.scenes[legacy.scene ?? 0].nodes)
    verifyCenters(index);

  assert.equal(meshes.length, 3, 'Expected body and two separate draft hands');
  let vertices = 0;
  let triangles = 0;
  for (const mesh of meshes) {
    assert(mesh.isSkinnedMesh, 'Every draft surface must be skinned');
    const position = mesh.geometry.getAttribute('position');
    const normal = mesh.geometry.getAttribute('normal');
    const weights = mesh.geometry.getAttribute('skinWeight');
    const joints = mesh.geometry.getAttribute('skinIndex');
    assert(
      position && normal && weights && joints,
      'Missing surface/skin attributes',
    );
    assert(
      [...position.array, ...normal.array, ...weights.array].every(
        Number.isFinite,
      ),
      'Non-finite surface/skin data',
    );
    for (let i = 0; i < position.count; i++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        const weight = weights.getComponent(i, k);
        const joint = joints.getComponent(i, k);
        assert(weight >= 0 && weight <= 1, 'Invalid skin weight');
        assert(
          Number.isInteger(joint) && joint < mesh.skeleton.bones.length,
          'Invalid skin joint',
        );
        sum += weight;
      }
      assert(Math.abs(sum - 1) < 1e-5, 'Skin weights not normalized');
      const n = new Vector3().fromBufferAttribute(normal, i);
      assert(Math.abs(n.length() - 1) < 1e-4, 'Invalid surface normal');
    }
    const index = mesh.geometry.index;
    assert(index && index.count % 3 === 0, 'Expected indexed triangles');
    assert.equal(
      surfaceComponents(position, index),
      1,
      'Disconnected surface components',
    );
    const a = new Vector3(),
      b = new Vector3(),
      c = new Vector3();
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(position, index.getX(i));
      b.fromBufferAttribute(position, index.getX(i + 1));
      c.fromBufferAttribute(position, index.getX(i + 2));
      assert(
        b.sub(a).cross(c.sub(a)).length() > 1e-12,
        'Degenerate surface triangle',
      );
    }
    vertices += position.count;
    triangles += index.count / 3;
  }
  const bounds = new Box3().setFromObject(loaded.scene);
  assert(
    bounds.max.y - bounds.min.y > 1.8 && bounds.max.y - bounds.min.y < 1.9,
    'Legacy stature changed',
  );
  for (const side of ['left', 'right']) {
    for (const digit of ['thumb', 'index', 'middle', 'ring', 'little']) {
      for (let i = 1; i <= 3; i++) {
        const joint = bones.get(`${side}_${digit}_${i}`);
        assert(joint, 'Missing articulated digit');
        assert.equal(
          joint.parent.name,
          i === 1 ? `${side}_hand` : `${side}_${digit}_${i - 1}`,
          'Invalid digit hierarchy',
        );
      }
    }
  }
  const clip = loaded.animations.find(
    (item) => item.name === 'hand-articulation-smoke',
  );
  assert(
    clip && clip.duration > 1.9 && clip.duration < 2.1,
    'Missing hand smoke clip',
  );
  const hand = meshes.find((mesh) => mesh.name.includes('left-hand'));
  assert(hand, 'Missing left hand surface');
  const mixer = new AnimationMixer(loaded.scene);
  const action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const sample = (time) => {
    mixer.setTime(time);
    loaded.scene.updateMatrixWorld(true);
    hand.skeleton.update();
    const points = [];
    for (let i = 0; i < hand.geometry.getAttribute('position').count; i++)
      points.push(
        hand.getVertexPosition(i, new Vector3()).applyMatrix4(hand.matrixWorld),
      );
    assert(
      points.every((p) => p.toArray().every(Number.isFinite)),
      'Non-finite deformed surface',
    );
    return points;
  };
  const start = sample(0),
    closed = sample(clip.duration / 2),
    end = sample(clip.duration);
  const movement = Math.max(
    ...start.map((point, i) => point.distanceTo(closed[i])),
  );
  const loop = Math.max(...start.map((point, i) => point.distanceTo(end[i])));
  assert(movement > 0.025, 'Finger joints do not deform actual hand skin');
  assert(loop < 1e-5, 'Hand smoke loop does not close');
  mixer.stopAllAction();
  mixer.uncacheRoot(loaded.scene);
  return {
    vertices,
    triangles,
    meshes: meshes.length,
    joints: bones.size,
    heightMeters: bounds.max.y - bounds.min.y,
    handSkinTravelMeters: movement,
    loopErrorMeters: loop,
    status: 'draft-needs-review',
    clinicalValidation: false,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(
    JSON.stringify(
      await validatePrototype(
        await readFile('pipeline/character-v2/prototype/character-v2.glb'),
      ),
      null,
      2,
    ),
  );
