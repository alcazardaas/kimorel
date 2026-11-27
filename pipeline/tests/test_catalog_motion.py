"""Canonical coverage and cached-input guards; no Blender process or TDD claim."""
import importlib.util
import math
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).resolve().parents[1] / 'character-v2'
spec = importlib.util.spec_from_file_location('catalog_motion_tests', HERE / 'catalog_motion.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


class CatalogMotion(unittest.TestCase):
    def test_all_100_ids_have_canonical_source_and_distinct_migration_status(self):
        rows = c.inventory()
        self.assertEqual(len(rows), 100)
        self.assertEqual(len({row['id'] for row in rows}), 100)
        self.assertEqual(sum(row['kind'] == 'hold' for row in rows), 8)
        self.assertEqual(sum(row['status'] == 'existing-pilot' for row in rows), 3)
        self.assertTrue(all(not row['humanApproval'] and not row['anatomicalValidation'] for row in rows))
        for row in rows:
            self.assertEqual(row['clip'], 'hold' if row['kind'] == 'hold' else 'rep')
            self.assertIn(row['batch'], ['CV2-09ALL-0' + str(n) for n in range(1, 6)])
            for time in (0., 1., 2., 3., 4.):
                joints = c.canonical(row['id'], time)
                self.assertIn(len(joints), (18, 20))
                self.assertTrue(all(math.isfinite(value) for joint in joints.values() for vector in joint.values() for value in vector))

    def test_next_three_have_real_motion_loop_and_121_samples(self):
        for exercise in c.FIRST:
            frames = c.frames(exercise)
            self.assertEqual(len(frames), 121)
            self.assertEqual(frames[0]['time'], 0)
            self.assertEqual(frames[-1]['time'], 4)
            movement = 0.
            for name, start in frames[0]['joints'].items():
                self.assertLess(math.dist(start['position'], frames[-1]['joints'][name]['position']), 1e-8)
                movement = max(movement, max(math.dist(start['position'], frame['joints'][name]['position']) for frame in frames))
            self.assertGreater(movement, .01)
            self.assertTrue(all(0 <= value <= 1 for frame in frames for value in frame['morphWeights'].values()))
        self.assertEqual(set(c.frames('standing-calf-raise')[0]['markers']), {'left_forefoot', 'right_forefoot'})
        self.assertEqual(c.frames('reverse-lunge')[0]['markers'], {})

    def test_all_frozen_and_cached_inputs_are_hash_verified(self):
        self.assertEqual(len(c.input_contract()), 460)

    def test_invalid_id_time_and_unsafe_or_corrupt_input_rejected(self):
        for exercise, time in [('missing', 0), (c.FIRST[0], math.nan), (c.FIRST[0], -1), (c.FIRST[0], 4.1)]:
            with self.assertRaises(ValueError):
                c.canonical(exercise, time)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'body.blend'
            path.write_bytes(b'original')
            expected = {'body.blend': c.digest(path)}
            c.verify_hashes(root, expected)
            path.write_bytes(b'corrupt')
            with self.assertRaisesRegex(ValueError, 'Immutable input changed'):
                c.verify_hashes(root, expected)
            (root / 'link').symlink_to(path)
            for value in ('../body.blend', '/body.blend', 'link', './body.blend'):
                with self.assertRaises(ValueError):
                    c.checked_file(root, value)


class GroinCollar(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.g = c.load('groin_weights')

    def test_continuous_cross_midline_field_and_exact_exterior(self):
        left = {'left_thigh': .93, 'left_shin': .06, 'pelvis': .01}
        right = {'right_thigh': .93, 'right_shin': .06, 'pelvis': .01}
        a = self.g.derive((-.000001, .85, 0), right)
        b = self.g.derive((.000001, .85, 0), left)
        self.assertLess(sum(abs(a.get(n, 0)-b.get(n, 0)) for n in set(a)|set(b)), .00001)
        for point in ((.18, .85, 0), (0, .65, 0), (0, 1.10, 0), (0, .85, .23), (0, 1.5, 0)):
            self.assertEqual(self.g.derive(point, left), left)
        for x in (-.17, -.1, -.025, 0, .025, .1, .17):
            value = self.g.derive((x, .85, 0), left)
            self.assertLessEqual(len(value), 4)
            self.assertAlmostEqual(sum(value.values()), 1)
            self.assertTrue(all(weight > 0 for weight in value.values()))
            self.assertEqual(self.g.derive((x, .85, 0), left, value), value)
        with self.assertRaisesRegex(ValueError, 'pinned reference'):
            self.g.derive((0, .85, 0), right, left)
        with self.assertRaises(ValueError):
            self.g.derive((math.nan, .85, 0), right)

    def test_every_boundary_edge_is_reported_not_just_worst_pair(self):
        points = [(0, .85, 0), (.179, .85, 0), (.181, .85, 0), (0, .64, 0)]
        edges = [(0, 1), (1, 2), (0, 3)]
        original = [{'right_thigh': 1.}, {'left_thigh': 1.}, {'left_thigh': 1.}, {'pelvis': 1.}]
        values, report = self.g.field(points, edges, original)
        self.assertEqual(len(report['boundaryEdges']), 2)
        self.assertEqual(values[2:], original[2:])
        self.assertEqual(report['changedVertices'], 2)


if __name__ == '__main__':
    unittest.main()
