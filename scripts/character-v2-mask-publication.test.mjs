import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rm,
  lstat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { publishMaskBundle } from './character-v2-mask-publication.mjs';
import { validateMuscleCatalog } from './character-v2-muscles-qa.mjs';

const catalogFile =
  'pipeline/character-v2/shoulder-refinement/muscle-catalog.json';
const sourceCatalog = JSON.parse(await readFile(catalogFile, 'utf8'));
const proposed = await Promise.all(
  sourceCatalog.surfaceMappings.map(async (mapping) => ({
    mapping,
    payload: JSON.parse(await readFile(mapping.mask.file, 'utf8')),
  })),
);
async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'kimorel-publication-test-')),
    root = pathToFileURL(directory + '/');
  try {
    const catalog = globalThis.structuredClone(sourceCatalog);
    const outputs = [
      ...catalog.surfaceMappings.map((m) => m.mask.file),
      catalogFile,
    ];
    for (const file of [...outputs, catalog.character.file])
      await mkdir(join(directory, dirname(file)), { recursive: true });
    await writeFile(
      new URL(catalog.character.file, root),
      await readFile(catalog.character.file),
    );
    const bundle = {
      catalog,
      proposed: globalThis.structuredClone(proposed),
      catalogFile,
      root,
    };
    await run({ bundle, root, outputs, directory });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
async function absent(f) {
  for (const file of f.outputs)
    await assert.rejects(lstat(new URL(file, f.root)), { code: 'ENOENT' });
}
async function success(f) {
  const result = await publishMaskBundle(f.bundle);
  assert.equal(result.files.length, 5);
  assert.equal(result.humanApproval, false);
  assert.equal(
    (
      await validateMuscleCatalog(
        JSON.parse(await readFile(new URL(catalogFile, f.root), 'utf8')),
        f.root,
      )
    ).validatedMaskPayloads,
    4,
  );
}

test('stages and validates the actual four-mask bundle before successful publication', () =>
  fixture(async (f) => {
    let checked = false;
    const result = await publishMaskBundle(f.bundle, {
      beforeValidation: async (staging) => {
        await absent(f);
        await lstat(
          new URL(f.bundle.catalog.surfaceMappings[0].mask.file, staging),
        );
        checked = true;
      },
      beforeOpen: async (index) => {
        if (index === 0) await absent(f);
      },
    });
    assert(checked);
    assert.equal(result.files.length, 5);
    assert.equal(
      (await validateMuscleCatalog(f.bundle.catalog, f.root))
        .validatedMaskPayloads,
      4,
    );
  }));
test('every exclusive write failure rolls back only new files and permits clean retry', async () => {
  for (let failed = 0; failed < 5; failed++)
    await fixture(async (f) => {
      await assert.rejects(
        publishMaskBundle(f.bundle, {
          afterOpen: async (index, file) => {
            if (index === failed) {
              await writeFile(
                new URL(file, f.root),
                'partial publication bytes',
              );
              throw new Error('Injected write failure');
            }
          },
        }),
        /Injected/,
      );
      await absent(f);
      await success(f);
    });
});
test('real staging catalog validation failure creates no final files and retry succeeds', () =>
  fixture(async (f) => {
    await assert.rejects(
      publishMaskBundle(f.bundle, {
        beforeValidation: async (staging) => {
          await writeFile(new URL(catalogFile, staging), '{}');
        },
      }),
      /Invalid input/,
    );
    await absent(f);
    await success(f);
  }));
test('real staged mask hash failure prevents publication and permits retry', () =>
  fixture(async (f) => {
    await assert.rejects(
      publishMaskBundle(f.bundle, {
        beforeValidation: async (staging, catalog) => {
          await writeFile(
            new URL(catalog.surfaceMappings[0].mask.file, staging),
            '{}',
          );
        },
      }),
      /hash/,
    );
    await absent(f);
    await success(f);
  }));
test('postpublication readback failure rolls back the entire new bundle', () =>
  fixture(async (f) => {
    await assert.rejects(
      publishMaskBundle(f.bundle, {
        beforeReadback: async (root) => {
          await writeFile(new URL(catalogFile, root), '{}');
        },
      }),
      /Invalid input/,
    );
    await absent(f);
    await success(f);
  }));
test('every preexisting final target is preserved without publishing any other file', async () => {
  for (let existing = 0; existing < 5; existing++)
    await fixture(async (f) => {
      const file = f.outputs[existing],
        sentinel = 'preexisting data';
      await writeFile(new URL(file, f.root), sentinel);
      await assert.rejects(publishMaskBundle(f.bundle), { code: 'EEXIST' });
      assert.equal(await readFile(new URL(file, f.root), 'utf8'), sentinel);
      for (const other of f.outputs.filter((x) => x !== file))
        await assert.rejects(lstat(new URL(other, f.root)), { code: 'ENOENT' });
    });
});
test('a concurrent exclusive-create collision preserves the other writer file', () =>
  fixture(async (f) => {
    const collision = f.outputs[3];
    await assert.rejects(
      publishMaskBundle(f.bundle, {
        beforeOpen: async (index, file) => {
          if (index === 3)
            await writeFile(new URL(file, f.root), 'other writer', {
              flag: 'wx',
            });
        },
      }),
      { code: 'EEXIST' },
    );
    assert.equal(
      await readFile(new URL(collision, f.root), 'utf8'),
      'other writer',
    );
    for (const file of f.outputs.filter((x) => x !== collision))
      await assert.rejects(lstat(new URL(file, f.root)), { code: 'ENOENT' });
  }));
