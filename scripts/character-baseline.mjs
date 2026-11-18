import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readGlb } from './glb-qa.mjs';

export const baselinePath = 'pipeline/character-v2/v1-baseline.json';
const schemaVersion = 'kimorel.character-baseline/v1';
const artifactDirectories = [
  'assets/characters',
  'assets/equipment',
  'assets/exercises',
  'assets/thumbnails',
  'docs/reviews',
];
const fixedSources = [
  '.nvmrc',
  'assets/ASSET_LICENSES.json',
  'docs/architecture/skeleton.md',
  'docs/asset-license-cc0.md',
  'packages/data/src/asset-review.json',
  'packages/data/src/exercises.json',
];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) =>
  JSON.stringify(value, function (_key, item) {
    return item && !Array.isArray(item) && typeof item === 'object'
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item;
  });
const countBy = (values) =>
  Object.fromEntries(
    [...new Set(values)]
      .sort()
      .map((key) => [key, values.filter((v) => v === key).length]),
  );
const integer = (value) => Number.isSafeInteger(value) && value >= 0;

function keys(value, expected, label) {
  assert(
    value && !Array.isArray(value) && typeof value === 'object',
    `Invalid ${label}`,
  );
  assert.deepEqual(
    Object.keys(value).sort(),
    [...expected].sort(),
    `Invalid ${label} fields`,
  );
}

function safePath(file) {
  assert(
    typeof file === 'string' &&
      /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(file),
    'Unsafe baseline path',
  );
  assert(
    !file.split('/').some((part) => part === '.' || part === '..'),
    'Unsafe baseline path',
  );
  return file;
}

async function regularFile(root, file) {
  let current = root;
  const parts = safePath(file).split('/');
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const stat = await lstat(current);
    assert(!stat.isSymbolicLink(), `Symlink is not a protected file: ${file}`);
    assert(
      index === parts.length - 1 ? stat.isFile() : stat.isDirectory(),
      `Expected regular file: ${file}`,
    );
  }
  return readFile(current);
}

async function directoryFiles(root, directory, select) {
  // Validate every parent with the same no-symlink policy before enumerating.
  let current = root;
  for (const part of safePath(directory).split('/')) {
    current = join(current, part);
    const stat = await lstat(current);
    assert(
      stat.isDirectory() && !stat.isSymbolicLink(),
      `Unsafe protected directory: ${directory}`,
    );
  }
  return (await readdir(current))
    .filter(select)
    .map((name) => `${directory}/${name}`);
}

async function inventoryPaths(root) {
  const artifacts = (
    await Promise.all(
      artifactDirectories.map((directory) =>
        directoryFiles(root, directory, (name) => /\.(glb|png)$/.test(name)),
      ),
    )
  ).flat();
  const sources = [
    ...fixedSources,
    ...(await directoryFiles(root, 'pipeline/character', (name) =>
      /\.(py|json)$/.test(name),
    )),
    ...(await directoryFiles(root, 'packages/schemas/src', (name) =>
      /^muscle-regions.*\.json$/.test(name),
    )),
  ];
  return [
    ...artifacts.map((path) => ({ path, role: 'artifact' })),
    ...sources.map((path) => ({ path, role: 'source' })),
  ].sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

function unique(records, field, label) {
  assert(Array.isArray(records) && records.length > 0, `Invalid ${label}`);
  const values = records.map((record) => record[field]);
  assert(
    values.every((value) => typeof value === 'string' && value.length),
    `Invalid ${label} ${field}`,
  );
  assert.equal(
    new Set(values).size,
    values.length,
    `Duplicate ${label} ${field}`,
  );
}

function glbMetrics(bytes) {
  const document = readGlb(bytes);
  const primitives = (document.meshes ?? []).flatMap((mesh) => mesh.primitives);
  let vertices = 0,
    triangles = 0;
  for (const primitive of primitives) {
    const positions = document.accessors?.[primitive.attributes?.POSITION];
    const indices = document.accessors?.[primitive.indices];
    assert(
      positions &&
        indices &&
        integer(positions.count) &&
        integer(indices.count),
      'Invalid GLB metric accessors',
    );
    assert(
      (primitive.mode ?? 4) === 4 && indices.count % 3 === 0,
      'Unsupported non-triangle baseline geometry',
    );
    vertices += positions.count;
    triangles += indices.count / 3;
  }
  const durations = {};
  const binary = 28 + bytes.readUInt32LE(12);
  for (const animation of document.animations ?? []) {
    assert(
      typeof animation.name === 'string' && !(animation.name in durations),
      'Duplicate or unnamed animation',
    );
    let minimum = Infinity,
      maximum = -Infinity;
    for (const sampler of animation.samplers) {
      const accessor = document.accessors?.[sampler.input];
      const view = document.bufferViews?.[accessor?.bufferView];
      assert(
        accessor?.componentType === 5126 &&
          accessor.type === 'SCALAR' &&
          integer(accessor.count) &&
          accessor.count > 0 &&
          view?.buffer === 0,
        'Invalid animation time accessor',
      );
      const stride = view.byteStride ?? 4;
      const offset =
        binary + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      assert(
        integer(stride) && stride >= 4 && integer(offset),
        'Invalid animation time layout',
      );
      for (let i = 0; i < accessor.count; i++) {
        const at = offset + i * stride;
        assert(
          at + 4 <= binary + (view.byteOffset ?? 0) + view.byteLength &&
            at + 4 <= bytes.length,
          'Animation time exceeds buffer',
        );
        const time = bytes.readFloatLE(at);
        assert(Number.isFinite(time), 'Non-finite animation time');
        minimum = Math.min(minimum, time);
        maximum = Math.max(maximum, time);
      }
    }
    assert(
      Number.isFinite(minimum) && Number.isFinite(maximum),
      'Missing animation time',
    );
    durations[animation.name] = maximum - minimum;
  }
  const skins = (document.skins ?? []).map((skin) => {
    assert(
      Array.isArray(skin.joints) && skin.joints.length > 0,
      'Invalid skin joints',
    );
    const names = skin.joints.map((index) => document.nodes?.[index]?.name);
    assert(
      names.every((name) => typeof name === 'string' && name.length) &&
        new Set(names).size === names.length,
      'Invalid skin joint names',
    );
    return { name: skin.name ?? 'unnamed', joints: names };
  });
  return { vertices, triangles, durations, skins };
}

export function validateBaseline(baseline) {
  keys(
    baseline,
    [
      'schemaVersion',
      'sourceRevision',
      'toolchain',
      'counts',
      'rigs',
      'regions',
      'permissions',
      'referenceMetrics',
      'exercises',
      'files',
    ],
    'baseline',
  );
  assert.equal(
    baseline.schemaVersion,
    schemaVersion,
    'Unsupported baseline version',
  );
  assert(
    /^[a-f0-9]{40}$/.test(baseline.sourceRevision),
    'Invalid source revision',
  );
  keys(baseline.toolchain, ['node', 'pnpm'], 'toolchain');
  assert(
    /^\d+\.\d+\.\d+$/.test(baseline.toolchain.node) &&
      /^pnpm@\d+\.\d+\.\d+$/.test(baseline.toolchain.pnpm),
    'Invalid toolchain',
  );
  keys(
    baseline.counts,
    [
      'exercises',
      'provenanceRecords',
      'reviewRecords',
      'artifacts',
      'glb',
      'png',
      'artifactBytes',
    ],
    'counts',
  );
  assert(
    Object.values(baseline.counts).every(integer),
    'Invalid baseline counts',
  );
  unique(baseline.files, 'path', 'protected files');
  assert.deepEqual(
    baseline.files.map((file) => file.path),
    baseline.files
      .map((file) => file.path)
      .sort((a, b) => a.localeCompare(b, 'en')),
    'Protected files must be canonically sorted',
  );
  for (const file of baseline.files) {
    keys(file, ['path', 'role', 'bytes', 'sha256'], 'protected file');
    safePath(file.path);
    assert(
      ['artifact', 'source'].includes(file.role) &&
        integer(file.bytes) &&
        /^[a-f0-9]{64}$/.test(file.sha256),
      'Invalid protected file metadata',
    );
  }
  const artifacts = baseline.files.filter((file) => file.role === 'artifact');
  assert.equal(
    baseline.counts.artifacts,
    artifacts.length,
    'Artifact count mismatch',
  );
  assert.equal(
    baseline.counts.artifactBytes,
    artifacts.reduce((total, file) => total + file.bytes, 0),
    'Artifact byte count mismatch',
  );
  for (const extension of ['glb', 'png'])
    assert.equal(
      baseline.counts[extension],
      artifacts.filter((file) => file.path.endsWith(`.${extension}`)).length,
      'Artifact extension count mismatch',
    );
  unique(baseline.exercises, 'id', 'exercise identities');
  assert.equal(
    baseline.counts.exercises,
    baseline.exercises.length,
    'Exercise count mismatch',
  );
  assert.deepEqual(
    baseline.exercises.map((exercise) => exercise.id),
    baseline.exercises.map((exercise) => exercise.id).sort(),
    'Exercise identities must be canonically sorted',
  );
  for (const exercise of baseline.exercises) {
    keys(
      exercise,
      ['id', 'name', 'animation', 'rig', 'regionVersion', 'profileSha256'],
      'exercise',
    );
    assert(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(exercise.id) &&
        typeof exercise.name === 'string' &&
        exercise.name.length &&
        typeof exercise.rig === 'string' &&
        exercise.rig.length &&
        /^\d+\.\d+\.\d+$/.test(exercise.regionVersion) &&
        /^[a-f0-9]{64}$/.test(exercise.profileSha256),
      'Invalid exercise semantics',
    );
    keys(
      exercise.animation,
      ['assetId', 'file', 'clip', 'kind', 'loop', 'durationSeconds'],
      'animation',
    );
    assert(
      typeof exercise.animation.assetId === 'string' &&
        exercise.animation.assetId.length &&
        typeof exercise.animation.clip === 'string' &&
        exercise.animation.clip.length &&
        ['hold', 'repetition'].includes(exercise.animation.kind) &&
        typeof exercise.animation.loop === 'boolean' &&
        Number.isFinite(exercise.animation.durationSeconds) &&
        exercise.animation.durationSeconds > 0,
      'Invalid animation semantics',
    );
    safePath(exercise.animation.file);
    assert(
      artifacts.some(
        (file) => file.path === `assets/${exercise.animation.file}`,
      ),
      'Unprotected exercise asset',
    );
  }
  assert(
    Array.isArray(baseline.rigs) && Array.isArray(baseline.regions),
    'Invalid rig or region inventory',
  );
  for (const rig of baseline.rigs) {
    keys(rig, ['name', 'joints', 'assets'], 'rig');
    assert(
      typeof rig.name === 'string' &&
        Array.isArray(rig.joints) &&
        rig.joints.length > 0 &&
        rig.joints.every((name) => typeof name === 'string' && name.length) &&
        new Set(rig.joints).size === rig.joints.length &&
        integer(rig.assets) &&
        rig.assets > 0,
      'Invalid rig inventory',
    );
  }
  unique(baseline.regions, 'file', 'region definitions');
  for (const region of baseline.regions) {
    keys(region, ['file', 'version'], 'region');
    safePath(region.file);
    assert(
      /^\d+\.\d+\.\d+$/.test(region.version) &&
        baseline.files.some(
          (file) => file.path === region.file && file.role === 'source',
        ),
      'Invalid region inventory',
    );
  }
  keys(baseline.permissions, ['origin', 'license', 'status'], 'permissions');
  for (const counts of Object.values(baseline.permissions)) {
    assert(
      counts &&
        !Array.isArray(counts) &&
        typeof counts === 'object' &&
        Object.keys(counts).length > 0 &&
        Object.entries(counts).every(
          ([key, value]) => key.length && integer(value) && value > 0,
        ),
      'Invalid permission counts',
    );
    assert.equal(
      Object.values(counts).reduce((total, value) => total + value, 0),
      baseline.counts.provenanceRecords,
      'Permission count mismatch',
    );
  }
  keys(
    baseline.referenceMetrics,
    ['file', 'vertices', 'triangles', 'humanJoints', 'skinJointCounts'],
    'reference metrics',
  );
  assert(
    baseline.referenceMetrics.file === 'assets/characters/neutral-human.glb' &&
      ['vertices', 'triangles', 'humanJoints'].every(
        (key) =>
          integer(baseline.referenceMetrics[key]) &&
          baseline.referenceMetrics[key] > 0,
      ),
    'Invalid reference metrics',
  );
  assert(
    baseline.referenceMetrics.skinJointCounts &&
      typeof baseline.referenceMetrics.skinJointCounts === 'object' &&
      !Array.isArray(baseline.referenceMetrics.skinJointCounts) &&
      Object.entries(baseline.referenceMetrics.skinJointCounts).every(
        ([key, value]) => /^[1-9]\d*$/.test(key) && integer(value) && value > 0,
      ),
    'Invalid skin counts',
  );
  return baseline;
}

export async function captureBaseline(root, sourceRevision) {
  root = await realpath(root);
  assert(
    /^[a-f0-9]{40}$/.test(sourceRevision),
    'Capture requires a full source revision',
  );
  const entries = await inventoryPaths(root);
  const contents = new Map();
  const files = [];
  for (const entry of entries) {
    const bytes = await regularFile(root, entry.path);
    contents.set(entry.path, bytes);
    files.push({ ...entry, bytes: bytes.length, sha256: digest(bytes) });
  }
  const json = (file) => JSON.parse(contents.get(file).toString('utf8'));
  const exercises = json('packages/data/src/exercises.json');
  const provenance = json('assets/ASSET_LICENSES.json').assets;
  const reviews = json('packages/data/src/asset-review.json');
  const profiles = json('pipeline/character/motion-profiles.json');
  unique(exercises, 'id', 'exercise registry');
  unique(provenance, 'assetId', 'provenance');
  unique(provenance, 'file', 'provenance');
  unique(reviews, 'assetId', 'review records');
  unique(reviews, 'file', 'review records');
  assert.deepEqual(
    Object.keys(profiles).sort(),
    exercises.map((exercise) => exercise.id).sort(),
    'Motion profile identities mismatch',
  );
  assert.equal(
    provenance.length,
    reviews.length,
    'Review inventory count mismatch',
  );
  const byPath = new Map(files.map((file) => [file.path, file]));
  for (const asset of provenance) {
    safePath(asset.file);
    const protectedFile = byPath.get(`assets/${asset.file}`);
    const review = reviews.find((record) => record.assetId === asset.assetId);
    assert(
      protectedFile?.role === 'artifact' &&
        review?.file === asset.file &&
        review.status === asset.status &&
        review.bytes === protectedFile.bytes &&
        review.sha256 === protectedFile.sha256,
      `Review identity mismatch: ${asset.assetId}`,
    );
    assert(
      typeof asset.origin === 'string' &&
        typeof asset.license === 'string' &&
        typeof asset.status === 'string' &&
        typeof asset.commercialUse === 'boolean' &&
        typeof asset.redistribution === 'boolean',
      'Invalid permission metadata',
    );
  }
  const metrics = new Map(
    [...contents]
      .filter(([file]) => file.endsWith('.glb'))
      .map(([file, bytes]) => [file, glbMetrics(bytes)]),
  );
  const reference = metrics.get('assets/characters/neutral-human.glb');
  assert(reference?.skins.length, 'Missing reference character skin');
  const regions = files
    .filter((file) =>
      /^packages\/schemas\/src\/muscle-regions.*\.json$/.test(file.path),
    )
    .map((file) => ({ file: file.path, version: json(file.path).version }));
  const defaultRegion = json(
    'packages/schemas/src/muscle-regions.json',
  ).version;
  const rigs = new Map();
  const skinCounts = [];
  for (const metric of metrics.values())
    for (const skin of metric.skins) {
      skinCounts.push(String(skin.joints.length));
      if (skin.joints.includes('pelvis')) {
        const key = canonical(skin);
        rigs.set(key, { ...skin, assets: (rigs.get(key)?.assets ?? 0) + 1 });
      }
    }
  const packageConfig = JSON.parse(
    (await regularFile(root, 'package.json')).toString(),
  );
  const artifacts = files.filter((file) => file.role === 'artifact');
  return validateBaseline({
    schemaVersion,
    sourceRevision,
    toolchain: {
      node: contents.get('.nvmrc').toString().trim(),
      pnpm: packageConfig.packageManager,
    },
    counts: {
      exercises: exercises.length,
      provenanceRecords: provenance.length,
      reviewRecords: reviews.length,
      artifacts: artifacts.length,
      glb: artifacts.filter((file) => file.path.endsWith('.glb')).length,
      png: artifacts.filter((file) => file.path.endsWith('.png')).length,
      artifactBytes: artifacts.reduce((total, file) => total + file.bytes, 0),
    },
    rigs: [...rigs]
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([, rig]) => rig),
    regions,
    permissions: Object.fromEntries(
      ['origin', 'license', 'status'].map((key) => [
        key,
        countBy(provenance.map((record) => record[key])),
      ]),
    ),
    referenceMetrics: {
      file: 'assets/characters/neutral-human.glb',
      vertices: reference.vertices,
      triangles: reference.triangles,
      humanJoints: reference.skins[0].joints.length,
      skinJointCounts: countBy(skinCounts),
    },
    exercises: exercises
      .map((exercise) => {
        const profile = profiles[exercise.id];
        const animation = exercise.animation;
        const asset = provenance.find(
          (record) => record.assetId === animation?.assetId,
        );
        const clip = metrics.get(`assets/${animation?.file}`);
        assert(
          asset?.file === animation.file &&
            (profile.clip ?? 'rep') === animation.clip &&
            (profile.kind ?? 'repetition') === (animation.kind ?? 'repetition'),
          `Animation identity mismatch: ${exercise.id}`,
        );
        return {
          id: exercise.id,
          name: exercise.name,
          animation: {
            assetId: animation.assetId,
            file: animation.file,
            clip: animation.clip,
            kind: animation.kind ?? 'repetition',
            loop: animation.loop,
            durationSeconds: clip?.durations[animation.clip],
          },
          rig: profile.rig ?? 'canonical-v1',
          regionVersion: profile.regionVersion ?? defaultRegion,
          profileSha256: digest(canonical(profile)),
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id, 'en')),
    files,
  });
}

export const serializeBaseline = (baseline) =>
  JSON.stringify(validateBaseline(baseline), null, 2) + '\n';

export async function checkBaseline(root, baseline) {
  validateBaseline(baseline);
  const actual = await captureBaseline(root, baseline.sourceRevision);
  assert.deepEqual(
    actual.files.map(({ path, role }) => ({ path, role })),
    baseline.files.map(({ path, role }) => ({ path, role })),
    'Protected v1 inventory changed',
  );
  for (const [index, file] of baseline.files.entries())
    assert(
      actual.files[index].bytes === file.bytes &&
        actual.files[index].sha256 === file.sha256,
      `Protected file changed: ${file.path}`,
    );
  assert.equal(
    canonical(actual),
    canonical(baseline),
    'Baseline semantics or derived inventory mismatch',
  );
  return actual.counts;
}

async function newOutput(root, file, content) {
  safePath(file);
  let current = root;
  for (const part of file.split('/').slice(0, -1)) {
    current = join(current, part);
    try {
      await mkdir(current);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const stat = await lstat(current);
    assert(
      stat.isDirectory() && !stat.isSymbolicLink(),
      'Unsafe capture directory',
    );
  }
  await writeFile(join(root, file), content, { flag: 'wx' });
}

async function main(args) {
  let root = fileURLToPath(new URL('../', import.meta.url));
  let file = baselinePath,
    capture,
    revision;
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    assert(!seen.has(flag), `Duplicate argument: ${flag}`);
    seen.add(flag);
    if (flag === '--check') continue;
    assert(
      ['--root', '--baseline', '--capture', '--source-revision'].includes(
        flag,
      ) &&
        args[i + 1] &&
        !args[i + 1].startsWith('--'),
      `Invalid argument: ${flag}`,
    );
    const value = args[++i];
    if (flag === '--root') root = value;
    else if (flag === '--baseline') file = value;
    else if (flag === '--capture') capture = value;
    else revision = value;
  }
  root = await realpath(root);
  if (capture) {
    assert(
      !seen.has('--baseline') && !seen.has('--check') && revision,
      'Capture requires --source-revision and cannot use --baseline or --check',
    );
    await newOutput(
      root,
      capture,
      serializeBaseline(await captureBaseline(root, revision)),
    );
    console.log(
      `Captured v1 baseline at ${capture}; no assets regenerated or approved.`,
    );
  } else {
    assert(!revision, '--source-revision is capture-only');
    const counts = await checkBaseline(
      root,
      JSON.parse((await regularFile(root, file)).toString()),
    );
    console.log(
      `Preserved ${counts.exercises} v1 exercises and ${counts.artifacts} artifacts (${counts.artifactBytes} bytes); human/device approval remains separate.`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
