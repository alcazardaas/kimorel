import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

test('review display identifies the exact current bytes and pending approval status', async () => {
  const records = JSON.parse(
    await readFile('packages/data/src/asset-review.json', 'utf8'),
  );
  const manifest = JSON.parse(
    await readFile('assets/ASSET_LICENSES.json', 'utf8'),
  );
  assert.equal(records.length, manifest.assets.length);
  for (const record of records) {
    const bytes = await readFile(`assets/${record.file}`);
    assert.equal(
      record.sha256,
      createHash('sha256').update(bytes).digest('hex'),
    );
    assert.equal(record.bytes, bytes.length);
    assert.equal(
      record.status,
      manifest.assets.find((asset) => asset.assetId === record.assetId).status,
    );
  }
});
