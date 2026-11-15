"""Dependency-free regression tests also discoverable by pytest."""
import importlib.util
import math
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('character', Path(__file__).parents[1]/'character/build.py')
character = importlib.util.module_from_spec(spec)
spec.loader.exec_module(character)


class CharacterTests(unittest.TestCase):
    def test_skeleton_is_parent_first(self):
        names = set()
        for index, (name, parent, point) in enumerate(character.BONES):
            self.assertNotIn(name, names)
            names.add(name)
            self.assertTrue(parent is None or parent < index)
            self.assertTrue(all(math.isfinite(value) for value in point))

    def test_motion_loops(self):
        self.assertEqual(character.pose(0), character.pose(4))
        self.assertLess(character.pose(2)[1][0][1], character.pose(0)[1][0][1])

    def test_skin_weights_normalized(self):
        for point in [(0,1.3,0),(.14,.5,0),(-.4,1,0),(0,1.7,0)]:
            joints, weights = character.weights(point)
            self.assertEqual(len(joints),4)
            self.assertAlmostEqual(sum(weights),1)
            self.assertTrue(all(0 <= joint < len(character.BONES) for joint in joints))




class MotionTests(unittest.TestCase):
    def test_all_original_clips_loop_on_same_rig(self):
        EXERCISES,motion_pose = character.motions.EXERCISES,character.motions.motion_pose
        for exercise in EXERCISES:
            self.assertEqual(motion_pose(character.BONES,0,exercise,character.pose),
                             motion_pose(character.BONES,4,exercise,character.pose))

    def test_push_up_contacts_and_straight_trunk(self):
        motion_pose,forward = character.motions.motion_pose,character.motions.forward
        baseline = None
        for t in [0,1,2,3,4]:
            world,_ = forward(character.BONES,motion_pose(character.BONES,t,'push-up',character.pose))
            contacts = [world[j] for j in [8,11,14,17]]
            if baseline is None:
                baseline = contacts
            for actual,expected in zip(contacts,baseline):
                self.assertLess(character.length(character.sub(actual,expected)),.00001)
            # No spine curl: neck and torso inherit one rigid trunk orientation.
            self.assertGreater(world[5][2],world[1][2])

    def test_curl_has_elbow_motion_without_shoulder_swing(self):
        motion_pose = character.motions.motion_pose
        top = motion_pose(character.BONES,2,'dumbbell-biceps-curl',character.pose)
        bottom = motion_pose(character.BONES,0,'dumbbell-biceps-curl',character.pose)
        self.assertEqual(top[12],bottom[12])
        self.assertNotEqual(top[13],bottom[13])


class MuscleRegionTests(unittest.TestCase):
    def test_region_codes_are_unique_and_broad_regions_are_present(self):
        regions = character.REGION_DEFINITION['regions']
        self.assertEqual(len(regions), 13)
        self.assertEqual(len({r['code'] for r in regions.values()}), 13)
        self.assertEqual(character.muscle_region((.22, .98, 0)), regions['lateral-hip']['code'])
        self.assertEqual(character.muscle_region((0, 1.4, .1)), regions['chest']['code'])
        self.assertEqual(character.muscle_region((0, 1.7, 0)), 0)

    def test_unmapped_hands_do_not_claim_activation(self):
        self.assertEqual(character.muscle_region((.45, .88, .005)), 0)



class ExpandedMotionTests(unittest.TestCase):
    def pose(self, exercise, time):
        return character.motions.forward(
            character.BONES, character.motion_pose(character.BONES, time, exercise, character.pose))

    def test_thirteen_distinct_looping_clips_keep_rigid_segment_lengths(self):
        self.assertEqual(len(character.motions.EXERCISES), 13)
        signatures = set()
        for exercise in character.motions.EXERCISES:
            signature = []
            for frame in range(121):
                points, rotations = self.pose(exercise, frame/30)
                for index, (_, parent, rest) in enumerate(character.BONES):
                    self.assertTrue(all(math.isfinite(v) for v in (*points[index], *rotations[index])))
                    self.assertAlmostEqual(sum(v*v for v in rotations[index]), 1, places=6)
                    if parent is not None and index != 1:
                        self.assertAlmostEqual(
                            character.length(character.sub(points[index], points[parent])),
                            character.length(character.sub(rest, character.BONES[parent][2])), places=6)
                if frame in (0, 30, 60, 90):
                    signature.extend(round(v, 4) for point in points for v in point)
            signatures.add(tuple(signature))
        self.assertEqual(len(signatures), 13)

    def test_raises_hinge_and_row_have_distinct_movement_directions(self):
        for exercise, coordinate in [('dumbbell-lateral-raise', 0), ('dumbbell-front-raise', 2)]:
            start, _ = self.pose(exercise, 0)
            peak, _ = self.pose(exercise, 2)
            self.assertGreater(peak[14][1], start[14][1]+.3)
            self.assertGreater(peak[14][coordinate], start[14][coordinate]+.3)
        start, _ = self.pose('dumbbell-romanian-deadlift', 0)
        peak, _ = self.pose('dumbbell-romanian-deadlift', 2)
        self.assertLess(peak[1][2], start[1][2]-.2)
        self.assertGreater(peak[5][2], start[5][2]+.15)
        start, _ = self.pose('bent-over-dumbbell-row', 0)
        peak, _ = self.pose('bent-over-dumbbell-row', 2)
        self.assertGreater(peak[14][1], start[14][1]+.2)
        self.assertEqual(start[1], peak[1])

    def test_reverse_lunge_support_and_forefoot_pivots_are_explicit(self):
        start, _ = self.pose('reverse-lunge', 0)
        peak, _ = self.pose('reverse-lunge', 2)
        self.assertLess(peak[11][2], start[11][2]-.6)
        for time in [i/30 for i in range(121)]:
            points, _ = self.pose('reverse-lunge', time)
            self.assertLess(character.length(character.sub(points[8], start[8])), 1e-6)
            points, rotations = self.pose('standing-calf-raise', time)
            for foot in (8, 11):
                pivot = character.motions.add(points[foot], character.motions.rotate((0, -.095, .125), rotations[foot]))
                self.assertAlmostEqual(pivot[1], .005, places=6)
                self.assertAlmostEqual(pivot[2], .16, places=6)
        peak, _ = self.pose('standing-calf-raise', 2)
        self.assertGreater(peak[8][1], .13)

    def test_new_limb_solver_rejects_unreachable_targets(self):
        with self.assertRaisesRegex(ValueError, 'Unreachable target'):
            character.motions.limb(character.BONES, {}, 12, (20, 20, 20), (1, 0, 0))

    def test_floor_motion_supports_and_alternation(self):
        start, _ = self.pose('glute-bridge', 0)
        peak, _ = self.pose('glute-bridge', 2)
        self.assertGreater(peak[1][1], start[1][1]+.15)
        self.assertLess(character.length(character.sub(peak[3], start[3])), 1e-6)
        for exercise in ('bird-dog', 'dead-bug'):
            start, _ = self.pose(exercise, 0)
            left, _ = self.pose(exercise, 1)
            right, _ = self.pose(exercise, 3)
            first, second = (14, 17) if exercise == 'bird-dog' else (17, 14)
            self.assertNotEqual(left[first], start[first])
            self.assertNotEqual(right[second], start[second])
            self.assertLess(character.length(character.sub(left[3], start[3])), 1e-6)
        for exercise, leg, arm in [('bird-dog', 9, 12), ('dead-bug', 6, 15)]:
            points, _ = self.pose(exercise, 1)
            for start in (leg, arm):
                upper = character.motions.unit(character.sub(points[start+1], points[start]))
                lower = character.motions.unit(character.sub(points[start+2], points[start+1]))
                self.assertGreater(character.motions.dot(upper, lower), .85)
        start, _ = self.pose('side-lying-hip-abduction', 0)
        peak, _ = self.pose('side-lying-hip-abduction', 2)
        self.assertGreater(peak[11][1], start[11][1]+.4)
        self.assertLess(character.length(character.sub(peak[8], start[8])), 1e-6)


if __name__ == '__main__':
    unittest.main()
