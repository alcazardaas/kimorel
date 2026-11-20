/** Original draft surface contours; never clinical/anatomical acceptance. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  maskBinding,
  serializeSparseMask,
} from '../packages/schemas/dist/muscle-masks-v2.js';
import {
  readBoundFile,
  writeSparseMask,
} from './character-v2-mask-pipeline.mjs';
import { validateMuscleCatalog } from './character-v2-muscles-qa.mjs';

export const folder = 'pipeline/character-v2/muscles-upper-arm-draft/';
export const root = new URL('../', import.meta.url);
const digest = (b) => createHash('sha256').update(b).digest('hex');
const smooth = (x) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};
export function widthAt(knots, t) {
  for (let i = 1; i < knots.length; i++)
    if (t >= knots[i - 1][0] && t <= knots[i][0]) {
      const [a, b] = [knots[i - 1], knots[i]],
        u = smooth((t - a[0]) / (b[0] - a[0]));
      return a[1] + (b[1] - a[1]) * u;
    }
  return 0;
}
export async function sourceGeometry() {
  const seed = JSON.parse(
    await readFile(
      new URL('pipeline/character-v2/muscle-catalog.json', root),
      'utf8',
    ),
  );
  assert.equal(
    seed.character.sha256,
    '61e83ec439d3e04deeec2cd5da771181044bfaae3e75dcea75ec3b8342c9c587',
    'Frozen draft character identity',
  );
  const bytes = await readBoundFile(
    root,
    seed.character.file,
    seed.character.sha256,
  );
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  gltf.scene.updateMatrixWorld(true);
  let mesh;
  gltf.scene.traverse((o) => {
    if (o.isSkinnedMesh) {
      assert(!mesh, 'Expected one body');
      mesh = o;
    }
  });
  assert.equal(mesh.geometry.attributes.position.count, 26939);
  assert.deepEqual(
    mesh.matrixWorld.elements,
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  );
  const positions = Array.from({ length: 26939 }, (_, i) =>
    new Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i),
  );
  const indices = Array.from(mesh.geometry.index.array);
  const adjacency = positions.map(() => new Set());
  for (let i = 0; i < indices.length; i += 3)
    for (const [a, b] of [
      [indices[i], indices[i + 1]],
      [indices[i + 1], indices[i + 2]],
      [indices[i + 2], indices[i]],
    ]) {
      adjacency[a].add(b);
      adjacency[b].add(a);
    }
  const frames = {};
  for (const side of ['left', 'right']) {
    const bone = (n) =>
      mesh.skeleton.bones
        .find((b) => b.name === `${side}_${n}`)
        .getWorldPosition(new Vector3());
    const shoulder = bone('upper_arm'),
      elbow = bone('forearm'),
      axis = elbow.clone().sub(shoulder),
      length = axis.length();
    axis.normalize();
    frames[side] = {
      shoulder,
      axis,
      length,
      lateral: new Vector3(side === 'left' ? 1 : -1, 0, 0)
        .addScaledVector(axis, -axis.x * (side === 'left' ? 1 : -1))
        .normalize(),
    };
  }
  return { seed, positions, indices, adjacency, frames };
}
export function coordinates(point, frame) {
  const delta = point.clone().sub(frame.shoulder),
    axial = delta.dot(frame.axis),
    radial = delta.addScaledVector(frame.axis, -axial);
  return {
    t: axial / frame.length,
    radius: radial.length(),
    angle: (Math.atan2(radial.dot(frame.lateral), radial.z) * 180) / Math.PI,
  };
}
export function connectedComponents(weights, adjacency) {
  const pending = new Set(weights.map((w) => w.vertexIndex)),
    groups = [];
  while (pending.size) {
    const first = pending.values().next().value,
      group = [first];
    pending.delete(first);
    for (let i = 0; i < group.length; i++)
      for (const next of adjacency[group[i]])
        if (pending.delete(next)) group.push(next);
    groups.push(group);
  }
  return groups.sort((a, b) => b.length - a.length);
}
export function authorMask(geometry, side, definition, feather) {
  const candidates = [];
  geometry.positions.forEach((point, vertexIndex) => {
    if (point.x * (side === 'left' ? 1 : -1) <= 0.14) return;
    const { t, radius, angle } = coordinates(point, geometry.frames[side]);
    const width = widthAt(definition.knots, t),
      difference = Math.abs(
        ((angle - definition.angleCenterDegrees + 540) % 360) - 180,
      );
    if (
      width <= 0 ||
      difference >= width ||
      radius < definition.radialRangeMeters[0] ||
      radius > definition.radialRangeMeters[1]
    )
      return;
    const weight = smooth((1 - difference / width) / feather);
    if (Math.fround(weight) > 0) candidates.push({ vertexIndex, weight });
  });
  const groups = connectedComponents(candidates, geometry.adjacency);
  assert(groups.length && groups[0].length > 20, 'Empty contour support');
  const keep = new Set(groups[0]);
  return {
    weights: candidates.filter((w) => keep.has(w.vertexIndex)),
    discardedVertices: candidates.length - keep.size,
  };
}
export function validatePatch(geometry, weights, side, definition) {
  assert(weights.length > 20 && weights.length < 2500, 'Patch support budget');
  assert.equal(
    connectedComponents(weights, geometry.adjacency).length,
    1,
    'Disconnected patch',
  );
  for (const { vertexIndex, weight } of weights) {
    assert(
      Number.isFinite(weight) &&
        weight > 0 &&
        weight <= 1 &&
        Math.fround(weight) > 0,
      'Invalid weight',
    );
    const point = geometry.positions[vertexIndex];
    assert(point, 'Vertex domain');
    assert(
      point.x * (side === 'left' ? 1 : -1) > 0.14,
      'Opposite side/torso leakage',
    );
    const { t, radius, angle } = coordinates(point, geometry.frames[side]);
    const width = widthAt(definition.knots, t),
      difference = Math.abs(
        ((angle - definition.angleCenterDegrees + 540) % 360) - 180,
      );
    assert(
      width > 0 &&
        difference < width &&
        radius >= definition.radialRangeMeters[0] &&
        radius <= definition.radialRangeMeters[1],
      'Contour spill/remote leakage',
    );
  }
  return { assignedVertices: weights.length, components: 1 };
}
const colors = ['#ef6c00', '#00838f', '#9c27b0', '#1565c0'];
export function inspectionSvg(geometry, masks) {
  const views = [
    ['FRONT', 0, false],
    ['BACK', 180, false],
    ['LEFT', 90, false],
    ['RIGHT', -90, false],
    ['OBLIQUE', 40, false],
    ['SHOULDER / ARM DETAIL', 25, true],
  ];
  const tint = geometry.positions.map(() => [180, 185, 193]);
  masks.forEach((m, k) => {
    const rgb = colors[k].match(/\w\w/g).map((x) => parseInt(x, 16));
    for (const w of m.weights)
      tint[w.vertexIndex] = tint[w.vertexIndex].map(
        (c, i) => c * (1 - w.weight) + rgb[i] * w.weight,
      );
  });
  let svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1060" viewBox="0 0 1500 1060"><rect width="1500" height="1060" fill="#f8fafc"/><g font-family="Arial,sans-serif" fill="#172033"><text x="30" y="34" font-size="24">DRAFT SURFACE APPROXIMATIONS — ANATOMICAL REVIEW PENDING</text><text x="30" y="60" font-size="15">Actual frozen mesh · no activation roles · existing underarm web retained · colors indicate coverage, not recruitment</text>';
  masks.forEach((m, k) => {
    svg += `<rect x="${30 + k * 365}" y="78" width="18" height="18" fill="${colors[k]}"/><text x="${55 + k * 365}" y="93" font-size="16">${m.id}</text>`;
  });
  views.forEach(([label, degrees, close], view) => {
    const ox = (view % 3) * 500,
      oy = 125 + Math.floor(view / 3) * 450,
      angle = (degrees * Math.PI) / 180;
    const projected = geometry.positions.map((p) => [
      p.x * Math.cos(angle) - p.z * Math.sin(angle),
      p.y,
      p.x * Math.sin(angle) + p.z * Math.cos(angle),
    ]);
    const scale = close ? 1050 : 205,
      cx = close ? 0.26 : 0,
      cy = close ? 1.3 : 0.92;
    svg += `<svg x="${ox + 8}" y="${oy}" width="484" height="435" viewBox="0 0 484 435"><rect x="0" y="0" width="484" height="435" rx="8" fill="white" stroke="#cbd5e1"/><text x="16" y="26" font-size="18">${label}</text><defs><clipPath id="surface-${view}"><rect x="1" y="40" width="482" height="394"/></clipPath></defs><g clip-path="url(#surface-${view})">`;
    const faces = [];
    for (let i = 0; i < geometry.indices.length; i += 3) {
      const ids = geometry.indices.slice(i, i + 3),
        p = ids.map((id) => projected[id]);
      if (close && p.every((v) => v[1] < 1.02 || v[1] > 1.61)) continue;
      // Cull hidden back faces; opaque same-color edge cover prevents SVG
      // antialias cracks from showing colored front faces through the back.
      const area =
        (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) -
        (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]);
      if (area <= 0) continue;
      faces.push({ ids, p, z: p.reduce((s, v) => s + v[2], 0) / 3 });
    }
    faces.sort((a, b) => a.z - b.z);
    for (const { ids, p } of faces) {
      const rgb = [0, 1, 2].map((c) =>
        Math.round(ids.reduce((s, id) => s + tint[id][c], 0) / 3),
      );
      const normal = new Vector3()
        .subVectors(geometry.positions[ids[1]], geometry.positions[ids[0]])
        .cross(
          new Vector3().subVectors(
            geometry.positions[ids[2]],
            geometry.positions[ids[0]],
          ),
        )
        .normalize();
      const light =
        0.68 +
        0.32 * Math.abs(normal.dot(new Vector3(0.3, 0.5, 0.8).normalize()));
      const shaded = rgb.map((c) => Math.round(c * light));
      const points = p
        .map(
          (v) =>
            `${(242 + (v[0] - cx) * scale).toFixed(1)},${((close ? 230 : 235) - (v[1] - cy) * scale).toFixed(1)}`,
        )
        .join(' ');
      svg += `<polygon points="${points}" fill="rgb(${shaded.join(',')})" stroke="rgb(${shaded.join(',')})" stroke-width="0.35"/>`;
    }
    svg += '</g></svg>';
  });
  return svg + '</g></svg>';
}
export async function buildDraft({ write = false } = {}) {
  const geometry = await sourceGeometry(),
    controls = JSON.parse(
      await readFile(new URL(folder + 'regions.json', root), 'utf8'),
    );
  const provenance = JSON.parse(
    await readFile(new URL(folder + 'provenance.json', root), 'utf8'),
  );
  const catalog = globalThis.structuredClone(geometry.seed);
  catalog.catalogVersion = 'upper-arm-surface-draft-1';
  catalog.sources.push(
    ...provenance.sources.map((s) => ({
      id: s.id,
      kind: 'anatomy-reference',
      locator: s.url,
    })),
  );
  const masks = [],
    payloads = [];
  for (const side of ['left', 'right'])
    for (const muscle of ['deltoid', 'biceps-brachii']) {
      const id = `${side}-${muscle}`,
        sourceIds = [
          muscle === 'deltoid' ? 'elsevier-deltoid' : 'elsevier-biceps',
          'manipal-arm',
        ];
      catalog.identities.push({
        id,
        label: `${side} ${muscle} — draft`,
        kind: 'muscle',
        side,
        depth: 'superficial',
        visibility: 'external-region-candidate',
        legacyConceptIds: [
          muscle === 'deltoid' ? 'legacy-deltoids' : 'legacy-biceps',
        ],
        sourceIds,
        review: 'pending',
      });
      const authored = authorMask(
        geometry,
        side,
        controls.regions[muscle],
        controls.featherFraction,
      );
      const metrics = validatePatch(
        geometry,
        authored.weights,
        side,
        controls.regions[muscle],
      );
      const mapping = {
        id,
        characterId: catalog.character.id,
        characterVersion: catalog.character.version,
        geometrySha256: catalog.character.sha256,
        catalogVersion: catalog.catalogVersion,
        surfaceMapVersion: catalog.surfaceMapVersion,
        meshIndex: 0,
        primitiveIndex: 0,
        vertexCount: 26939,
        mask: {
          file: `pipeline/character-v2/masks/upper-arm-draft/${id}.json`,
          sha256: '0'.repeat(64),
        },
        identityIds: [id],
        side,
        representation: 'external-region',
        approximation: controls.regions[muscle].description,
        sourceIds,
        review: 'pending',
      };
      catalog.surfaceMappings.push(mapping);
      const payload = {
        schemaVersion: 'kimorel.sparse-muscle-mask/v1',
        status: 'draft-needs-review',
        purpose: 'authoring-proposal',
        anatomicalValidation: false,
        binding: maskBinding(mapping),
        weights: authored.weights,
      };
      mapping.mask.sha256 = digest(serializeSparseMask(payload));
      payloads.push({ payload, mapping });
      masks.push({ id, ...authored, ...metrics });
    }
  if (write) {
    for (const { payload, mapping } of payloads)
      await writeSparseMask(catalog, payload, mapping.mask.file, root);
    await writeFile(
      new URL(folder + 'catalog.json', root),
      JSON.stringify(catalog, null, 2) + '\n',
      { flag: 'wx' },
    );
    await writeFile(
      new URL(folder + 'inspection.svg', root),
      inspectionSvg(geometry, masks),
      { flag: 'wx' },
    );
  }
  return { catalog, masks, payloads, geometry };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert(
    process.argv.length === 2 ||
      (process.argv.length === 3 && process.argv[2] === '--write'),
    'Usage: upper-arm-masks [--write]',
  );
  const result = await buildDraft({ write: process.argv.includes('--write') });
  if (process.argv.includes('--write'))
    await validateMuscleCatalog(result.catalog);
  console.log(
    JSON.stringify(
      {
        status: 'draft-needs-review',
        humanApproval: false,
        masks: result.masks.map(
          ({ id, assignedVertices, components, discardedVertices }) => ({
            id,
            assignedVertices,
            components,
            discardedVertices,
          }),
        ),
      },
      null,
      2,
    ),
  );
}
