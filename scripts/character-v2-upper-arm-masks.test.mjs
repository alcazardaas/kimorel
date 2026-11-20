import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  buildDraft,
  folder,
  root,
  widthAt,
  coordinates,
  validatePatch,
  connectedComponents,
  inspectionSvg,
} from './character-v2-upper-arm-masks.mjs';
import {
  serializeSparseMask,
  parseBoundSparseMask,
} from '../packages/schemas/dist/muscle-masks-v2.js';
import { loadMappedSparseMask } from './character-v2-mask-pipeline.mjs';
import { validateMuscleCatalog } from './character-v2-muscles-qa.mjs';

const controls = JSON.parse(
  await readFile(new URL(folder + 'regions.json', root), 'utf8'),
);
const result = await buildDraft();
const hash = (b) => createHash('sha256').update(b).digest('hex');

test('actual frozen variant has four source-backed pending identities/masks and zero roles', async () => {
  const saved = JSON.parse(
    await readFile(new URL(folder + 'catalog.json', root), 'utf8'),
  );
  assert.deepEqual(saved, result.catalog);
  const report = await validateMuscleCatalog(saved);
  assert.equal(report.validatedMaskPayloads, 4);
  assert.equal(report.anatomicalIdentityProposals, 4);
  assert.equal(report.qualitativeRoleProposals, 0);
  assert.equal(report.humanApproval, false);
  assert.equal(
    saved.character.sha256,
    '61e83ec439d3e04deeec2cd5da771181044bfaae3e75dcea75ec3b8342c9c587',
  );
  for (const identity of saved.identities) {
    assert.equal(identity.review, 'pending');
    assert.equal(identity.depth, 'superficial');
    assert(identity.sourceIds.length >= 2);
  }
});
test('repeat materialization exactly matches all four canonical payloads without writing', async () => {
  const repeat = await buildDraft();
  for (let i = 0; i < result.payloads.length; i++) {
    const { payload, mapping } = result.payloads[i],
      bytes = await readFile(new URL(mapping.mask.file, root));
    assert.equal(bytes.toString(), serializeSparseMask(payload));
    assert.equal(
      serializeSparseMask(repeat.payloads[i].payload),
      bytes.toString(),
    );
    assert.equal(hash(bytes), mapping.mask.sha256);
  }
});
test('actual patches occupy correct shoulder/anterior-arm neighborhoods and remain connected', () => {
  for (const mask of result.masks) {
    const side = mask.id.startsWith('left') ? 'left' : 'right',
      muscle = mask.id.slice(side.length + 1);
    assert.equal(mask.discardedVertices, 0);
    assert.equal(
      connectedComponents(mask.weights, result.geometry.adjacency).length,
      1,
    );
    const locations = mask.weights.map((w) =>
      coordinates(
        result.geometry.positions[w.vertexIndex],
        result.geometry.frames[side],
      ),
    );
    if (muscle === 'biceps-brachii') {
      assert(
        mask.weights.every(
          (w) => result.geometry.positions[w.vertexIndex].z > 0,
        ),
        'Biceps support must be anterior, not posterior',
      );
      assert(
        locations.every(
          (p) => p.t > 0.23 && p.t < 0.94 && Math.abs(p.angle) < 65,
        ),
      );
    } else {
      assert(locations.every((p) => p.t > -0.22 && p.t < 0.58));
    }
    assert(mask.weights.some((w) => w.weight === 1));
    assert(mask.weights.some((w) => w.weight > 0 && w.weight < 1));
    validatePatch(
      result.geometry,
      mask.weights,
      side,
      controls.regions[muscle],
    );
  }
});
test('opposite side, remote leg support and broad circumferential spill are rejected', () => {
  const m = result.masks[1],
    def = controls.regions['biceps-brachii'];
  assert.throws(
    () => validatePatch(result.geometry, m.weights, 'right', def),
    /side|leakage|spill/,
  );
  const remote = result.geometry.positions.findIndex(
    (p) => p.y < 0.7 && p.x > 0.14,
  );
  assert.throws(
    () =>
      validatePatch(
        result.geometry,
        [...m.weights, { vertexIndex: remote, weight: 1 }],
        'left',
        def,
      ),
    /Disconnected|spill|leakage/,
  );
  const broad = result.geometry.positions
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => {
      const c = coordinates(p, result.geometry.frames.left);
      return p.x > 0.14 && c.t > 0.35 && c.t < 0.7;
    })
    .map(({ i }) => ({ vertexIndex: i, weight: 1 }));
  assert.throws(
    () => validatePatch(result.geometry, broad, 'left', def),
    /spill|Disconnected|budget/,
  );
});
test('disconnected real-geometry islands are not accepted as one surface region', () => {
  const m = result.masks[0],
    isolated = m.weights[0].vertexIndex;
  const neighbors = result.geometry.adjacency[isolated];
  const broken = m.weights.filter((w) => !neighbors.has(w.vertexIndex));
  assert(broken.length > 20);
  assert(connectedComponents(broken, result.geometry.adjacency).length > 1);
  assert.throws(
    () =>
      validatePatch(result.geometry, broken, 'left', controls.regions.deltoid),
    /Disconnected/,
  );
});
test('stale exact hash/domain/side bindings fail before anatomical content could be admitted', async () => {
  const { payload, mapping } = result.payloads[0];
  const raw = {
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ count: 26939 }],
  };
  await assert.rejects(
    loadMappedSparseMask({ ...mapping, vertexCount: 26938 }, raw, root),
    /domain/,
  );
  await assert.rejects(
    loadMappedSparseMask(
      { ...mapping, mask: { ...mapping.mask, sha256: '0'.repeat(64) } },
      raw,
      root,
    ),
    /hash/,
  );
  assert.throws(
    () => parseBoundSparseMask(payload, { ...mapping, side: 'right' }),
    /binding/,
  );
});
test('curved knot interpolation tapers to zero and is not a rectangular selector', () => {
  const k = controls.regions['biceps-brachii'].knots;
  assert.equal(widthAt(k, 0), 0);
  assert.equal(widthAt(k, 1), 0);
  assert(widthAt(k, 0.52) > widthAt(k, 0.3));
  assert(widthAt(k, 0.52) > widthAt(k, 0.88));
});

test('repeat actual-mesh inspection is byte-exact and labels all six views', async () => {
  const saved = await readFile(
    new URL(folder + 'inspection.svg', root),
    'utf8',
  );
  assert.equal(hash(inspectionSvg(result.geometry, result.masks)), hash(saved));
  for (const label of [
    'FRONT',
    'BACK',
    'LEFT',
    'RIGHT',
    'OBLIQUE',
    'SHOULDER / ARM DETAIL',
  ])
    assert(saved.includes(label));
  assert(saved.includes('ANATOMICAL REVIEW PENDING'));
  assert(saved.includes('clip-path="url(#surface-5)"'));
  assert(!saved.includes('opacity='));
});
