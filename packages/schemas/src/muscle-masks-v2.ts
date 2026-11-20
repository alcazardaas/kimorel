/** Sparse bind-space coverage weights, never measured muscle activation. */
import { z } from 'zod';
import { muscleSurfaceMappingV2Schema } from './muscles-v2.js';

const bindingSchema = muscleSurfaceMappingV2Schema.omit({ mask: true });
// Allocation safety only (4 MB dense weights); not a device performance budget.
export const maxMaskVertices = 1_000_000;
export const sparseMuscleMaskV1Schema = z
  .strictObject({
    schemaVersion: z.literal('kimorel.sparse-muscle-mask/v1'),
    status: z.literal('draft-needs-review'),
    purpose: z.enum(['authoring-proposal', 'non-anatomical-test-fixture']),
    anatomicalValidation: z.literal(false),
    binding: bindingSchema,
    weights: z
      .array(
        z.strictObject({
          vertexIndex: z.int().nonnegative(),
          weight: z
            .number()
            .finite()
            .gt(0)
            .max(1)
            .refine(
              (weight) => Math.fround(weight) > 0,
              'Weight must retain positive support in Float32',
            ),
        }),
      )
      .min(1),
  })
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: 'custom', message });
    if (value.binding.vertexCount > maxMaskVertices)
      issue('Mask exceeds dense allocation limit');
    const indices = new Set<number>();
    for (const entry of value.weights) {
      if (entry.vertexIndex >= value.binding.vertexCount)
        issue('Mask vertex index out of range');
      if (indices.has(entry.vertexIndex))
        issue('Duplicate sparse vertex index');
      indices.add(entry.vertexIndex);
    }
  });
export type SparseMuscleMaskV1 = z.infer<typeof sparseMuscleMaskV1Schema>;
type Mapping = z.infer<typeof muscleSurfaceMappingV2Schema>;

export function maskBinding(mapping: Mapping) {
  const { mask: _mask, ...binding } =
    muscleSurfaceMappingV2Schema.parse(mapping);
  void _mask; // The enclosing catalog owns the file hash, never the payload itself.
  // References are sets; canonical order does not change their meaning.
  return {
    ...binding,
    identityIds: [...binding.identityIds].sort(),
    sourceIds: [...binding.sourceIds].sort(),
  };
}
export function parseBoundSparseMask(value: unknown, mapping: Mapping) {
  const payload = sparseMuscleMaskV1Schema.parse(value);
  const expected = maskBinding(mapping);
  const actual = {
    ...payload.binding,
    identityIds: [...payload.binding.identityIds].sort(),
    sourceIds: [...payload.binding.sourceIds].sort(),
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error('Sparse mask binding mismatch');
  return payload;
}
export function serializeSparseMask(value: unknown): string {
  const parsed = sparseMuscleMaskV1Schema.parse(value);
  const binding = {
    ...parsed.binding,
    identityIds: [...parsed.binding.identityIds].sort(),
    sourceIds: [...parsed.binding.sourceIds].sort(),
  };
  return (
    JSON.stringify(
      {
        ...parsed,
        binding,
        weights: [...parsed.weights].sort(
          (a, b) => a.vertexIndex - b.vertexIndex,
        ),
      },
      null,
      2,
    ) + '\n'
  );
}
export function materializeSparseMask(value: unknown): Float32Array {
  const payload = sparseMuscleMaskV1Schema.parse(value);
  const dense = new Float32Array(payload.binding.vertexCount);
  for (const entry of payload.weights) dense[entry.vertexIndex] = entry.weight;
  return dense;
}
