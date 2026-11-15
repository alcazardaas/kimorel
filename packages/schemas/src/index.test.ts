import { describe, expect, it } from 'vitest';
import {
  exerciseSchema,
  exerciseRegistrySchema,
  assetManifestSchema,
} from './index.js';
import { exercises } from '@kimorel/data';
const record = exercises[0]!;
describe('metadata validation', () => {
  it('accepts real animation metadata and metadata-only examples', () => {
    expect(exerciseSchema.parse(record).animation?.clip).toBe('rep');
    expect(
      exerciseSchema.parse({ ...record, animation: null, example: true })
        .animation,
    ).toBeNull();
  });
  it.each([
    { id: 'Invalid ID' },
    { schemaVersion: '2.0.0' },
    { instructions: [] },
    { muscles: { primary: ['unknown'], secondary: [] } },
    { equipment: ['unknown'] },
    { license: 'proprietary' },
    { camera: { preset: 'unknown' } },
    { review: { status: 'verified', clinicalReviewRequired: false } },
  ])('rejects invalid fields %j', (override) =>
    expect(exerciseSchema.safeParse({ ...record, ...override }).success).toBe(
      false,
    ),
  );
  it('rejects duplicate stable IDs and slugs', () =>
    expect(exerciseRegistrySchema.safeParse([record, record]).success).toBe(
      false,
    ));
  it('accepts an empty provenance registry', () =>
    expect(
      assetManifestSchema.safeParse({ schemaVersion: '1.0.0', assets: [] })
        .success,
    ).toBe(true));
  it('rejects approval without redistribution permission', () => {
    expect(
      assetManifestSchema.safeParse({
        schemaVersion: '1.0.0',
        assets: [
          {
            assetId: 'example',
            file: 'characters/example.glb',
            origin: 'third-party',
            sourceUrl: null,
            creator: 'Example',
            license: 'CC0-1.0',
            licenseEvidenceUrl: null,
            downloadDate: null,
            modifications: [],
            commercialUse: true,
            redistribution: false,
            attribution: '',
            status: 'approved',
          },
        ],
      }).success,
    ).toBe(false);
  });
});

it('requires a recorded human review before approving an asset', () => {
  const asset = {
    assetId: 'review-example',
    file: 'characters/review.glb',
    origin: 'original',
    sourceUrl: null,
    creator: 'Example',
    license: 'CC0-1.0',
    licenseEvidenceUrl: null,
    downloadDate: null,
    modifications: [],
    commercialUse: true,
    redistribution: true,
    attribution: '',
    status: 'approved',
  };
  expect(
    assetManifestSchema.safeParse({ schemaVersion: '1.0.0', assets: [asset] })
      .success,
  ).toBe(false);
  expect(
    assetManifestSchema.safeParse({
      schemaVersion: '1.0.0',
      assets: [
        {
          ...asset,
          visualReview: {
            reviewer: 'Human reviewer',
            date: '2026-11-13',
            sha256: 'a'.repeat(64),
            notes: 'Example review record for schema testing only.',
          },
        },
      ],
    }).success,
  ).toBe(true);
});

it('keeps broad region codes unique and source muscle references in the taxonomy', async () => {
  const { muscleRegionDefinition, muscles } = await import('./index.js');
  const regions = Object.values(muscleRegionDefinition.regions);
  expect(regions).toHaveLength(13);
  expect(new Set(regions.map((region) => region.code)).size).toBe(13);
  for (const region of regions)
    for (const muscle of region.muscles) expect(muscles).toContain(muscle);
});
