import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  baselinePath,
  captureBaseline,
  checkBaseline,
  serializeBaseline,
  validateBaseline,
} from './character-baseline.mjs';

const revision = 'a'.repeat(40);
const cli = fileURLToPath(new URL('./character-baseline.mjs', import.meta.url));
const run = promisify(execFile);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function glb(animated) {
  const binary = Buffer.alloc(52);
  binary.writeFloatLE(4, 4);
  binary.writeFloatLE(1, 20);
  binary.writeFloatLE(1, 36);
  binary.writeUInt16LE(1, 46);
  binary.writeUInt16LE(2, 48);
  const document = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 8 },
      { buffer: 0, byteOffset: 8, byteLength: 36 },
      { buffer: 0, byteOffset: 44, byteLength: 6 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 2, type: 'SCALAR' },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    nodes: [{ name: 'root', children: [1] }, { name: 'pelvis' }],
    skins: [{ name: 'fixture-rig', joints: [0, 1] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 1 }, indices: 2 }] }],
    ...(animated
      ? {
          animations: [
            { name: 'rep', samplers: [{ input: 0, output: 1 }], channels: [] },
          ],
        }
      : {}),
  };
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(padded);
  const result = Buffer.alloc(28 + padded.length + binary.length);
  result.writeUInt32LE(0x46546c67, 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(padded.length, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(result, 20);
  result.writeUInt32LE(binary.length, 20 + padded.length);
  result.writeUInt32LE(0x004e4942, 24 + padded.length);
  binary.copy(result, 28 + padded.length);
  return result;
}

async function put(root, file, contents) {
  await mkdir(dirname(join(root, file)), { recursive: true });
  await writeFile(
    join(root, file),
    typeof contents === 'object' && !Buffer.isBuffer(contents)
      ? JSON.stringify(contents, null, 2) + '\n'
      : contents,
  );
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kimorel-character-baseline-'));
  for (const directory of ['assets/equipment', 'docs/reviews'])
    await mkdir(join(root, directory), { recursive: true });
  await put(root, '.nvmrc', '26.13.1\n');
  await put(root, 'package.json', { packageManager: 'pnpm@10.15.0' });
  await put(root, 'docs/architecture/skeleton.md', 'Fixture v1 contract.\n');
  await put(
    root,
    'docs/asset-license-cc0.md',
    'Fixture original permission evidence.\n',
  );
  await put(
    root,
    'pipeline/character/build.py',
    '# Fixture authoring source.\n',
  );
  await put(root, 'pipeline/character/motion-profiles.json', {
    squat: { clip: 'rep', contacts: ['left_foot'], regionVersion: '1.2.0' },
  });
  await put(root, 'packages/schemas/src/muscle-regions.json', {
    version: '1.2.0',
    regions: {},
  });
  await put(root, 'packages/data/src/exercises.json', [
    {
      id: 'squat',
      name: 'Squat',
      animation: {
        assetId: 'squat-v1',
        file: 'exercises/squat.glb',
        clip: 'rep',
        kind: 'repetition',
        loop: true,
      },
    },
  ]);
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const assets = [
    ['neutral-v1', 'characters/neutral-human.glb', glb(false)],
    ['squat-v1', 'exercises/squat.glb', glb(true)],
    ['thumbnail-v1', 'thumbnails/squat.png', png],
  ];
  for (const [, file, bytes] of assets)
    await put(root, `assets/${file}`, bytes);
  await put(root, 'docs/reviews/squat-contact-sheet.png', png);
  await put(root, 'assets/ASSET_LICENSES.json', {
    schemaVersion: '1.0.0',
    assets: assets.map(([assetId, file]) => ({
      assetId,
      file,
      origin: 'original',
      license: 'CC0-1.0',
      commercialUse: true,
      redistribution: true,
      status: 'needs-review',
    })),
  });
  await put(
    root,
    'packages/data/src/asset-review.json',
    assets.map(([assetId, file, bytes]) => ({
      assetId,
      file,
      status: 'needs-review',
      bytes: bytes.length,
      sha256: digest(bytes),
    })),
  );
  return root;
}

async function withFixture(action) {
  const root = await fixture();
  try {
    await action(root, await captureBaseline(root, revision));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function changeJson(root, file, mutate) {
  const value = JSON.parse(await readFile(join(root, file), 'utf8'));
  mutate(value);
  await put(root, file, value);
}

test('capture is deterministic and records file, permission, motion and rig facts', async () => {
  await withFixture(async (root, baseline) => {
    assert.equal(
      serializeBaseline(await captureBaseline(root, revision)),
      serializeBaseline(baseline),
    );
    assert.equal(baseline.counts.exercises, 1);
    assert.equal(baseline.counts.artifacts, 4);
    assert.equal(baseline.permissions.status['needs-review'], 3);
    assert.equal(baseline.exercises[0].animation.durationSeconds, 4);
    assert.deepEqual(baseline.rigs[0].joints, ['root', 'pelvis']);
    assert.equal(baseline.referenceMetrics.triangles, 1);
    await checkBaseline(root, baseline);
  });
});

test('default CLI check is read-only; capture is explicit and never overwrites', async () => {
  await withFixture(async (root, baseline) => {
    await run(process.execPath, [
      cli,
      '--root',
      root,
      '--capture',
      baselinePath,
      '--source-revision',
      revision,
    ]);
    const before = await readFile(join(root, baselinePath));
    const result = await run(process.execPath, [cli, '--root', root]);
    assert.match(result.stdout, /Preserved 1 v1 exercises and 4 artifacts/);
    assert.deepEqual(await readFile(join(root, baselinePath)), before);
    assert.equal(before.toString(), serializeBaseline(baseline));
    await assert.rejects(
      run(process.execPath, [
        cli,
        '--root',
        root,
        '--capture',
        baselinePath,
        '--source-revision',
        revision,
      ]),
      /EEXIST/,
    );
    assert.deepEqual(await readFile(join(root, baselinePath)), before);
    for (const args of [
      ['--capture'],
      ['--capture', 'new.json'],
      ['--unknown'],
      ['--check', '--check'],
      ['--source-revision', revision],
      ['--capture', 'new.json', '--source-revision', revision, '--check'],
      ['--capture', '../escape.json', '--source-revision', revision],
    ])
      await assert.rejects(
        run(process.execPath, [cli, '--root', root, ...args]),
      );
  });
});

test('changed or missing artifacts cannot be hidden by refreshed review hashes', async () => {
  await withFixture(async (root, baseline) => {
    const file = 'assets/exercises/squat.glb';
    const bytes = await readFile(join(root, file));
    bytes[bytes.length - 1] ^= 1;
    await put(root, file, bytes);
    await assert.rejects(
      checkBaseline(root, baseline),
      /Review identity mismatch/,
    );
    await changeJson(root, 'packages/data/src/asset-review.json', (records) => {
      records.find((record) => record.assetId === 'squat-v1').sha256 =
        digest(bytes);
    });
    await assert.rejects(
      checkBaseline(root, baseline),
      /Protected file changed/,
    );
    await rm(join(root, file));
    await assert.rejects(
      checkBaseline(root, baseline),
      /Review identity mismatch/,
    );
  });
});

test('diagnostic images and legacy source are independently frozen', async () => {
  for (const file of [
    'docs/reviews/squat-contact-sheet.png',
    'pipeline/character/build.py',
    'docs/architecture/skeleton.md',
  ])
    await withFixture(async (root, baseline) => {
      await put(root, file, 'changed');
      await assert.rejects(
        checkBaseline(root, baseline),
        /Protected file changed/,
      );
    });
});

test('registry semantics, permissions and region definitions remain frozen', async () => {
  for (const [file, mutate] of [
    [
      'packages/data/src/exercises.json',
      (records) => {
        records[0].name = 'Renamed exercise';
        records[0].animation.loop = false;
      },
    ],
    [
      'assets/ASSET_LICENSES.json',
      (manifest) => {
        manifest.assets[0].license = 'MIT';
      },
    ],
    [
      'packages/schemas/src/muscle-regions.json',
      (definition) => {
        definition.version = '1.9.0';
      },
    ],
    [
      'pipeline/character/motion-profiles.json',
      (profiles) => {
        profiles.squat.contacts = [];
      },
    ],
  ])
    await withFixture(async (root, baseline) => {
      await changeJson(root, file, mutate);
      await assert.rejects(
        checkBaseline(root, baseline),
        /Protected file changed/,
      );
    });
});

test('duplicate current identities and inconsistent review/provenance records fail', async () => {
  for (const [file, mutate, expected] of [
    [
      'packages/data/src/exercises.json',
      (records) => records.push(records[0]),
      /Duplicate exercise registry/,
    ],
    [
      'assets/ASSET_LICENSES.json',
      (manifest) => manifest.assets.push(manifest.assets[0]),
      /Duplicate provenance/,
    ],
    [
      'assets/ASSET_LICENSES.json',
      (manifest) => {
        manifest.assets[1].file = manifest.assets[0].file;
      },
      /Duplicate provenance file/,
    ],
    [
      'packages/data/src/asset-review.json',
      (records) => records.push(records[0]),
      /Duplicate review records/,
    ],
    [
      'packages/data/src/asset-review.json',
      (records) => {
        records[0].status = 'approved';
      },
      /Review identity mismatch/,
    ],
    [
      'pipeline/character/motion-profiles.json',
      (profiles) => {
        profiles.extra = profiles.squat;
      },
      /Motion profile identities mismatch/,
    ],
  ])
    await withFixture(async (root) => {
      await changeJson(root, file, mutate);
      await assert.rejects(captureBaseline(root, revision), expected);
    });
});

test('malformed baseline structure, metadata, ordering and traversal paths are rejected', async () => {
  await withFixture(async (_root, baseline) => {
    for (const mutate of [
      (value) => {
        value.schemaVersion = 'unknown';
      },
      (value) => {
        value.extra = true;
      },
      (value) => {
        value.sourceRevision = 'HEAD';
      },
      (value) => {
        value.files[0].sha256 = 'invalid';
      },
      (value) => {
        value.files[0].bytes = -1;
      },
      (value) => {
        value.files[0].extra = true;
      },
      (value) => {
        value.files.push(value.files[0]);
      },
      (value) => {
        value.files.reverse();
      },
      (value) => {
        value.counts.artifactBytes++;
      },
      (value) => {
        value.counts.glb++;
      },
      (value) => {
        value.exercises.push(value.exercises[0]);
      },
      (value) => {
        value.exercises[0].animation.durationSeconds = NaN;
      },
      (value) => {
        value.exercises[0].animation.kind = 'fake';
      },
      (value) => {
        value.permissions.status = { 'needs-review': 0 };
      },
      (value) => {
        value.rigs[0].joints = ['same', 'same'];
      },
      (value) => {
        value.regions[0].version = 'future';
      },
      (value) => {
        value.referenceMetrics.skinJointCounts = { invalid: 2 };
      },
    ]) {
      const changed = globalThis.structuredClone(baseline);
      mutate(changed);
      assert.throws(() => validateBaseline(changed));
    }
    for (const path of [
      '../escape',
      '/tmp/escape',
      'assets/../escape',
      'assets\\escape',
      'file://escape',
      'assets/%2e%2e/escape',
    ]) {
      const changed = globalThis.structuredClone(baseline);
      changed.files[0].path = path;
      assert.throws(() => validateBaseline(changed));
    }
  });
});

test('derived baseline claims are independently recomputed, not trusted', async () => {
  await withFixture(async (root, baseline) => {
    baseline.exercises[0].name = 'Forged name';
    await assert.rejects(
      checkBaseline(root, baseline),
      /Baseline semantics or derived inventory mismatch/,
    );
  });
});

test('non-regular files, leaf symlinks and symlink parents are rejected', async () => {
  await withFixture(async (root, baseline) => {
    await rm(join(root, '.nvmrc'));
    await mkdir(join(root, '.nvmrc'));
    await assert.rejects(
      checkBaseline(root, baseline),
      /Expected regular file/,
    );
  });
  await withFixture(async (root, baseline) => {
    await rename(
      join(root, 'assets/exercises/squat.glb'),
      join(root, 'actual.glb'),
    );
    await symlink(
      join(root, 'actual.glb'),
      join(root, 'assets/exercises/squat.glb'),
    );
    await assert.rejects(checkBaseline(root, baseline), /Symlink/);
  });
  await withFixture(async (root, baseline) => {
    await rename(
      join(root, 'assets/exercises'),
      join(root, 'actual-exercises'),
    );
    await symlink(
      join(root, 'actual-exercises'),
      join(root, 'assets/exercises'),
    );
    await assert.rejects(
      checkBaseline(root, baseline),
      /Unsafe protected directory/,
    );
  });
});

test('capture refuses symlink output parents and leaves destinations untouched', async () => {
  await withFixture(async (root) => {
    await mkdir(join(root, 'destination'));
    await symlink(join(root, 'destination'), join(root, 'linked'));
    await assert.rejects(
      run(process.execPath, [
        cli,
        '--root',
        root,
        '--capture',
        'linked/new.json',
        '--source-revision',
        revision,
      ]),
      /Unsafe capture directory/,
    );
    await assert.rejects(readFile(join(root, 'destination/new.json')), {
      code: 'ENOENT',
    });
  });
});

test('new files outside the frozen v1 scopes are allowed, additions within them are not', async () => {
  await withFixture(async (root, baseline) => {
    await put(root, 'pipeline/character-v2/character.blend', 'future source');
    await put(root, 'assets/v2/future.glb', 'future export');
    await checkBaseline(root, baseline);
    await put(root, 'docs/reviews/unexpected-v1.png', 'unexpected');
    await assert.rejects(
      checkBaseline(root, baseline),
      /Protected v1 inventory changed/,
    );
  });
});

test('malformed GLB timing is rejected even when mutable review hashes agree', async () => {
  await withFixture(async (root) => {
    const bytes = await readFile(join(root, 'assets/exercises/squat.glb'));
    bytes.writeFloatLE(NaN, 28 + bytes.readUInt32LE(12));
    await put(root, 'assets/exercises/squat.glb', bytes);
    await changeJson(root, 'packages/data/src/asset-review.json', (records) => {
      records.find((record) => record.assetId === 'squat-v1').sha256 =
        digest(bytes);
    });
    await assert.rejects(
      captureBaseline(root, revision),
      /Non-finite animation time/,
    );
  });
});
