import { expect, it } from 'vitest';
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { applyMuscleHighlights } from './highlights.js';
import { muscleRegionDefinition } from '@kimorel/core';
it('colors metadata primary and secondary regions differently and restores owned materials', () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    '_muscle_region',
    new BufferAttribute(
      new Uint16Array([
        muscleRegionDefinition.regions.chest.code,
        muscleRegionDefinition.regions.deltoids.code,
        0,
      ]),
      1,
    ),
  );
  const material = new MeshStandardMaterial({ color: '#789080' });
  const original = material.color.clone();
  const root = new Group();
  root.add(new Mesh(geometry, material));
  const muscles = {
    primary: ['pectoralis-major'] as const,
    secondary: ['deltoids'] as const,
  };
  applyMuscleHighlights(
    root,
    { primary: [...muscles.primary], secondary: [...muscles.secondary] },
    true,
  );
  const colors = geometry.getAttribute('color');
  expect(colors.getX(0)).not.toBe(colors.getX(1));
  expect(material.vertexColors).toBe(true);
  applyMuscleHighlights(root, { primary: [], secondary: [] }, false);
  expect(geometry.getAttribute('color')).toBe(colors);
  expect(material.vertexColors).toBe(false);
  expect(material.color.equals(original)).toBe(true);
  geometry.dispose();
  material.dispose();
});

it('highlights hip abductors without relabeling gluteus maximus', () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    '_muscle_region',
    new BufferAttribute(
      new Uint16Array([
        muscleRegionDefinition.regions['lateral-hip'].code,
        muscleRegionDefinition.regions.glutes.code,
      ]),
      1,
    ),
  );
  const material = new MeshStandardMaterial({ color: '#789080' });
  const root = new Group();
  root.add(new Mesh(geometry, material));
  applyMuscleHighlights(
    root,
    { primary: ['hip-abductors'], secondary: [] },
    true,
  );
  const colors = geometry.getAttribute('color');
  expect(colors.getX(0)).not.toBe(colors.getX(1));
  expect(muscleRegionDefinition.regions['lateral-hip'].muscles).toEqual([
    'hip-abductors',
  ]);
  geometry.dispose();
  material.dispose();
});

it('maps hip flexors to anterior hip instead of falsely relabeling quadriceps', () => {
  const definition = muscleRegionDefinition.regions['anterior-hip'];
  expect(definition.muscles).toEqual(['hip-flexors']);
  expect(definition.code).not.toBe(
    muscleRegionDefinition.regions.quadriceps.code,
  );
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    '_muscle_region',
    new BufferAttribute(
      new Uint16Array([
        definition.code,
        muscleRegionDefinition.regions.quadriceps.code,
      ]),
      1,
    ),
  );
  const material = new MeshStandardMaterial({ color: '#789080' });
  const root = new Group();
  root.add(new Mesh(geometry, material));
  applyMuscleHighlights(
    root,
    { primary: ['hip-flexors'], secondary: [] },
    true,
  );
  const colors = geometry.getAttribute('color');
  expect(colors.getX(0)).not.toBe(colors.getX(1));
  geometry.dispose();
  material.dispose();
});
