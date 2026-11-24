/** Staged validation + recoverable exclusive publication, not crash-atomic storage. */
import assert from 'node:assert/strict';
import {
  mkdtemp,
  chmod,
  mkdir,
  open,
  readFile,
  lstat,
  unlink,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assetPathSchema } from '../packages/schemas/dist/index.js';
import { muscleCatalogV2Schema } from '../packages/schemas/dist/muscles-v2.js';
import {
  checkedParents,
  readBoundFile,
  readDraftJson,
  writeSparseMask,
} from './character-v2-mask-pipeline.mjs';
import { validateMuscleCatalog } from './character-v2-muscles-qa.mjs';

const projectRoot = new URL('../', import.meta.url);
async function absent(root, file) {
  await checkedParents(root, file);
  try {
    await lstat(new URL(file, root));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  const error = new Error(`Refusing existing publication target: ${file}`);
  error.code = 'EEXIST';
  throw error;
}
/** Fault hooks may throw for tests; no hook bypasses the real staging validator. */
export async function publishMaskBundle(
  { catalog: input, proposed, catalogFile, root = projectRoot },
  faults = {},
) {
  const catalog = muscleCatalogV2Schema.parse(input);
  assetPathSchema.parse(catalogFile);
  assert(catalogFile.endsWith('.json'), 'Expected catalog JSON destination');
  const outputs = [
    ...catalog.surfaceMappings.map((m) => m.mask.file),
    catalogFile,
  ];
  assert.equal(
    new Set(outputs).size,
    outputs.length,
    'Duplicate publication target',
  );
  assert(
    !outputs.includes(catalog.character.file),
    'Publication must not replace character',
  );
  // Check all existing final paths before staging. Exclusive open repeats this gate
  // at publication time, including races with another ordinary publisher.
  for (const file of outputs) await absent(root, file);
  const directory = await mkdtemp(join(tmpdir(), 'kimorel-mask-publish-'));
  const staging = pathToFileURL(directory + sep),
    owned = [];
  let failure, result;
  try {
    await chmod(directory, 0o700);
    const stageParents = async (file) => {
      assetPathSchema.parse(file);
      await mkdir(new URL(dirname(file) + '/', staging), { recursive: true });
    };
    await stageParents(catalog.character.file);
    await writeFile(
      new URL(catalog.character.file, staging),
      await readBoundFile(
        root,
        catalog.character.file,
        catalog.character.sha256,
      ),
      { flag: 'wx', mode: 0o600 },
    );
    for (const { mapping, payload } of proposed) {
      assert(
        catalog.surfaceMappings.some(
          (m) => m.id === mapping.id && m.mask.file === mapping.mask.file,
        ),
        'Unknown staged mapping',
      );
      await stageParents(mapping.mask.file);
      await writeSparseMask(catalog, payload, mapping.mask.file, staging);
    }
    await stageParents(catalogFile);
    await writeFile(
      new URL(catalogFile, staging),
      JSON.stringify(catalog, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    await faults.beforeValidation?.(staging, catalog);
    const stagedCatalog = await readDraftJson(staging, catalogFile);
    await validateMuscleCatalog(stagedCatalog, staging);
    assert.deepEqual(stagedCatalog, catalog, 'Staged catalog changed');
    for (let index = 0; index < outputs.length; index++) {
      const file = outputs[index];
      await checkedParents(root, file);
      await faults.beforeOpen?.(index, file);
      const handle = await open(new URL(file, root), 'wx', 0o644);
      try {
        const record = { file, dev: null, ino: null };
        owned.push(record);
        const stat = await handle.stat();
        Object.assign(record, { dev: stat.dev, ino: stat.ino });
        // Fault after ownership is recorded tests rollback of an empty/partial file.
        await faults.afterOpen?.(index, file);
        await handle.writeFile(await readFile(new URL(file, staging)));
      } finally {
        await handle.close();
      }
    }
    // Catalog is published last; successful readback is still required. Ordinary
    // validation/readback failures are caught by the same ownership rollback.
    await faults.beforeReadback?.(root, catalog);
    const publishedCatalog = await readDraftJson(root, catalogFile);
    await validateMuscleCatalog(publishedCatalog, root);
    assert.deepEqual(publishedCatalog, catalog, 'Published catalog changed');
    result = {
      status: 'draft-bundle-published',
      humanApproval: false,
      files: outputs,
    };
  } catch (error) {
    failure = error;
  } finally {
    try {
      await rm(directory, { recursive: true, force: true });
    } catch (cleanup) {
      failure = failure
        ? new AggregateError(
            [failure, cleanup],
            'Publication/staging cleanup failed',
          )
        : cleanup;
    }
    if (failure) {
      const cleanup = [];
      for (const record of [...owned].reverse()) {
        try {
          const current = await lstat(new URL(record.file, root));
          assert(
            !current.isSymbolicLink() &&
              current.dev === record.dev &&
              current.ino === record.ino,
            'Publication target replaced; refusing foreign cleanup',
          );
          await unlink(new URL(record.file, root));
        } catch (rollback) {
          if (rollback.code !== 'ENOENT') cleanup.push(rollback);
        }
      }
      if (cleanup.length)
        failure = new AggregateError(
          [failure, ...cleanup],
          'Publication failed; some owned-file cleanup could not be verified',
        );
    }
  }
  if (failure) throw failure;
  return result;
}
