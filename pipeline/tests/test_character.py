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
        self.assertEqual(len(regions), 12)
        self.assertEqual(len({r['code'] for r in regions.values()}), 12)
        self.assertEqual(character.muscle_region((0, 1.4, .1)), regions['chest']['code'])
        self.assertEqual(character.muscle_region((0, 1.7, 0)), 0)

    def test_unmapped_hands_do_not_claim_activation(self):
        self.assertEqual(character.muscle_region((.45, .88, .005)), 0)


if __name__ == '__main__':
    unittest.main()
