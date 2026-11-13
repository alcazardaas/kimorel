import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { validateAssetFile } from './asset-files.mjs';

test('asset validation accepts only existing regular files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kimorel-assets-'));
  const root = pathToFileURL(`${directory}/`);
  try {
    await mkdir(join(directory, 'characters'));
    await writeFile(join(directory, 'characters', 'model.glb'), 'fixture');
    await validateAssetFile(root, 'characters/model.glb');
    await assert.rejects(validateAssetFile(root, 'characters/missing.glb'), {
      code: 'ENOENT',
    });
    await assert.rejects(validateAssetFile(root, 'characters'), /regular/);
    await symlink(
      join(directory, 'characters', 'model.glb'),
      join(directory, 'characters', 'linked.glb'),
    );
    await assert.rejects(
      validateAssetFile(root, 'characters/linked.glb'),
      /regular/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
