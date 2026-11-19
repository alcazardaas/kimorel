"""Numerical checks independent of Blender and the exported GLB checks."""
import importlib.util
import math
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1] / 'character-v2'


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


w = load('deformation_weights')
g = load('prototype_geometry')


class DeformationWeights(unittest.TestCase):
    def test_segment_projection_and_endpoints(self):
        self.assertEqual(w.segment_distance((.5, 1, 0), (0, 0, 0), (1, 0, 0)), 1)
        self.assertEqual(w.segment_distance((2, 0, 0), (0, 0, 0), (1, 0, 0)), 1)
        with self.assertRaises(ValueError):
            w.segment_distance((0, 0, 0), (0, 0, 0), (0, 0, 0))

    def test_smooth_region_transition(self):
        self.assertEqual(w.smoothstep(0, 1, -1), 0)
        self.assertEqual(w.smoothstep(0, 1, 2), 1)
        self.assertAlmostEqual(w.smoothstep(0, 1, .5), .5)
        self.assertLess(abs(w.smoothstep(0, 1, .501) - w.smoothstep(0, 1, .499)), .004)

    def test_normalization_and_bounded_influences(self):
        segments = {str(i): ((i * .01, 0, 0), (i * .01, 1, 0)) for i in range(8)}
        result = w.normalized_weights((0, .5, 0), segments, dict.fromkeys(segments, 1))
        self.assertEqual(len(result), 4)
        self.assertAlmostEqual(sum(result.values()), 1)
        self.assertTrue(all(0 < v <= 1 for v in result.values()))
        with self.assertRaises(ValueError):
            w.normalized_weights((math.nan, 0, 0), segments, dict.fromkeys(segments, 1))

    def test_lateral_hand_and_thigh_are_distinct(self):
        points, _ = g.skeleton()
        hand = w.regional_priors(g.add(points['left_hand'], (.025, -.06, 0)), points)
        thigh = w.regional_priors((.145, .85, 0), points)
        self.assertGreater(hand['left_index_1'], .5)
        self.assertEqual(thigh['left_index_1'], 0)
        self.assertGreater(thigh['left_thigh'], .9)

    def test_region_symmetry(self):
        points, _ = g.skeleton()
        left = w.regional_priors((.3, 1.3, .02), points)
        right = w.regional_priors((-.3, 1.3, .02), points)
        for name, value in left.items():
            self.assertAlmostEqual(value, right.get(name.replace('left_', 'right_'), value))

    def test_thigh_surface_cannot_receive_arm_priors(self):
        points, _ = g.skeleton()
        for x in (.10, .145, .20, .24):
            for y in (.65, .85, .96):
                priors = w.regional_priors((x, y, 0), points)
                self.assertEqual(priors['left_forearm'], 0)
                self.assertEqual(priors['left_index_1'], 0)

    def test_midshaft_digit_radii_leave_engineering_gap(self):
        points, _ = g.skeleton()
        for side in ('left', 'right'):
            layout = g.hand_layout(side, points[side + '_hand'], points[side + '_forearm'])
            radius = w.digit_radius_limit(layout['chains'])
            self.assertGreater(radius, .002)
            for a, b in zip(('index', 'middle', 'ring'), ('middle', 'ring', 'little')):
                for station in (1, 2):
                    self.assertGreaterEqual(math.dist(layout['chains'][a][station], layout['chains'][b][station]) - 2 * radius, .004 - 1e-10)
