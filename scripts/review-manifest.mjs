import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../assets/', import.meta.url);
const inventory = JSON.parse(
  await readFile(new URL('ASSET_LICENSES.json', root), 'utf8'),
);
const records = await Promise.all(
  inventory.assets.map(async (asset) => {
    const bytes = await readFile(new URL(asset.file, root));
    return {
      assetId: asset.assetId,
      file: asset.file,
      status: asset.status,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }),
);
const output = new URL(
  '../packages/data/src/asset-review.json',
  import.meta.url,
);
const content = JSON.stringify(records, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if ((await readFile(output, 'utf8')) !== content)
    throw new Error('Review hashes are stale. Run pnpm assets:hashes.');
  console.log(`Verified exact review hashes for ${records.length} assets.`);
} else await writeFile(output, content);
