/** Isolated draft semantics. Not exported by the public v1 entry point. */
import { z } from 'zod';
import { assetPathSchema, muscles } from './index.js';

const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const text = z.string().trim().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const side = z.enum(['left', 'right', 'midline', 'bilateral', 'unknown']);
const refs = z.array(id).min(1);
const pending = z.literal('pending');
const source = z.discriminatedUnion('kind', [
  z.strictObject({
    id,
    kind: z.literal('project-metadata'),
    locator: assetPathSchema,
  }),
  z.strictObject({
    id,
    kind: z.literal('anatomy-reference'),
    locator: z.url().startsWith('https://'),
  }),
]);
const concept = z.strictObject({
  id,
  legacyId: z.enum(muscles),
  label: text,
  kind: z.literal('legacy-concept'),
  side: z.literal('unknown'),
  depth: z.literal('unknown'),
  representation: z.literal('semantic-only'),
  review: pending,
  sourceIds: refs,
});
const identity = z.strictObject({
  id,
  label: text,
  kind: z.enum(['muscle', 'named-group']),
  side,
  depth: z.enum(['unknown', 'superficial', 'deep', 'mixed']),
  visibility: z.enum(['unknown', 'external-region-candidate', 'layered-only']),
  legacyConceptIds: refs,
  sourceIds: refs,
  review: pending,
});
const mapping = z.strictObject({
  id,
  characterId: id,
  characterVersion: id,
  geometrySha256: sha256,
  catalogVersion: id,
  surfaceMapVersion: id,
  meshIndex: z.int().nonnegative(),
  primitiveIndex: z.int().nonnegative(),
  vertexCount: z.int().positive(),
  mask: z.strictObject({ file: assetPathSchema, sha256 }),
  identityIds: refs,
  side,
  representation: z.enum(['external-region', 'layered-view']),
  approximation: text,
  sourceIds: refs,
  review: pending,
});
const role = z.strictObject({
  id,
  exerciseId: id,
  identityId: id,
  side,
  role: z.enum(['prime-mover', 'synergist', 'stabilizer']),
  phaseId: id.optional(),
  basis: text,
  sourceIds: refs,
  review: pending,
});

/** Structure/evidence references are validated; citations do not confer human approval. */
export const muscleCatalogV2Schema = z
  .strictObject({
    schemaVersion: z.literal('kimorel.muscle-semantics/v2-draft-1'),
    catalogVersion: id,
    surfaceMapVersion: z.literal('muscle-map-draft-1'),
    status: z.literal('draft-needs-review'),
    character: z.strictObject({
      id,
      version: id,
      file: assetPathSchema,
      sha256,
    }),
    sources: z.array(source).min(1),
    concepts: z.array(concept),
    identities: z.array(identity),
    surfaceMappings: z.array(mapping),
    exerciseRoles: z.array(role),
  })
  .superRefine((catalog, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: 'custom', message });
    for (const [name, records] of Object.entries({
      sources: catalog.sources,
      concepts: catalog.concepts,
      identities: catalog.identities,
      surfaceMappings: catalog.surfaceMappings,
      exerciseRoles: catalog.exerciseRoles,
    })) {
      if (new Set(records.map((r) => r.id)).size !== records.length)
        issue(`Duplicate ${name} ID`);
    }
    const sources = new Map(catalog.sources.map((r) => [r.id, r]));
    const concepts = new Map(catalog.concepts.map((r) => [r.id, r]));
    const identities = new Map(catalog.identities.map((r) => [r.id, r]));
    const legacy = catalog.concepts.map((r) => r.legacyId);
    if (
      legacy.length !== muscles.length ||
      new Set(legacy).size !== muscles.length
    )
      issue('Every legacy muscle needs exactly one concept');
    for (const record of catalog.concepts) {
      if (new Set(record.sourceIds).size !== record.sourceIds.length)
        issue('Duplicate source reference');
      if (record.id !== `legacy-${record.legacyId}`)
        issue('Legacy concept identity mismatch');
      for (const ref of record.sourceIds)
        if (sources.get(ref)?.kind !== 'project-metadata')
          issue('Legacy concepts require project metadata sources');
    }
    const evidence = (sourceIds: string[]) => {
      if (new Set(sourceIds).size !== sourceIds.length)
        issue('Duplicate source reference');
      for (const ref of sourceIds)
        if (sources.get(ref)?.kind !== 'anatomy-reference')
          issue('Anatomical proposals require anatomy-reference sources');
    };
    for (const record of catalog.identities) {
      if (concepts.has(record.id))
        issue('Concept and anatomical identity IDs must be separate');
      evidence(record.sourceIds);
      if (
        new Set(record.legacyConceptIds).size !== record.legacyConceptIds.length
      )
        issue('Duplicate concept reference');
      for (const ref of record.legacyConceptIds)
        if (!concepts.has(ref)) issue('Unknown legacy concept reference');
    }
    const compatibleSide = (a: string, b: string) =>
      a !== 'unknown' &&
      b !== 'unknown' &&
      (a === b ||
        (a === 'bilateral' && ['left', 'right', 'bilateral'].includes(b)));
    const mapped = new Set<string>();
    for (const record of catalog.surfaceMappings) {
      evidence(record.sourceIds);
      if (
        record.characterId !== catalog.character.id ||
        record.characterVersion !== catalog.character.version ||
        record.geometrySha256 !== catalog.character.sha256 ||
        record.catalogVersion !== catalog.catalogVersion ||
        record.surfaceMapVersion !== catalog.surfaceMapVersion
      )
        issue('Surface mapping character/hash/version mismatch');
      if (new Set(record.identityIds).size !== record.identityIds.length)
        issue('Duplicate mapped identity');
      const key = `${record.mask.file}:${record.side}`;
      if (mapped.has(key)) issue('Duplicate surface mask binding');
      mapped.add(key);
      for (const ref of record.identityIds) {
        const target = identities.get(ref);
        if (!target) {
          issue('Unknown anatomical identity in surface mapping');
          continue;
        }
        if (!compatibleSide(target.side, record.side))
          issue('Surface mapping side mismatch');
        if (
          record.representation === 'external-region' &&
          (target.depth !== 'superficial' ||
            target.visibility !== 'external-region-candidate')
        )
          issue(
            'Deep/mixed/unknown or ineligible identities cannot use an external surface mask',
          );
      }
    }
    const assigned = new Set<string>();
    for (const record of catalog.exerciseRoles) {
      evidence(record.sourceIds);
      const target = identities.get(record.identityId);
      if (!target) issue('Unknown anatomical identity in exercise role');
      else if (!compatibleSide(target.side, record.side))
        issue('Exercise role side mismatch');
      const key = `${record.exerciseId}:${record.identityId}:${record.side}:${record.phaseId ?? ''}`;
      if (assigned.has(key)) issue('Duplicate/conflicting qualitative role');
      assigned.add(key);
    }
  });

export type MuscleCatalogV2 = z.infer<typeof muscleCatalogV2Schema>;

/** Internal payload binding reuse; not a public v1 export or approval mechanism. */
export { mapping as muscleSurfaceMappingV2Schema };
