import { describe, expect, it } from 'vitest';
import seed from '../../../pipeline/character-v2/muscle-catalog.json' with { type: 'json' };
import { muscleCatalogV2Schema } from './muscles-v2.js';
import { muscles } from './index.js';

const copy = () => JSON.parse(JSON.stringify(seed));
// Fictional records exercise contract mechanics, NOT anatomical assertions.
function proposed() {
  const value = copy();
  value.sources.push({
    id: 'fixture-reference',
    kind: 'anatomy-reference',
    locator: 'https://example.org/fictional-test-only',
  });
  value.identities.push({
    id: 'fixture-identity',
    label: 'Fictional identity',
    kind: 'muscle',
    side: 'left',
    depth: 'superficial',
    visibility: 'external-region-candidate',
    legacyConceptIds: ['legacy-quadriceps'],
    sourceIds: ['fixture-reference'],
    review: 'pending',
  });
  value.surfaceMappings.push({
    id: 'fixture-map',
    characterId: value.character.id,
    characterVersion: value.character.version,
    geometrySha256: value.character.sha256,
    catalogVersion: value.catalogVersion,
    surfaceMapVersion: value.surfaceMapVersion,
    meshIndex: 0,
    primitiveIndex: 0,
    vertexCount: 26939,
    mask: { file: 'fixtures/test-mask.json', sha256: 'a'.repeat(64) },
    identityIds: ['fixture-identity'],
    side: 'left',
    representation: 'external-region',
    approximation: 'Fictional schema-only patch',
    sourceIds: ['fixture-reference'],
    review: 'pending',
  });
  value.exerciseRoles.push({
    id: 'fixture-role',
    exerciseId: 'bodyweight-squat',
    identityId: 'fixture-identity',
    side: 'left',
    role: 'stabilizer',
    basis: 'Fictional contract test, not real exercise evidence',
    sourceIds: ['fixture-reference'],
    review: 'pending',
  });
  return value;
}

describe('isolated muscle draft semantics', () => {
  it('covers all legacy concepts without inventing identities, masks or roles', () => {
    const result = muscleCatalogV2Schema.parse(seed);
    expect(result.concepts.map((r) => r.legacyId).sort()).toEqual(
      [...muscles].sort(),
    );
    expect(result.identities).toEqual([]);
    expect(result.surfaceMappings).toEqual([]);
    expect(result.exerciseRoles).toEqual([]);
    expect(
      result.concepts.every(
        (r) => r.depth === 'unknown' && r.review === 'pending',
      ),
    ).toBe(true);
  });
  it('accepts explicitly separated fictional draft layers without approving them', () => {
    expect(
      muscleCatalogV2Schema.parse(proposed()).surfaceMappings[0]?.review,
    ).toBe('pending');
  });
  it.each([
    'concepts',
    'identities',
    'surfaceMappings',
    'exerciseRoles',
    'sources',
  ])('rejects duplicate %s identities', (field) => {
    const value = proposed();
    value[field].push(value[field][0]);
    expect(muscleCatalogV2Schema.safeParse(value).success).toBe(false);
  });
  it('rejects incomplete legacy coverage, renamed concepts and orphaned references', () => {
    const missing = copy();
    missing.concepts.pop();
    expect(muscleCatalogV2Schema.safeParse(missing).success).toBe(false);
    const renamed = copy();
    renamed.concepts[0].id = 'not-a-legacy-alias';
    expect(muscleCatalogV2Schema.safeParse(renamed).success).toBe(false);
    for (const change of [
      (v: ReturnType<typeof proposed>) => {
        v.identities[0].legacyConceptIds = ['missing'];
      },
      (v: ReturnType<typeof proposed>) => {
        v.surfaceMappings[0].identityIds = ['legacy-quadriceps'];
      },
      (v: ReturnType<typeof proposed>) => {
        v.exerciseRoles[0].identityId = 'missing';
      },
      (v: ReturnType<typeof proposed>) => {
        v.identities[0].sourceIds = ['legacy-muscle-enum'];
      },
    ]) {
      const value = proposed();
      change(value);
      expect(muscleCatalogV2Schema.safeParse(value).success).toBe(false);
    }
  });
  it.each([
    'characterId',
    'characterVersion',
    'geometrySha256',
    'catalogVersion',
    'surfaceMapVersion',
  ])('rejects stale surface binding %s', (field) => {
    const value = proposed();
    value.surfaceMappings[0][field] =
      field === 'geometrySha256' ? 'b'.repeat(64) : 'stale';
    expect(muscleCatalogV2Schema.safeParse(value).success).toBe(false);
  });
  it.each(['deep', 'mixed', 'unknown'])(
    'excludes %s identity from ordinary external patches',
    (depth) => {
      const value = proposed();
      value.identities[0].depth = depth;
      expect(muscleCatalogV2Schema.safeParse(value).success).toBe(false);
      value.surfaceMappings[0].representation = 'layered-view';
      expect(muscleCatalogV2Schema.safeParse(value).success).toBe(true);
    },
  );
  it('rejects unknown visibility, wrong sides and contradictory roles', () => {
    const visibility = proposed();
    visibility.identities[0].visibility = 'unknown';
    expect(muscleCatalogV2Schema.safeParse(visibility).success).toBe(false);
    const sides = proposed();
    sides.surfaceMappings[0].side = 'right';
    expect(muscleCatalogV2Schema.safeParse(sides).success).toBe(false);
    const roles = proposed();
    roles.exerciseRoles.push({
      ...roles.exerciseRoles[0],
      id: 'other-role',
      role: 'prime-mover',
    });
    expect(muscleCatalogV2Schema.safeParse(roles).success).toBe(false);
  });
  it.each(['concepts', 'identities', 'surfaceMappings', 'exerciseRoles'])(
    'rejects approval promotion of %s',
    (field) => {
      const value = proposed();
      value[field][0].review = 'approved';
      expect(muscleCatalogV2Schema.safeParse(value).success).toBe(false);
    },
  );
  it('rejects numeric recruitment, legacy-role coercion and approval promotion', () => {
    for (const extra of [
      { recruitmentPercent: 80 },
      { intensity: 0.8 },
      { role: 'primary' },
      { review: 'approved' },
    ]) {
      const value = proposed();
      Object.assign(value.exerciseRoles[0], extra);
      expect(muscleCatalogV2Schema.safeParse(value).success).toBe(false);
    }
    const concept = copy();
    concept.concepts[0].depth = 'superficial';
    expect(muscleCatalogV2Schema.safeParse(concept).success).toBe(false);
    const approval = copy();
    approval.status = 'approved';
    expect(muscleCatalogV2Schema.safeParse(approval).success).toBe(false);
  });
});
