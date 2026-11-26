import type { Exercise } from '@kimorel/core';

/** Exact, engineering-verified exports; not anatomical or clinical approval. */
export const pilotAssets: Readonly<Record<string, { sha256: string }>> = {
  'bodyweight-squat': {
    sha256: 'aa4d75481e1681078b6ba0122d2962937dc1b8515653091f4650c3f58f3b89c4',
  },
  'push-up': {
    sha256: '96b075f4a9868b8ea6e1d74cd2db347138f1363363d4953f98107d6f48170484',
  },
  'dumbbell-shoulder-press': {
    sha256: '1013c7f16017c34e50df2288291b4458f9d91f171d62cd6649f4434dcc614c42',
  },
};

export function pilotExercise(exercise: Exercise): Exercise | undefined {
  if (!Object.hasOwn(pilotAssets, exercise.id) || !exercise.animation)
    return undefined;
  return {
    ...exercise,
    animation: {
      ...exercise.animation,
      assetId: `character-v2-${exercise.id}-pilot`,
      kind: 'repetition',
      file: `character-v2/${exercise.id}.glb`,
      clip: 'rep',
    },
  };
}
