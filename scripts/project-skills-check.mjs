import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const folder = '.agents/skills';
const manifestPath = `${folder}/manifest.json`;
const sections = [
  'Activation Contract',
  'Hard Rules',
  'Decision Gates',
  'Execution Steps',
  'Output Contract',
  'References',
];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function regular(root, path) {
  assert.match(path, /^[\w.-]+(?:\/[\w.-]+)*$/, 'Unsafe skill path');
  assert(
    !path.split('/').some((p) => p === '.' || p === '..'),
    'Unsafe skill path',
  );
  let current = root;
  for (const [index, part] of path.split('/').entries()) {
    current = join(current, part);
    const stat = await lstat(current);
    assert(!stat.isSymbolicLink(), `Symlink: ${path}`);
    assert(
      index === path.split('/').length - 1 ? stat.isFile() : stat.isDirectory(),
    );
    if (index === path.split('/').length - 1)
      assert.equal(stat.mode & 0o111, 0, `Executable skill file: ${path}`);
  }
  return readFile(current);
}

async function inventory(root, path = folder) {
  const stat = await lstat(join(root, path));
  assert(
    stat.isDirectory() && !stat.isSymbolicLink(),
    `Unsafe directory: ${path}`,
  );
  const files = [];
  for (const entry of await readdir(join(root, path), {
    withFileTypes: true,
  })) {
    const child = `${path}/${entry.name}`;
    assert(!entry.isSymbolicLink(), `Symlink: ${child}`);
    if (entry.isDirectory()) files.push(...(await inventory(root, child)));
    else {
      assert(entry.isFile(), `Non-regular skill file: ${child}`);
      files.push(child);
    }
  }
  return files.sort();
}

export async function checkProjectSkills(root) {
  const manifest = JSON.parse(await regular(root, manifestPath));
  assert.equal(manifest.schemaVersion, 1);
  assert(Array.isArray(manifest.skills) && manifest.skills.length > 0);
  assert.equal(
    new Set(manifest.skills).size,
    manifest.skills.length,
    'Duplicate skills',
  );
  assert(
    Object.hasOwn(manifest.files, 'AGENTS.md'),
    'Missing AGENTS routing hash',
  );
  assert.match(
    manifest.files['AGENTS.md'],
    /^[a-f0-9]{64}$/,
    'Invalid AGENTS routing hash',
  );
  const expected = Object.keys(manifest.files).sort();
  assert.deepEqual(
    (await inventory(root)).filter((p) => p !== manifestPath),
    expected.filter((p) => p.startsWith(`${folder}/`)),
    'Unexpected or missing skill files',
  );
  for (const path of expected) {
    assert(
      path === 'AGENTS.md' || path.startsWith(`${folder}/`),
      'Unscoped manifest path',
    );
    assert.match(manifest.files[path], /^[a-f0-9]{64}$/);
    assert.equal(
      digest(await regular(root, path)),
      manifest.files[path],
      `Hash mismatch: ${path}`,
    );
    assert(/\.(?:md|txt|json)$/.test(path), 'Non-document file in skills');
  }
  const agents = (await regular(root, 'AGENTS.md')).toString();
  for (const name of manifest.skills) {
    assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const path = `${folder}/${name}/SKILL.md`;
    const text = (await regular(root, path)).toString();
    assert(agents.includes(path), `Unregistered skill: ${name}`);
    assert(
      text.startsWith(`---\nname: ${name}\n`),
      `Invalid frontmatter: ${name}`,
    );
    const description = text.match(
      /^description: (['"])(Trigger: [^\n]+)\1$/m,
    )?.[2];
    assert(
      description && description.length <= 250,
      `Invalid description: ${name}`,
    );
    assert(/^license: MIT$/m.test(text));
    assert(
      /^metadata:\n {2}author: (['"])[^\n]+\1\n {2}version: (['"])[^\n]+\2\n---/m.test(
        text,
      ),
    );
    let previous = -1;
    for (const section of sections) {
      const position = text.indexOf(`\n## ${section}\n`);
      assert(
        position > previous,
        `Missing/unordered section: ${name}/${section}`,
      );
      previous = position;
    }
    assert(text.split(/\s+/).length < 700, `Oversized skill: ${name}`);
    for (const [, link] of text.matchAll(/\]\(([^)]+)\)/g)) {
      assert(!/^[a-z]+:/i.test(link), `Nonlocal reference: ${name}`);
      const target = resolve(root, dirname(path), link);
      assert(
        target.startsWith(`${resolve(root, folder)}/`),
        'Escaping skill reference',
      );
      const relative = target.slice(resolve(root).length + 1);
      assert(
        Object.hasOwn(manifest.files, relative),
        `Untracked reference: ${link}`,
      );
      await regular(root, relative);
    }
  }
  assert.equal(
    new Set(manifest.sources.map((s) => s.skill)).size,
    manifest.sources.length,
  );
  assert.deepEqual(
    manifest.sources.map((s) => s.skill).sort(),
    manifest.skills.filter((s) => s !== 'kimorel-character-pipeline').sort(),
    'Missing upstream provenance',
  );
  for (const source of manifest.sources) {
    assert(manifest.skills.includes(source.skill));
    assert.match(source.repository, /^[\w.-]+\/[\w.-]+$/);
    assert.match(source.commit, /^[a-f0-9]{40}$/);
    assert.equal(source.license, 'MIT');
    assert(
      Object.hasOwn(manifest.files, source.licenseEvidence),
      'Missing license evidence',
    );
    assert(Array.isArray(source.files) && source.files.length > 0);
    for (const file of source.files) {
      assert(Object.hasOwn(manifest.files, file.path), 'Untracked source file');
      assert(
        typeof file.sha256 === 'string' && /^[a-f0-9]{64}$/.test(file.sha256),
        'Invalid source digest',
      );
      assert.equal(
        file.sha256,
        manifest.files[file.path],
        'Source/local hash mismatch',
      );
      assert.match(file.upstreamPath, /^[\w.-]+(?:\/[\w.-]+)*$/);
      assert(
        !file.upstreamPath.split('/').some((p) => p === '.' || p === '..'),
      );
    }
  }
  return {
    skills: manifest.skills.length,
    files: expected.length,
    sources: manifest.sources.length,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    console.log(
      JSON.stringify(
        await checkProjectSkills(
          resolve(dirname(fileURLToPath(import.meta.url)), '..'),
        ),
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
