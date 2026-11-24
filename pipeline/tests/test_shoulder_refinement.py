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


class CollarBoundary(unittest.TestCase):
    def test_positive_epsilon_retains_original_distribution_limit(self):
        original = [{'spine': 1.}]
        at_zero, _ = w.refine([(.13, 1.35, 0)], [set()], original)
        near, masks = w.refine([(.130000001, 1.35, 0)], [set()], original)
        self.assertGreater(masks[0], 0)
        self.assertEqual(at_zero[0], original[0])
        distance = sum(abs(near[0].get(name, 0)-original[0].get(name, 0)) for name in set(near[0]) | set(original[0]))
        self.assertLess(distance, 1e-10)


    def test_sparse_handoff_is_continuous_at_phases_and_never_exceeds_four(self):
        original = {'spine': .4, 'pelvis': .3, 'neck': .2, 'head': .1}
        target = {'chest': .1, 'left_clavicle': .2, 'left_upper_arm': .6, 'left_forearm': .1}
        for i in range(1001):
            weights = w.sparse_handoff(original, target, i/1000)
            self.assertLessEqual(len(weights), 4)
            self.assertTrue(all(0 < value <= 1 for value in weights.values()))
            self.assertAlmostEqual(sum(weights.values()), 1, places=12)
        self.assertEqual(w.sparse_handoff(original, target, 0), original)
        self.assertEqual(w.sparse_handoff(original, target, 1), target)
        for phase in (1/3, 2/3):
            a = w.sparse_handoff(original, target, phase-1e-8)
            b = w.sparse_handoff(original, target, phase+1e-8)
            self.assertLess(sum(abs(a.get(k, 0)-b.get(k, 0)) for k in set(a) | set(b)), 1e-10)

    def test_four_original_influences_survive_infinitesimal_support(self):
        original = {'spine': .4, 'pelvis': .3, 'neck': .2, 'head': .1}
        target = {'chest': .5, 'left_upper_arm': .5}
        near = w.sparse_handoff(original, target, 1e-8)
        self.assertEqual(set(near), set(original))
        self.assertLess(sum(abs(near[k]-original[k]) for k in original), 1e-12)


    def test_invalid_handoff_controls_fail_closed(self):
        for amount in (-.1, 1.1, float('nan')):
            with self.assertRaises(ValueError):
                w.sparse_handoff({'spine': 1.}, {'chest': 1.}, amount)
        with self.assertRaises(ValueError):
            w.sparse_handoff({'spine': .5}, {'chest': 1.}, .5)
