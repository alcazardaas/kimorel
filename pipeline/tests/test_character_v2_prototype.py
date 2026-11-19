"""Draft proportions and functional digit-chain tests, not anatomical approval."""
import importlib.util
import math
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('prototype', Path(__file__).parents[1] / 'character-v2/prototype_geometry.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class PrototypeTests(unittest.TestCase):
    def test_preserves_legacy_centers(self):
        points, _ = p.skeleton()
        reference = p.reference()
        self.assertGreater(reference['heightMeters'], 1.8)
        self.assertLess(reference['heightMeters'], 1.9)
        for key, value in reference['jointCentersMeters'].items():
            if key in points:
                self.assertEqual(tuple(value), points[key])

    def test_five_real_three_segment_digits_each_side(self):
        points, parents = p.skeleton()
        self.assertEqual(len(points), 50)
        for side in ('left', 'right'):
            for digit in ('index', 'middle', 'ring', 'little', 'thumb'):
                for i in range(1, 4):
                    key = f'{side}_{digit}_{i}'
                    self.assertEqual(parents[key], f'{side}_hand' if i == 1 else f'{side}_{digit}_{i - 1}')
                    self.assertTrue(all(math.isfinite(v) for v in points[key]))

    def test_hands_are_mirrored(self):
        points, _ = p.skeleton()
        for name, point in points.items():
            if name.startswith('left_'):
                other = points[name.replace('left_', 'right_', 1)]
                self.assertAlmostEqual(point[0], -other[0])
                self.assertAlmostEqual(point[1], other[1])
                self.assertAlmostEqual(point[2], other[2])

    def test_axis_roundtrip(self):
        point = (.2, 1.4, .17)
        self.assertEqual(p.gltf_point(p.blender_point(point)), point)

    def test_loft_closed_and_finite(self):
        vertices, faces = p.loft([(0, 0, 0), (0, 1, 0)], [.1, .08])
        edges = {}
        for face in faces:
            for a, b in zip(face, face[1:] + face[:1]):
                edge = tuple(sorted((a, b)))
                edges[edge] = edges.get(edge, 0) + 1
        self.assertTrue(all(count == 2 for count in edges.values()))
        self.assertTrue(all(math.isfinite(v) for point in vertices for v in point))
        with self.assertRaises(ValueError):
            p.unit((0, 0, 0))


if __name__ == '__main__':
    unittest.main()
