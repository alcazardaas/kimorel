/** Explicit draft authoring only; no anatomical acceptance or automatic catalog edit. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { lstat, readFile, open } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { assetPathSchema } from '../packages/schemas/dist/index.js';
import { muscleCatalogV2Schema } from '../packages/schemas/dist/muscles-v2.js';
import {
  parseBoundSparseMask,
  serializeSparseMask,
  materializeSparseMask,
} from '../packages/schemas/dist/muscle-masks-v2.js';
import { validateAssetFile } from './asset-files.mjs';
import { readGlb } from './glb-qa.mjs';

const projectRoot = new URL('../', import.meta.url);
export const sparseMaskOutputPrefix = 'pipeline/character-v2/masks/';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function checkedParents(root, file) {
  assetPathSchema.parse(file);
  const rootStat = await lstat(resolve(fileURLToPath(root)));
  assert(
    rootStat.isDirectory() && !rootStat.isSymbolicLink(),
    'Root must be a real directory',
  );
  let parent = root;
  for (const part of file.split('/').slice(0, -1)) {
    const stat = await lstat(new URL(part, parent));
    assert(
      stat.isDirectory() && !stat.isSymbolicLink(),
      'Bound file parent must be a real directory',
    );
    parent = new URL(part + '/', parent);
  }
}
async function readCheckedFile(root, file) {
  await checkedParents(root, file);
  await validateAssetFile(root, file);
  return readFile(new URL(file, root));
}
export async function readDraftJson(root, file) {
  return JSON.parse((await readCheckedFile(root, file)).toString('utf8'));
}
export async function readBoundFile(root, file, expectedHash) {
  const bytes = await readCheckedFile(root, file);
  assert.equal(
    sha256(bytes),
    expectedHash,
    `Bound file hash mismatch: ${file}`,
  );
  return bytes;
}
function vertexDomain(character, mapping) {
  const primitive =
    character.meshes?.[mapping.meshIndex]?.primitives[mapping.primitiveIndex];
  assert(
    primitive &&
      character.accessors[primitive.attributes.POSITION]?.count ===
        mapping.vertexCount,
    'Surface mapping vertex domain mismatch',
  );
}
function checkedPayload(value, mapping) {
  const payload = parseBoundSparseMask(value, mapping);
  return { payload, dense: materializeSparseMask(payload) };
}
export async function loadMappedSparseMask(mapping, character, root) {
  vertexDomain(character, mapping);
  const bytes = await readBoundFile(
    root,
    mapping.mask.file,
    mapping.mask.sha256,
  );
  return checkedPayload(JSON.parse(bytes.toString('utf8')), mapping);
}
export async function inspectSparseMask(
  catalogValue,
  proposed,
  root = projectRoot,
) {
  const catalog = muscleCatalogV2Schema.parse(catalogValue);
  const mapping = catalog.surfaceMappings.find(
    (m) => m.id === proposed?.binding?.id,
  );
  assert(mapping, 'Proposal must reference an existing draft catalog mapping');
  const character = readGlb(
    await readBoundFile(root, catalog.character.file, catalog.character.sha256),
  );
  vertexDomain(character, mapping);
  const { payload, dense } = checkedPayload(proposed, mapping);
  const bytes = Buffer.from(serializeSparseMask(payload));
  return {
    payload,
    dense,
    bytes,
    mapping,
    report: {
      status: 'draft-mask-proposal',
      humanApproval: false,
      anatomicalValidation: false,
      canonicalSha256: sha256(bytes),
      catalogHashMatches: sha256(bytes) === mapping.mask.sha256,
      outputFile: mapping.mask.file,
      vertexCount: dense.length,
      assignedVertices: payload.weights.length,
      purpose: payload.purpose,
    },
  };
}
export async function writeSparseMask(
  catalog,
  proposal,
  output,
  root = projectRoot,
) {
  const prepared = await inspectSparseMask(catalog, proposal, root);
  assert(
    prepared.report.catalogHashMatches,
    'Canonical mask hash must match proposed catalog before writing',
  );
  assert(
    output === prepared.mapping.mask.file &&
      output.startsWith(sparseMaskOutputPrefix),
    'Write output must match mapping inside isolated masks directory',
  );
  await checkedParents(root, output); // Existing directories only; never create through symlinks.
  const handle = await open(new URL(output, root), 'wx', 0o644);
  try {
    await handle.writeFile(prepared.bytes);
  } finally {
    await handle.close();
  }
  await readBoundFile(root, output, prepared.report.canonicalSha256);
  return { ...prepared.report, written: true };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [catalogFile, proposalFile, ...args] = process.argv.slice(2);
  assert(
    catalogFile && proposalFile,
    'Usage: mask-pipeline <catalog.json> <proposal.json> [--root directory] [--write separate-output.json]',
  );
  let root = projectRoot,
    output;
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i],
      value = args[i + 1];
    assert(
      ['--root', '--write'].includes(key) && value && !seen.has(key),
      'Unknown, missing or duplicate option',
    );
    seen.add(key);
    if (key === '--root') root = pathToFileURL(resolve(value) + sep);
    else output = assetPathSchema.parse(value);
  }
  const catalog = await readDraftJson(root, catalogFile);
  const proposal = await readDraftJson(root, proposalFile);
  if (output)
    assert(
      output !== catalogFile && output !== proposalFile,
      'Write requires a separate output path',
    );
  const report = output
    ? await writeSparseMask(catalog, proposal, output, root)
    : (await inspectSparseMask(catalog, proposal, root)).report;
  console.log(JSON.stringify(report, null, 2));
}
