import { lstat } from 'node:fs/promises';

/** Require an actual file: directories and symlinks are not distributable assets. */
export async function validateAssetFile(root, file) {
  const stat = await lstat(new URL(file, root));
  if (!stat.isFile())
    throw new Error(`Asset must be a regular non-symlink file: ${file}`);
}
