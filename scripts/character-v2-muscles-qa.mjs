/** Read-only draft contract/binding proof, not anatomical or mask-payload approval. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve, sep } from 'node:path';
import {
  assetPathSchema,
  exerciseRegistrySchema,
} from '../packages/schemas/dist/index.js';
import { muscleCatalogV2Schema } from '../packages/schemas/dist/muscles-v2.js';
import {
  readBoundFile,
  readDraftJson,
  loadMappedSparseMask,
} from './character-v2-mask-pipeline.mjs';
import { readGlb } from './glb-qa.mjs';

export const projectRoot = new URL('../', import.meta.url);
export const muscleCatalogFile = 'pipeline/character-v2/muscle-catalog.json';
export async function validateMuscleCatalog(value, root = projectRoot) {
  const catalog = muscleCatalogV2Schema.parse(value);
  const character = readGlb(
    await readBoundFile(root, catalog.character.file, catalog.character.sha256),
  );
  const exercises = exerciseRegistrySchema.parse(
    JSON.parse(
      await readFile(
        new URL('packages/data/src/exercises.json', projectRoot),
        'utf8',
      ),
    ),
  );
  const exerciseIds = new Set(exercises.map((e) => e.id));
  const concepts = new Set(catalog.concepts.map((c) => c.legacyId));
  for (const exercise of exercises)
    for (const muscle of [
      ...exercise.muscles.primary,
      ...exercise.muscles.secondary,
    ])
      assert(concepts.has(muscle), 'Uncovered legacy exercise muscle');
  for (const record of catalog.exerciseRoles)
    assert(
      exerciseIds.has(record.exerciseId),
      'Unknown exercise role reference',
    );
  let validatedMaskPayloads = 0;
  for (const mapping of catalog.surfaceMappings) {
    await loadMappedSparseMask(mapping, character, root);
    validatedMaskPayloads++;
  }
  return {
    status: 'draft-contract-only',
    anatomicalValidation: false,
    humanApproval: false,
    legacyConcepts: catalog.concepts.length,
    legacyExercisesCovered: exercises.length,
    anatomicalIdentityProposals: catalog.identities.length,
    surfaceMappingProposals: catalog.surfaceMappings.length,
    qualitativeRoleProposals: catalog.exerciseRoles.length,
    maskPayloadValidation: true,
    validatedMaskPayloads,
    characterSha256: catalog.character.sha256,
    limitations: [
      'Legacy concepts do not assert anatomical identity/depth/visibility.',
      'Validated coverage weights are not anatomical evidence or measured activation.',
      'All records remain pending; citations and valid schema do not grant approval.',
    ],
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [fileArg, ...options] = process.argv.slice(2);
  const file = assetPathSchema.parse(fileArg ?? muscleCatalogFile);
  let root = projectRoot;
  if (options.length) {
    assert(
      options.length === 2 && options[0] === '--root' && options[1],
      'Usage: muscles-qa [catalog.json] [--root directory]',
    );
    root = pathToFileURL(resolve(options[1]) + sep);
  }
  console.log(
    JSON.stringify(
      await validateMuscleCatalog(await readDraftJson(root, file), root),
      null,
      2,
    ),
  );
}
