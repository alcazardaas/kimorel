import { z } from 'zod';

export const categories = [
  'gym',
  'home',
  'physiotherapy',
  'rehabilitation',
] as const;
export const muscles = [
  'quadriceps',
  'gluteus-maximus',
  'adductors',
  'erector-spinae',
  'pectoralis-major',
  'deltoids',
  'triceps',
  'biceps',
  'hamstrings',
  'calves',
  'abdominals',
  'latissimus-dorsi',
  'forearms',
  'upper-back',
  'hip-abductors',
] as const;
export const equipment = [
  'bodyweight',
  'dumbbell',
  'barbell',
  'weight-plate',
  'bench',
  'exercise-mat',
  'resistance-band',
  'box',
] as const;
export const cameraPresets = [
  'front',
  'side',
  'back',
  'three-quarter',
] as const;
export const assetStatuses = [
  'draft',
  'processing',
  'needs-review',
  'approved',
  'rejected',
] as const;
const text = z.string().trim().min(1);
const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const assetPathSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)+$/)
  .refine(
    (path) => !path.split('/').some((part) => part === '.' || part === '..'),
    'Path must be relative without traversal',
  );
export const animationSchema = z.strictObject({
  assetId: identifier,
  file: assetPathSchema.refine(
    (path) => path.endsWith('.glb'),
    'Expected a GLB file',
  ),
  clip: text,
  loop: z.boolean(),
  defaultPlaybackSpeed: z.number().positive().max(4),
});
export const exerciseSchema = z.strictObject({
  schemaVersion: z.literal('1.0.0'),
  id: identifier,
  slug: identifier,
  name: text,
  description: text,
  locale: z.literal('en'),
  example: z.boolean(),
  categories: z.array(z.enum(categories)).min(1),
  movementPattern: z.enum([
    'squat',
    'push',
    'pull',
    'hinge',
    'lunge',
    'carry',
    'rotation',
    'mobility',
    'isometric',
  ]),
  bodyRegions: z
    .array(z.enum(['upper-body', 'lower-body', 'core', 'full-body']))
    .min(1),
  equipment: z.array(z.enum(equipment)).min(1),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  laterality: z.enum(['bilateral', 'unilateral', 'alternating']),
  startingPosition: text,
  muscles: z.strictObject({
    primary: z.array(z.enum(muscles)).min(1),
    secondary: z.array(z.enum(muscles)),
  }),
  instructions: z.array(text).min(1),
  techniqueCues: z.array(text),
  commonMistakes: z.array(text),
  animation: animationSchema.nullable(),
  camera: z.strictObject({
    preset: z.enum(cameraPresets),
    target: z
      .tuple([z.number().finite(), z.number().finite(), z.number().finite()])
      .optional(),
    position: z
      .tuple([z.number().finite(), z.number().finite(), z.number().finite()])
      .optional(),
  }),
  review: z.strictObject({
    status: z.enum(['pending', 'approved', 'rejected']),
    clinicalReviewRequired: z.boolean(),
  }),
  license: z.literal('CC0-1.0'),
  provenance: z.strictObject({ creator: text, source: text }),
});
export const exerciseRegistrySchema = z
  .array(exerciseSchema)
  .superRefine((records, ctx) => {
    for (const key of ['id', 'slug'] as const) {
      const seen = new Set<string>();
      records.forEach((record, index) => {
        if (seen.has(record[key]))
          ctx.addIssue({
            code: 'custom',
            path: [index, key],
            message: `Duplicate ${key}`,
          });
        seen.add(record[key]);
      });
    }
  });
export const assetLicenseSchema = z
  .strictObject({
    assetId: identifier,
    file: assetPathSchema,
    origin: z.enum(['original', 'third-party']),
    sourceUrl: z.url().nullable(),
    creator: text,
    license: z.enum(['CC0-1.0', 'CC-BY-4.0', 'MIT']),
    licenseEvidenceUrl: z.url().nullable(),
    downloadDate: z.iso.date().nullable(),
    modifications: z.array(text),
    commercialUse: z.boolean(),
    redistribution: z.boolean(),
    attribution: z.string(),
    status: z.enum(assetStatuses),
    visualReview: z
      .strictObject({
        reviewer: text,
        date: z.iso.date(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        notes: text,
      })
      .optional(),
  })
  .superRefine((asset, ctx) => {
    if (asset.status !== 'approved') return;
    if (!asset.visualReview)
      ctx.addIssue({
        code: 'custom',
        message: 'Approved assets require a recorded human visual review',
      });
    if (!asset.commercialUse || !asset.redistribution)
      ctx.addIssue({
        code: 'custom',
        message:
          'Approved assets require commercial use and redistribution permission',
      });
    if (
      asset.origin === 'third-party' &&
      (!asset.sourceUrl || !asset.licenseEvidenceUrl || !asset.downloadDate)
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Approved third-party assets require source, license evidence and download date',
      });
    if (asset.license === 'CC-BY-4.0' && !asset.attribution.trim())
      ctx.addIssue({ code: 'custom', message: 'CC BY requires attribution' });
  });
export const assetManifestSchema = z
  .strictObject({
    schemaVersion: z.literal('1.0.0'),
    assets: z.array(assetLicenseSchema),
  })
  .superRefine(({ assets }, ctx) => {
    const seen = new Set<string>();
    assets.forEach((asset, index) => {
      if (seen.has(asset.assetId))
        ctx.addIssue({
          code: 'custom',
          path: ['assets', index, 'assetId'],
          message: 'Duplicate asset ID',
        });
      seen.add(asset.assetId);
    });
  });
export type Exercise = z.infer<typeof exerciseSchema>;
export type Animation = z.infer<typeof animationSchema>;
export type AssetLicense = z.infer<typeof assetLicenseSchema>;
export type Muscle = (typeof muscles)[number];
export type Equipment = (typeof equipment)[number];
export type CameraPreset = (typeof cameraPresets)[number];

export { muscleRegionDefinition } from './regions.js';
export type { MuscleRegion } from './regions.js';
