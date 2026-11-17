import type { Exercise, Equipment, Muscle } from '@kimorel/schemas';
export type {
  Exercise,
  Animation,
  AssetLicense,
  Muscle,
  Equipment,
  CameraPreset,
} from '@kimorel/schemas';
export {
  categories,
  muscles,
  equipment,
  cameraPresets,
} from '@kimorel/schemas';

export function findExercise(
  exercises: readonly Exercise[],
  id: string,
): Exercise | undefined {
  return exercises.find((exercise) => exercise.id === id);
}
export interface ExerciseFilter {
  nameQuery?: string;
  category?: Exercise['categories'][number];
  equipment?: Equipment;
  muscle?: Muscle;
}
export function filterExercises(
  exercises: readonly Exercise[],
  filter: ExerciseFilter,
): Exercise[] {
  const nameQuery = filter.nameQuery?.trim().toLowerCase();
  return exercises.filter(
    (exercise) =>
      (!nameQuery || exercise.name.toLowerCase().includes(nameQuery)) &&
      (!filter.category || exercise.categories.includes(filter.category)) &&
      (!filter.equipment || exercise.equipment.includes(filter.equipment)) &&
      (!filter.muscle ||
        [...exercise.muscles.primary, ...exercise.muscles.secondary].includes(
          filter.muscle,
        )),
  );
}
/** Resolve a validated relative asset path beneath a self-hosted HTTP(S) base. */
export function resolveAssetUrl(baseUrl: string, file: string): string {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol))
    throw new Error('Asset base must use HTTP(S)');
  if (
    !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)+$/.test(file) ||
    file.split('/').some((part) => part === '.' || part === '..')
  )
    throw new Error('Asset file must be a safe relative path');
  base.search = '';
  base.hash = '';
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return new URL(file, base).href;
}

export { muscleRegionDefinition } from '@kimorel/schemas';
export type { MuscleRegion } from '@kimorel/schemas';
