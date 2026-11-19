"""Pure numerical invariants for bounded engineering shape proposals."""
import importlib.util
import math
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('corrective_geometry', Path(__file__).resolve().parents[1] / 'character-v2/corrective_geometry.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


class CorrectiveGeometry(unittest.TestCase):
    def test_compact_mask_has_exact_remote_zero(self):
        self.assertEqual(c.mask((0, 0, 0), [(0, 0, 0)], .2), 1)
        self.assertEqual(c.mask((.2, 0, 0), [(0, 0, 0)], .2), 0)
        self.assertEqual(c.mask((.21, 0, 0), [(0, 0, 0)], .2), 0)
        self.assertAlmostEqual(c.mask((.1, 0, 0), [(0, 0, 0)], .2), .5625)

    def test_angle_curve_is_bounded_and_neutral(self):
        self.assertEqual(c.activation(0, 20, 55), 0)
        self.assertEqual(c.activation(20, 20, 55), 0)
        self.assertEqual(c.activation(55, 20, 55), 1)
        self.assertEqual(c.activation(-55, 20, 55), 1)
        self.assertAlmostEqual(c.activation(37.5, 20, 55), .5)
        with self.assertRaises(ValueError):
            c.activation(20, 55, 20)

    def test_relaxation_reduces_spike_but_keeps_remote_vertices_exact(self):
        points = [(0, 0, 0), (1, 0, 0), (.5, 1, 0)]
        result = c.relax(points, [{1, 2}, {0, 2}, {0, 1}], [0, 0, 1], 10, .5, .2)
        self.assertEqual(result[:2], points[:2])
        self.assertAlmostEqual(math.dist(result[2], points[2]), .2)
        self.assertLess(result[2][1], 1)

    def test_displacement_limits_and_nonfinite_rejection(self):
        self.assertEqual(c.bounded((0, 0, 0), .1), (0, 0, 0))
        self.assertAlmostEqual(math.dist(c.bounded((3, 4, 0), .1), (0, 0, 0)), .1)
        with self.assertRaises(ValueError):
            c.bounded((math.nan, 0, 0), .1)

    def test_proposed_support_does_not_reach_remote_contacts(self):
        for y in (.10, .51):
            self.assertEqual(c.mask((.145, y, .02), [(.145, .94, 0)], .20), 0)
        self.assertEqual(c.mask((.43, .94, 0), [(.22, 1.43, 0)], .21), 0)
