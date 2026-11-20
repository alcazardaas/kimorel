import { expect, it } from 'vitest';
import seed from '../../../pipeline/character-v2/muscle-catalog.json' with { type: 'json' };
import { muscleSurfaceMappingV2Schema } from './muscles-v2.js';
import {
  sparseMuscleMaskV1Schema,
  maskBinding,
  parseBoundSparseMask,
  serializeSparseMask,
  materializeSparseMask,
  maxMaskVertices,
} from './muscle-masks-v2.js';

const mapping = muscleSurfaceMappingV2Schema.parse({
  id: 'non-anatomical-fixture',
  characterId: seed.character.id,
  characterVersion: seed.character.version,
  geometrySha256: seed.character.sha256,
  catalogVersion: seed.catalogVersion,
  surfaceMapVersion: seed.surfaceMapVersion,
  meshIndex: 0,
  primitiveIndex: 0,
  vertexCount: 26939,
  mask: {
    file: 'pipeline/character-v2/masks/non-anatomical.json',
    sha256: '0'.repeat(64),
  },
  identityIds: ['non-anatomical-fixture'],
  side: 'left',
  representation: 'external-region',
  approximation: 'Arbitrary test indices, NOT a muscle region',
  sourceIds: ['fixture-reference'],
  review: 'pending',
});
const proposed = () => ({
  schemaVersion: 'kimorel.sparse-muscle-mask/v1',
  status: 'draft-needs-review',
  purpose: 'non-anatomical-test-fixture',
  anatomicalValidation: false,
  binding: maskBinding(mapping),
  weights: [
    { vertexIndex: 26938, weight: 0.25 },
    { vertexIndex: 0, weight: 1 },
    { vertexIndex: 13, weight: 0.5 },
  ],
});

it('canonicalizes sparse order and materializes deterministic zero-default float weights', () => {
  const value = proposed(),
    reverse = { ...value, weights: [...value.weights].reverse() };
  expect(serializeSparseMask(value)).toBe(serializeSparseMask(reverse));
  const parsed = parseBoundSparseMask(
    JSON.parse(serializeSparseMask(value)),
    mapping,
  );
  const dense = materializeSparseMask(parsed);
  expect(dense).toBeInstanceOf(Float32Array);
  expect(dense.length).toBe(26939);
  expect(dense[0]).toBe(1);
  expect(dense[13]).toBe(0.5);
  expect(dense[26938]).toBe(0.25);
  expect(dense.reduce((a, b) => a + b, 0)).toBe(1.75);
  expect(dense.filter((v) => v !== 0).length).toBe(3);
});
it.each([NaN, Infinity, -Infinity, -0.1, 0, 1.1])(
  'rejects invalid coverage weight %s',
  (weight) => {
    const value = proposed();
    value.weights[0]!.weight = weight;
    expect(sparseMuscleMaskV1Schema.safeParse(value).success).toBe(false);
  },
);
it.each([-1, 0.5, 26939, NaN, Infinity])(
  'rejects invalid vertex index %s',
  (vertexIndex) => {
    const value = proposed();
    value.weights[0]!.vertexIndex = vertexIndex;
    expect(sparseMuscleMaskV1Schema.safeParse(value).success).toBe(false);
  },
);
it('rejects empty/duplicate support, malformed entries, unexpected keys and promotions', () => {
  for (const change of [
    (v: ReturnType<typeof proposed>) => {
      v.weights = [];
    },
    (v: ReturnType<typeof proposed>) => {
      v.weights.push(v.weights[0]!);
    },
    (v: ReturnType<typeof proposed>) => {
      Object.assign(v.weights[0]!, { activationPercent: 80 });
    },
    (v: ReturnType<typeof proposed>) => {
      Object.assign(v, { status: 'approved' });
    },
    (v: ReturnType<typeof proposed>) => {
      Object.assign(v, { anatomicalValidation: true });
    },
    (v: ReturnType<typeof proposed>) => {
      Object.assign(v, { humanApproval: true });
    },
    (v: ReturnType<typeof proposed>) => {
      Object.assign(v.binding, { review: 'approved' });
    },
    (v: ReturnType<typeof proposed>) => {
      Object.assign(v.binding, {
        mask: { file: 'extra', sha256: '0'.repeat(64) },
      });
    },
    (v: ReturnType<typeof proposed>) => {
      Object.assign(v, { weights: [{ vertexIndex: 2 }] });
    },
  ]) {
    const value = proposed();
    change(value);
    expect(sparseMuscleMaskV1Schema.safeParse(value).success).toBe(false);
  }
});
it.each([
  'characterId',
  'characterVersion',
  'geometrySha256',
  'catalogVersion',
  'surfaceMapVersion',
  'side',
  'identityIds',
  'vertexCount',
  'meshIndex',
  'primitiveIndex',
])('rejects stale mapping binding %s', (field) => {
  const value = proposed();
  Object.assign(value.binding, {
    [field]: ['identityIds', 'sourceIds'].includes(field)
      ? ['other']
      : field === 'side'
        ? 'right'
        : field === 'geometrySha256'
          ? 'f'.repeat(64)
          : ['vertexCount', 'meshIndex', 'primitiveIndex'].includes(field)
            ? 99999
            : 'stale',
  });
  expect(() => parseBoundSparseMask(value, mapping)).toThrow();
});
it('bounds dense allocation before allocating untrusted declared domains', () => {
  const value = proposed();
  value.binding.vertexCount = maxMaskVertices + 1;
  expect(() => materializeSparseMask(value)).toThrow(/allocation limit/);
});

it.each([1e-50, Number.MIN_VALUE, 2 ** -150])(
  'rejects Float32-zero support %s consistently, including mixed support',
  (weight) => {
    for (const mixed of [false, true]) {
      const value = proposed();
      value.weights = [{ vertexIndex: 0, weight }];
      if (mixed) value.weights.push({ vertexIndex: 1, weight: 0.5 });
      expect(() => sparseMuscleMaskV1Schema.parse(value)).toThrow(/Float32/);
      expect(() => parseBoundSparseMask(value, mapping)).toThrow(/Float32/);
      expect(() => serializeSparseMask(value)).toThrow(/Float32/);
      expect(() => materializeSparseMask(value)).toThrow(/Float32/);
    }
  },
);
it('preserves minimum Float32 subnormal and just-above-half rounding without changing JSON weights', () => {
  const minimum = 2 ** -149;
  for (const weight of [minimum, 2 ** -150 * (1 + Number.EPSILON)]) {
    const value = proposed();
    value.weights = [{ vertexIndex: 0, weight }];
    const parsed = parseBoundSparseMask(value, mapping);
    expect(parsed.weights[0]!.weight).toBe(weight);
    expect(JSON.parse(serializeSparseMask(value)).weights[0].weight).toBe(
      weight,
    );
    expect(materializeSparseMask(value)[0]).toBe(minimum);
  }
});
