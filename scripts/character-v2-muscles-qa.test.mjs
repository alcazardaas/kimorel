import { test } from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import {
  readFile,
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  validateMuscleCatalog,
  muscleCatalogFile,
  projectRoot,
} from './character-v2-muscles-qa.mjs';

const seed = async () =>
  JSON.parse(await readFile(new URL(muscleCatalogFile, projectRoot), 'utf8'));

test('real draft catalog and read-only CLI report zero masks and zero new anatomy claims', async () => {
  const report = await validateMuscleCatalog(await seed());
  assert.equal(report.legacyConcepts, 21);
  assert.equal(report.legacyExercisesCovered, 100);
  assert.equal(report.anatomicalIdentityProposals, 0);
  assert.equal(report.surfaceMappingProposals, 0);
  assert.equal(report.qualitativeRoleProposals, 0);
  assert.equal(report.humanApproval, false);
  assert.equal(report.maskPayloadValidation, true);
  assert.equal(report.validatedMaskPayloads, 0);
  const cli = JSON.parse(
    execFileSync(process.execPath, ['scripts/character-v2-muscles-qa.mjs'], {
      cwd: projectRoot,
      encoding: 'utf8',
    }),
  );
  assert.deepEqual(cli, report);
});

test('reject changed actual character hash, path traversal and promotion', async () => {
  const changed = await seed();
  changed.character.sha256 = '0'.repeat(64);
  await assert.rejects(validateMuscleCatalog(changed), /hash mismatch/);
  const unsafe = await seed();
  unsafe.character.file = '../outside.glb';
  await assert.rejects(validateMuscleCatalog(unsafe));
  const approved = await seed();
  approved.status = 'approved';
  await assert.rejects(validateMuscleCatalog(approved));
});

test('reject symlinked character ancestors without reading through them', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'kimorel-muscle-contract-'));
  try {
    await mkdir(join(folder, 'linked'));
    const root = pathToFileURL(folder + '/');
    const value = await seed();
    await symlink(
      new URL('pipeline/character-v2/correctives/', projectRoot),
      join(folder, 'linked', 'character'),
    );
    value.character.file = 'linked/character/character-v2-correctives.glb';
    await assert.rejects(validateMuscleCatalog(value, root), /real directory/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('reject unknown exercise references and wrong real vertex domains', async () => {
  const value = await seed();
  value.sources.push({
    id: 'fixture-reference',
    kind: 'anatomy-reference',
    locator: 'https://example.org/fictional-test-only',
  });
  value.identities.push({
    id: 'fixture-identity',
    label: 'Fictional',
    kind: 'muscle',
    side: 'left',
    depth: 'superficial',
    visibility: 'external-region-candidate',
    legacyConceptIds: ['legacy-quadriceps'],
    sourceIds: ['fixture-reference'],
    review: 'pending',
  });
  value.exerciseRoles.push({
    id: 'fixture-role',
    exerciseId: 'unknown-exercise',
    identityId: 'fixture-identity',
    side: 'left',
    role: 'stabilizer',
    basis: 'Fictional contract test',
    sourceIds: ['fixture-reference'],
    review: 'pending',
  });
  await assert.rejects(validateMuscleCatalog(value), /Unknown exercise/);
  value.exerciseRoles = [];
  value.surfaceMappings.push({
    id: 'fixture-map',
    characterId: value.character.id,
    characterVersion: value.character.version,
    geometrySha256: value.character.sha256,
    catalogVersion: value.catalogVersion,
    surfaceMapVersion: value.surfaceMapVersion,
    meshIndex: 99,
    primitiveIndex: 0,
    vertexCount: 1,
    mask: { file: 'fixtures/unread-mask.json', sha256: 'a'.repeat(64) },
    identityIds: ['fixture-identity'],
    side: 'left',
    representation: 'external-region',
    approximation: 'Fictional',
    sourceIds: ['fixture-reference'],
    review: 'pending',
  });
  await assert.rejects(validateMuscleCatalog(value), /vertex domain mismatch/);
});

test('rejects arbitrary mask bytes even when declared file hash and vertex domain match', async () => {
  const value = await seed();
  const folder = await mkdtemp(join(tmpdir(), 'kimorel-muscle-binding-'));
  try {
    await mkdir(join(folder, 'fixture'));
    const bytes = await readFile(new URL(value.character.file, projectRoot));
    await writeFile(join(folder, 'fixture', 'character.glb'), bytes);
    value.character.file = 'fixture/character.glb';
    const mask = Buffer.from(
      'Fictional metadata fixture, NOT an authored body mask',
    );
    await writeFile(join(folder, 'fixture', 'mask.txt'), mask);
    value.sources.push({
      id: 'fixture-reference',
      kind: 'anatomy-reference',
      locator: 'https://example.org/fictional-test-only',
    });
    value.identities.push({
      id: 'fixture-identity',
      label: 'Fictional',
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
      mask: {
        file: 'fixture/mask.txt',
        sha256: createHash('sha256').update(mask).digest('hex'),
      },
      identityIds: ['fixture-identity'],
      side: 'left',
      representation: 'external-region',
      approximation: 'Fictional test only',
      sourceIds: ['fixture-reference'],
      review: 'pending',
    });
    const root = pathToFileURL(folder + '/');
    await assert.rejects(validateMuscleCatalog(value, root), SyntaxError);
    await writeFile(
      join(folder, 'fixture', 'mask.txt'),
      'Changed fixture bytes',
    );
    await assert.rejects(validateMuscleCatalog(value, root), /hash mismatch/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
