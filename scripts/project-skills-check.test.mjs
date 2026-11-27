import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { promisify } from 'node:util';
import { checkProjectSkills } from './project-skills-check.mjs';

const source = new URL('../', import.meta.url);
const manifestPath = '.agents/skills/manifest.json';

async function fixture(t, prefix = 'kimorel-skills-') {
  const root = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(new URL('.agents', source), join(root, '.agents'), {
    recursive: true,
  });
  await cp(new URL('AGENTS.md', source), join(root, 'AGENTS.md'));
  return root;
}

async function editManifest(root, edit) {
  const file = join(root, manifestPath);
  const manifest = JSON.parse(await readFile(file));
  edit(manifest);
  await writeFile(file, JSON.stringify(manifest));
}

test('actual installed skills pass offline integrity and structure checks', async () => {
  const result = await checkProjectSkills(fileURLToPath(source));
  assert.equal(result.skills, 7);
  assert.equal(result.sources, 6);
});

test('changed skill bytes fail without refreshing hashes', async (t) => {
  const root = await fixture(t);
  await writeFile(
    join(root, '.agents/skills/threejs-animation/SKILL.md'),
    'changed',
  );
  await assert.rejects(checkProjectSkills(root), /Hash mismatch/);
});

test('missing and unexpected files fail inventory checks', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, '.agents/skills/unreviewed.py'), 'do not run');
  await assert.rejects(checkProjectSkills(root), /Unexpected or missing/);
  await rm(join(root, '.agents/skills/unreviewed.py'));
  await rm(join(root, '.agents/skills/threejs-animation/SKILL.md'));
  await assert.rejects(checkProjectSkills(root), /Unexpected or missing/);
});

test('symlinked reference files are rejected', async (t) => {
  const root = await fixture(t);
  const file = join(root, '.agents/skills/_sources/threejs-animation.txt');
  await rm(file);
  await symlink(join(root, 'AGENTS.md'), file);
  await assert.rejects(checkProjectSkills(root), /Symlink/);
});

test('escaping manifest paths are rejected before file access', async (t) => {
  const root = await fixture(t);
  await editManifest(root, (m) => {
    m.files['../outside'] = '0'.repeat(64);
  });
  await assert.rejects(checkProjectSkills(root), /Unscoped manifest path/);
});

test('invalid source pins and inconsistent source hashes fail', async (t) => {
  const root = await fixture(t);
  await editManifest(root, (m) => {
    m.sources[0].commit = 'main';
  });
  await assert.rejects(checkProjectSkills(root));
  await cp(new URL(manifestPath, source), join(root, manifestPath));
  await editManifest(root, (m) => {
    m.sources[0].files[0].sha256 = '0'.repeat(64);
  });
  await assert.rejects(checkProjectSkills(root), /Source\/local hash mismatch/);
});

test('removed routing registration fails even with updated AGENTS hash', async (t) => {
  const root = await fixture(t);
  const { createHash } = await import('node:crypto');
  await writeFile(join(root, 'AGENTS.md'), 'no skill registration');
  await editManifest(root, (m) => {
    m.files['AGENTS.md'] = createHash('sha256')
      .update('no skill registration')
      .digest('hex');
  });
  await assert.rejects(checkProjectSkills(root), /Unregistered skill/);
});

test('executable permissions are rejected even when bytes match', async (t) => {
  const root = await fixture(t);
  await chmod(
    join(root, '.agents/skills/_sources/threejs-animation.txt'),
    0o755,
  );
  await assert.rejects(checkProjectSkills(root), /Executable skill file/);
});

test('missing provenance cannot be hidden by dropping the source record', async (t) => {
  const root = await fixture(t);
  await editManifest(root, (m) => {
    m.sources.pop();
  });
  await assert.rejects(checkProjectSkills(root), /Missing upstream provenance/);
});

test('skill structure is checked independently of content hashes', async (t) => {
  const root = await fixture(t);
  const path = '.agents/skills/threejs-animation/SKILL.md';
  const content = (await readFile(join(root, path), 'utf8')).replace(
    '## Hard Rules',
    '## Notes',
  );
  const { createHash } = await import('node:crypto');
  await writeFile(join(root, path), content);
  await editManifest(root, (m) => {
    m.files[path] = createHash('sha256').update(content).digest('hex');
  });
  await assert.rejects(checkProjectSkills(root), /Missing\/unordered section/);
});

test('external instruction references fail even with updated file hashes', async (t) => {
  const root = await fixture(t);
  const path = '.agents/skills/threejs-animation/SKILL.md';
  const content = (await readFile(join(root, path), 'utf8')).replace(
    '../README.md',
    'https://example.invalid/instructions',
  );
  const { createHash } = await import('node:crypto');
  await writeFile(join(root, path), content);
  await editManifest(root, (m) => {
    m.files[path] = createHash('sha256').update(content).digest('hex');
  });
  await assert.rejects(checkProjectSkills(root), /Nonlocal reference/);
});

test('source records need an inventoried path and a valid SHA-256 digest', async (t) => {
  const unknownPath = '.agents/skills/_sources/not-in-inventory.txt';
  for (const mutate of [
    (file) => {
      file.path = unknownPath;
      delete file.sha256;
    },
    (file) => {
      file.path = unknownPath;
    },
    (file) => {
      delete file.sha256;
    },
    (file) => {
      file.sha256 = 'not-a-digest';
    },
  ]) {
    const root = await fixture(t);
    await editManifest(root, (m) => {
      mutate(m.sources[0].files[0]);
    });
    await assert.rejects(
      checkProjectSkills(root),
      /Untracked source file|Invalid source digest/,
    );
  }
});

test('AGENTS routing must have its own valid integrity entry', async (t) => {
  for (const mutate of [
    (files) => {
      delete files['AGENTS.md'];
    },
    (files) => {
      files['AGENTS.md'] = 'not-a-digest';
    },
  ]) {
    const root = await fixture(t);
    await editManifest(root, (m) => {
      mutate(m.files);
    });
    await assert.rejects(
      checkProjectSkills(root),
      /(?:Missing|Invalid) AGENTS routing hash/,
    );
  }
});

test('installed-skill test works from a checkout containing spaces', async (t) => {
  const root = await fixture(t, 'kimorel skills ');
  await mkdir(join(root, 'scripts'));
  for (const name of [
    'project-skills-check.mjs',
    'project-skills-check.test.mjs',
  ])
    await cp(new URL(`scripts/${name}`, source), join(root, 'scripts', name));
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      '--test',
      '--test-reporter=tap',
      '--test-name-pattern=^actual installed skills',
      'scripts/project-skills-check.test.mjs',
    ],
    { cwd: root, env },
  );
  assert.match(stdout, /actual installed skills/);
});
