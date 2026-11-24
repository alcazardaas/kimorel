"""Local weight support and normalization; no anatomical acceptance."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('shoulder_weights', Path(__file__).parents[1]/'character-v2/shoulder_weights.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)


class ShoulderWeights(unittest.TestCase):
    def test_remote_unchanged_and_local_four_unit_influences(self):
        points = [(0., .5, 0), (.23, 1.35, 0), (.24, 1.35, 0)]
        original = [{'pelvis': 1.}, {'spine': .6, 'left_upper_arm': .4}, {'chest': 1.}]
        result, masks = w.refine(points, [set(), {2}, {1}], original)
        self.assertEqual(result[0], original[0])
        self.assertEqual(masks[0], 0)
        self.assertGreater(result[2]['left_upper_arm'], 0)
        for weights in result:
            self.assertLessEqual(len(weights), 4)
            self.assertAlmostEqual(sum(weights.values()), 1)
            self.assertTrue(all(v > 0 for v in weights.values()))

    def test_support_mirrors_and_fades_at_bounds(self):
        self.assertEqual(w.support((.23, 1.35, .02)), w.support((-.23, 1.35, .02)))
        self.assertEqual(w.support((.1, 1.35, 0)), 0)
        self.assertEqual(w.support((.3, .9, 0)), 0)
        self.assertGreater(w.support((.17, 1.35, 0)), w.support((.14, 1.35, 0)))

    def test_invalid_controls(self):
        with self.assertRaises(ValueError):
            w.refine([], [], [], iterations=0)
        with self.assertRaises(ValueError):
            w.refine([(0, 0, 0)], [], [])
