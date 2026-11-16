import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { assetManifestSchema } from '../packages/schemas/dist/index.js';
import { exercises, equipmentRegistry } from '../packages/data/dist/index.js';
import { validateAssetFile } from './asset-files.mjs';
import { validateGlb, validateEquipment } from './glb-qa.mjs';
const preview = process.argv.includes('--preview');
const pending = [];
const root = new URL('../assets/', import.meta.url);
const manifest = assetManifestSchema.parse(
  JSON.parse(await readFile(new URL('ASSET_LICENSES.json', root), 'utf8')),
);
const assets = new Map(manifest.assets.map((asset) => [asset.assetId, asset]));
const files = new Set(manifest.assets.map((asset) => asset.file));
if (files.size !== manifest.assets.length)
  throw new Error('Duplicate asset file');
for (const asset of manifest.assets) {
  await validateAssetFile(root, asset.file);
  if (asset.status === 'approved') {
    const digest = createHash('sha256')
      .update(await readFile(new URL(asset.file, root)))
      .digest('hex');
    if (asset.visualReview?.sha256 !== digest)
      throw new Error(`Asset changed since human review: ${asset.assetId}`);
  }
}
for (const equipment of equipmentRegistry) {
  const asset = assets.get(equipment.assetId);
  if (!asset || asset.file !== equipment.file)
    throw new Error(`Invalid equipment asset: ${equipment.id}`);
  const report = await validateEquipment(new URL(equipment.file, root));
  if (
    report.dimensionsMeters.some(
      (value, axis) =>
        Math.abs(value - equipment.dimensionsMeters[axis]) > 0.0001,
    )
  )
    throw new Error(`Equipment registry dimensions mismatch: ${equipment.id}`);
}
for (const exercise of exercises) {
  if (!exercise.animation) continue;
  const asset = assets.get(exercise.animation.assetId);
  if (!asset || asset.file !== exercise.animation.file)
    throw new Error(`Invalid animation reference: ${exercise.id}`);
  if (!asset.commercialUse || !asset.redistribution)
    throw new Error(`Missing redistribution permissions: ${asset.assetId}`);
  if (asset.status !== 'approved')
    pending.push(`${asset.assetId}: ${asset.status}`);
  const report = await validateGlb(
    new URL(asset.file, root),
    exercise.animation.clip,
  );
  if (report.kind !== (exercise.animation.kind ?? 'repetition'))
    throw new Error(`Animation kind mismatch: ${exercise.id}`);
}
async function checkDirectory(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = prefix + entry.name;
    if (entry.isDirectory())
      await checkDirectory(new URL(`${entry.name}/`, directory), `${file}/`);
    else if (entry.isSymbolicLink())
      throw new Error(`Asset symlinks are not permitted: ${file}`);
    else if (
      !['.gitkeep', 'ASSET_LICENSES.json'].includes(entry.name) &&
      !files.has(file)
    )
      throw new Error(`Asset missing provenance: ${file}`);
  }
}
await checkDirectory(root);
for (const asset of manifest.assets) {
  if (!asset.commercialUse || !asset.redistribution)
    throw new Error(`Missing redistribution permissions: ${asset.assetId}`);
  if (
    asset.origin === 'third-party' &&
    (!asset.sourceUrl || !asset.licenseEvidenceUrl || !asset.downloadDate)
  )
    throw new Error(`Missing third-party provenance: ${asset.assetId}`);
  if (
    asset.status !== 'approved' &&
    !pending.some((item) => item.startsWith(`${asset.assetId}:`))
  )
    pending.push(`${asset.assetId}: ${asset.status}`);
}
if (pending.length && !preview)
  throw new Error(
    `Human asset approval required before release:\n${pending.join('\n')}`,
  );
if (pending.length)
  console.log(`Preview only; NOT approved for release:\n${pending.join('\n')}`);
console.log(
  `Validated ${exercises.length} exercise examples and ${assets.size} asset records.`,
);
