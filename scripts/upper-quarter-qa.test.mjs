import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { readGlb, validateGlb } from './glb-qa.mjs';

function encode(document, source) {
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.concat([
    json,
    Buffer.alloc((4 - (json.length % 4)) % 4, 32),
  ]);
  const binary = source.subarray(20 + source.readUInt32LE(12));
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + padded.length + binary.length, 8);
  header.writeUInt32LE(padded.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, padded, binary]);
}

test('upper-quarter exported pilot passes versioned physical and articulation checks', async () => {
  for (const id of [
    'dumbbell-shoulder-press',
    'dumbbell-wrist-curl',
    'dumbbell-reverse-wrist-curl',
    'supine-serratus-punch',
  ])
    assert.equal((await validateGlb(`assets/exercises/${id}.glb`)).profile, id);
});

test('rejects missing girdle hierarchy, missing translation and frozen wrist motion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kimorel-upper-'));
  try {
    for (const [id, mutate, expected] of [
      [
        'supine-serratus-punch',
        (doc) => {
          doc.animations[0].channels = doc.animations[0].channels.filter(
            (c) =>
              !(
                doc.nodes[c.target.node].name === 'left_clavicle' &&
                c.target.path === 'translation'
              ),
          );
        },
        /Missing authored translation/,
      ],
      [
        'dumbbell-shoulder-press',
        (doc) => {
          doc.nodes.find((n) => n.name === 'left_clavicle').name =
            'broken_clavicle';
        },
        /shoulder-girdle hierarchy|Missing articulation/,
      ],
      [
        'dumbbell-wrist-curl',
        (doc) => {
          doc.animations[0].channels = doc.animations[0].channels.filter(
            (c) => doc.nodes[c.target.node].name !== 'left_hand',
          );
        },
        /Missing authored articulation/,
      ],
    ]) {
      const bytes = await readFile(`assets/exercises/${id}.glb`);
      const doc = readGlb(bytes);
      mutate(doc);
      const path = join(directory, 'bad.glb');
      await writeFile(path, encode(doc, bytes));
      await assert.rejects(() => validateGlb(path, 'rep', id), expected);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
