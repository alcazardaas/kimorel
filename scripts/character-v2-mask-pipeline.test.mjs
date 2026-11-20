import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  readFile,
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  symlink,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { BufferAttribute } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  maskBinding,
  serializeSparseMask,
} from '../packages/schemas/dist/muscle-masks-v2.js';
import {
  inspectSparseMask,
  writeSparseMask,
} from './character-v2-mask-pipeline.mjs';
import {
  validateMuscleCatalog,
  projectRoot,
  muscleCatalogFile,
} from './character-v2-muscles-qa.mjs';
const output = 'pipeline/character-v2/masks/non-anatomical.json';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function fixture(run) {
  const folder = await mkdtemp(join(tmpdir(), 'kimorel-sparse-mask-'));
  try {
    const root = pathToFileURL(folder + '/');
    await mkdir(join(folder, 'draft'));
    await mkdir(join(folder, 'fixture'));
    await mkdir(join(folder, 'pipeline/character-v2/masks'), {
      recursive: true,
    });
    const catalog = JSON.parse(
      await readFile(new URL(muscleCatalogFile, projectRoot), 'utf8'),
    );
    const character = await readFile(
      new URL(catalog.character.file, projectRoot),
    );
    await writeFile(join(folder, 'fixture/character.glb'), character);
    catalog.character.file = 'fixture/character.glb';
    catalog.sources.push({
      id: 'fixture-reference',
      kind: 'anatomy-reference',
      locator: 'https://example.org/non-anatomical-test-only',
    });
    catalog.identities.push({
      id: 'non-anatomical-fixture',
      label: 'NON-ANATOMICAL mechanical fixture',
      kind: 'named-group',
      side: 'left',
      depth: 'superficial',
      visibility: 'external-region-candidate',
      legacyConceptIds: ['legacy-quadriceps'],
      sourceIds: ['fixture-reference'],
      review: 'pending',
    });
    const mapping = {
      id: 'non-anatomical-fixture',
      characterId: catalog.character.id,
      characterVersion: catalog.character.version,
      geometrySha256: catalog.character.sha256,
      catalogVersion: catalog.catalogVersion,
      surfaceMapVersion: catalog.surfaceMapVersion,
      meshIndex: 0,
      primitiveIndex: 0,
      vertexCount: 26939,
      mask: { file: output, sha256: '0'.repeat(64) },
      identityIds: ['non-anatomical-fixture'],
      side: 'left',
      representation: 'external-region',
      approximation: 'Arbitrary indices, NOT anatomical coverage',
      sourceIds: ['fixture-reference'],
      review: 'pending',
    };
    catalog.surfaceMappings.push(mapping);
    const proposal = {
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
    };
    mapping.mask.sha256 = hash(serializeSparseMask(proposal));
    await writeFile(
      join(folder, 'draft/catalog.json'),
      JSON.stringify(catalog),
    );
    await writeFile(
      join(folder, 'draft/proposal.json'),
      JSON.stringify(proposal),
    );
    await run({ folder, root, catalog, proposal, mapping, character });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

test('actual temporary CLI inspect/write/catalog roundtrip materializes the real GLB vertex domain', () =>
  fixture(async (f) => {
    const cli = (...args) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          [
            resolve('scripts/character-v2-mask-pipeline.mjs'),
            'draft/catalog.json',
            'draft/proposal.json',
            '--root',
            f.folder,
            ...args,
          ],
          { encoding: 'utf8' },
        ),
      );
    assert.equal(cli().catalogHashMatches, true);
    await assert.rejects(stat(join(f.folder, output)), { code: 'ENOENT' }); // Default is read-only.
    const written = cli('--write', output);
    assert.equal(written.written, true);
    assert.equal(written.humanApproval, false);
    const cliReport = JSON.parse(
      execFileSync(
        process.execPath,
        [
          resolve('scripts/character-v2-muscles-qa.mjs'),
          'draft/catalog.json',
          '--root',
          f.folder,
        ],
        { encoding: 'utf8' },
      ),
    );
    assert.equal(cliReport.validatedMaskPayloads, 1);
    const report = await validateMuscleCatalog(f.catalog, f.root);
    assert.equal(report.validatedMaskPayloads, 1);
    assert.equal(report.maskPayloadValidation, true);
    const prepared = await inspectSparseMask(
      f.catalog,
      JSON.parse(await readFile(join(f.folder, output), 'utf8')),
      f.root,
    );
    const loaded = await new GLTFLoader().parseAsync(
      f.character.buffer.slice(
        f.character.byteOffset,
        f.character.byteOffset + f.character.byteLength,
      ),
      '',
    );
    const mesh = loaded.scene.getObjectsByProperty('isSkinnedMesh', true)[0];
    assert.equal(mesh.geometry.getAttribute('position').count, 26939);
    const attribute = new BufferAttribute(prepared.dense, 1);
    assert.equal(attribute.count, mesh.geometry.getAttribute('position').count);
    for (let i = 0; i < attribute.count; i++)
      assert.equal(
        attribute.getX(i),
        i === 0 ? 1 : i === 13 ? 0.5 : i === 26938 ? 0.25 : 0,
      );
    assert.equal(
      hash(await readFile(join(f.folder, output))),
      f.mapping.mask.sha256,
    );
    assert.equal(
      hash(await readFile(join(f.folder, 'fixture/character.glb'))),
      f.catalog.character.sha256,
    );
  }));

test('canonical writes are deterministic and refuse overwrite, stale hash and protected output', () =>
  fixture(async (f) => {
    const reversed = {
      ...f.proposal,
      weights: [...f.proposal.weights].reverse(),
    };
    assert.equal(
      (await inspectSparseMask(f.catalog, reversed, f.root)).report
        .canonicalSha256,
      f.mapping.mask.sha256,
    );
    const bad = JSON.parse(JSON.stringify(f.catalog));
    bad.surfaceMappings[0].mask.sha256 = '0'.repeat(64);
    await assert.rejects(
      writeSparseMask(bad, f.proposal, output, f.root),
      /Canonical mask hash/,
    );
    await assert.rejects(
      writeSparseMask(f.catalog, f.proposal, 'assets/not-allowed.json', f.root),
      /isolated masks directory/,
    );
    await writeSparseMask(f.catalog, f.proposal, output, f.root);
    const before = await readFile(join(f.folder, output));
    await assert.rejects(
      writeSparseMask(f.catalog, f.proposal, output, f.root),
      { code: 'EEXIST' },
    );
    assert.deepEqual(await readFile(join(f.folder, output)), before);
  }));

test('rejects malformed payload, mapping drift and invalid real domains', () =>
  fixture(async (f) => {
    const altered = JSON.parse(JSON.stringify(f.proposal));
    altered.binding.side = 'right';
    await assert.rejects(
      inspectSparseMask(f.catalog, altered, f.root),
      /binding mismatch/,
    );
    const domain = JSON.parse(JSON.stringify(f.catalog));
    domain.surfaceMappings[0].vertexCount = 1;
    await assert.rejects(
      inspectSparseMask(domain, f.proposal, f.root),
      /vertex domain/,
    );
    await writeFile(join(f.folder, output), 'not JSON');
    f.mapping.mask.sha256 = hash('not JSON');
    await assert.rejects(validateMuscleCatalog(f.catalog, f.root), SyntaxError);
    const malformed = JSON.stringify({ ...f.proposal, weights: [] });
    await writeFile(join(f.folder, output), malformed);
    f.mapping.mask.sha256 = hash(malformed);
    await assert.rejects(validateMuscleCatalog(f.catalog, f.root));
  }));

test('rejects symlinked output parents and existing symlink leaves', () =>
  fixture(async (f) => {
    await symlink(f.folder, join(f.folder, 'root-alias'));
    await assert.rejects(
      writeSparseMask(
        f.catalog,
        f.proposal,
        output,
        pathToFileURL(join(f.folder, 'root-alias') + '/'),
      ),
      /Root must be a real directory/,
    );
    await rm(join(f.folder, 'root-alias'));

    await rm(join(f.folder, 'pipeline/character-v2/masks'), {
      recursive: true,
    });
    await symlink(
      join(f.folder, 'draft'),
      join(f.folder, 'pipeline/character-v2/masks'),
    );
    await assert.rejects(
      writeSparseMask(f.catalog, f.proposal, output, f.root),
      /real directory/,
    );
    await rm(join(f.folder, 'pipeline/character-v2/masks'));
    await mkdir(join(f.folder, 'pipeline/character-v2/masks'));
    await symlink(
      join(f.folder, 'draft/proposal.json'),
      join(f.folder, output),
    );
    await assert.rejects(
      writeSparseMask(f.catalog, f.proposal, output, f.root),
      { code: 'EEXIST' },
    );
  }));

test('underflow proposals fail actual inspect/write/catalog CLIs without creating output', () =>
  fixture(async (f) => {
    for (const weight of [1e-50, Number.MIN_VALUE, 2 ** -150]) {
      for (const mixed of [false, true]) {
        f.proposal.weights = [{ vertexIndex: 0, weight }];
        if (mixed) f.proposal.weights.push({ vertexIndex: 1, weight: 0.5 });
        // Raw JSON deliberately bypasses the now-rejecting canonical serializer.
        const bytes = JSON.stringify(f.proposal);
        f.mapping.mask.sha256 = hash(bytes);
        await writeFile(join(f.folder, 'draft/proposal.json'), bytes);
        await writeFile(
          join(f.folder, 'draft/catalog.json'),
          JSON.stringify(f.catalog),
        );
        const args = [
          'draft/catalog.json',
          'draft/proposal.json',
          '--root',
          f.folder,
        ];
        for (const flags of [[], ['--write', output]]) {
          assert.throws(
            () =>
              execFileSync(
                process.execPath,
                [
                  resolve('scripts/character-v2-mask-pipeline.mjs'),
                  ...args,
                  ...flags,
                ],
                { encoding: 'utf8', stdio: 'pipe' },
              ),
            /Float32/,
          );
          await assert.rejects(stat(join(f.folder, output)), {
            code: 'ENOENT',
          });
        }
        await writeFile(join(f.folder, output), bytes);
        try {
          assert.throws(
            () =>
              execFileSync(
                process.execPath,
                [
                  resolve('scripts/character-v2-muscles-qa.mjs'),
                  'draft/catalog.json',
                  '--root',
                  f.folder,
                ],
                { encoding: 'utf8', stdio: 'pipe' },
              ),
            /Float32/,
          );
        } finally {
          await rm(join(f.folder, output));
        }
      }
    }
  }));
