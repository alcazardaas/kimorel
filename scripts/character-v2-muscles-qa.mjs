/** Read-only draft contract/binding proof, not anatomical or mask-payload approval. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  assetPathSchema,
  exerciseRegistrySchema,
} from '../packages/schemas/dist/index.js';
import { muscleCatalogV2Schema } from '../packages/schemas/dist/muscles-v2.js';
import { validateAssetFile } from './asset-files.mjs';
import { readGlb } from './glb-qa.mjs';

export const projectRoot = new URL('../', import.meta.url);
export const muscleCatalogFile = 'pipeline/character-v2/muscle-catalog.json';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function boundFile(root, file, expectedHash) {
  assetPathSchema.parse(file);
  let parent = root;
  for (const part of file.split('/').slice(0, -1)) {
    // lstat on a trailing slash follows a directory symlink on this platform.
    const stat = await lstat(new URL(part, parent));
    parent = new URL(part + '/', parent);
    assert(
      stat.isDirectory() && !stat.isSymbolicLink(),
      'Bound file parent must be a real directory',
    );
  }
  await validateAssetFile(root, file);
  const bytes = await readFile(new URL(file, root));
  assert.equal(
    sha256(bytes),
    expectedHash,
    `Bound file hash mismatch: ${file}`,
  );
  return bytes;
}

export async function validateMuscleCatalog(value, root = projectRoot) {
  const catalog = muscleCatalogV2Schema.parse(value);
  const character = readGlb(
    await boundFile(root, catalog.character.file, catalog.character.sha256),
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
  for (const mapping of catalog.surfaceMappings) {
    const primitive =
      character.meshes?.[mapping.meshIndex]?.primitives[mapping.primitiveIndex];
    assert(
      primitive &&
        character.accessors[primitive.attributes.POSITION]?.count ===
          mapping.vertexCount,
      'Surface mapping vertex domain mismatch',
    );
    await boundFile(root, mapping.mask.file, mapping.mask.sha256);
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
    maskPayloadValidation: false,
    characterSha256: catalog.character.sha256,
    limitations: [
      'Legacy concepts do not assert anatomical identity/depth/visibility.',
      'Declared file/domain bindings are not authored mask geometry or anatomical evidence.',
      'All records remain pending; citations and valid schema do not grant approval.',
    ],
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const file = assetPathSchema.parse(process.argv[2] ?? muscleCatalogFile);
  console.log(
    JSON.stringify(
      await validateMuscleCatalog(
        JSON.parse(await readFile(new URL(file, projectRoot), 'utf8')),
      ),
      null,
      2,
    ),
  );
}
