import definition from './muscle-regions-band.json' with { type: 'json' };
/** Stable surface labels, not activation measurements or anatomical segmentation. */
export const muscleRegionDefinition = definition;
export type MuscleRegion = keyof typeof definition.regions;
