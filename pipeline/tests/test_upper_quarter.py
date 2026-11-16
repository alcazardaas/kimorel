"""Capability evidence for the optional upper-quarter rig, not anatomical approval."""
import importlib.util
import math
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('upper_character', Path(__file__).parents[1]/'character/build.py')
character = importlib.util.module_from_spec(spec)
spec.loader.exec_module(character)


class UpperQuarterTests(unittest.TestCase):
    def points(self, name, time):
        pose = character.motion_pose(character.BONES, time, name, character.pose)
        return character.motions.forward(character.BONES, pose)

    def test_optional_clavicles_preserve_canonical_indices_and_rest_positions(self):
        bones = character.motions.enhanced_bones(character.BONES)
        self.assertEqual(len(bones), 20)
        for i in range(18):
            self.assertEqual(bones[i][0], character.BONES[i][0])
            self.assertEqual(bones[i][2], character.BONES[i][2])
        self.assertEqual(bones[12][1], 18)
        self.assertEqual(bones[15][1], 19)
        self.assertEqual(self.points('dumbbell-wrist-curl', 0)[0][18], bones[18][2])

    def test_press_has_hand_elevation_and_actual_girdle_articulation(self):
        start,_ = self.points('dumbbell-shoulder-press',0)
        end,_ = self.points('dumbbell-shoulder-press',2)
        self.assertGreater(end[14][1]-start[14][1], .35)
        self.assertGreater(end[18][1]-start[18][1], .02)
        self.assertEqual(start[8],end[8])

    def test_wrist_motion_keeps_elbow_and_hand_origin_stationary(self):
        for name in ['dumbbell-wrist-curl','dumbbell-reverse-wrist-curl']:
            start,rotations = self.points(name,0)
            end,peak = self.points(name,2)
            for bone in (12,13,14,15,16,17):
                self.assertEqual(start[bone],end[bone])
            self.assertNotEqual(rotations[14],peak[14])
        a=self.points('dumbbell-wrist-curl',2)[1][14]
        b=self.points('dumbbell-reverse-wrist-curl',2)[1][14]
        self.assertLess(abs(sum(x*y for x,y in zip(a,b))),.1)

    def test_serratus_reach_comes_from_girdle_not_elbow_bend(self):
        start,_=self.points('supine-serratus-punch',0)
        end,_=self.points('supine-serratus-punch',2)
        for bone in (12,13,14):
            self.assertAlmostEqual(end[bone][1]-start[bone][1],.055)
        self.assertEqual(start[3],end[3])
        self.assertEqual(character.REGION_DEFINITION['version'],'1.2.0')
        self.assertEqual(character.region_definition('dumbbell-wrist-curl')['version'],'1.3.0')

    def test_loops_and_finite_pose_values(self):
        for name in character.motions._FAMILIES[-1].EXERCISES:
            self.assertEqual(character.motion_pose(character.BONES,0,name,character.pose),character.motion_pose(character.BONES,4,name,character.pose))
            for t in (0,1,2,3,4):
                points,rotations=self.points(name,t)
                self.assertTrue(all(math.isfinite(v) for row in points+rotations for v in row))

    def test_hierarchy_cycle_is_rejected(self):
        bones=list(character.BONES)
        name,_,rest=bones[0]
        bones[0]=(name,1,rest)
        with self.assertRaisesRegex(ValueError,'Cyclic skeleton'):
            character.motions.forward(bones,{})

    def test_extended_surfaces_do_not_relabel_legacy_assets(self):
        point=(.36,1.08,0)
        self.assertEqual(character.muscle_region(point),0)
        self.assertEqual(character.muscle_region(point,character.UPPER_REGION_DEFINITION),16)
        self.assertEqual(character.muscle_region((.19,1.25,.08),character.UPPER_REGION_DEFINITION),15)

    def test_neutral_hand_long_axis_follows_forearm(self):
        k=character.motions
        for name in ['dumbbell-wrist-curl','dumbbell-reverse-wrist-curl']:
            points,rotations=self.points(name,0)
            for arm in (12,15):
                hand=k.rotate((0,-1,0),rotations[arm+2])
                forearm=k.unit(k.sub(points[arm+2],points[arm+1]))
                self.assertAlmostEqual(k.dot(hand,forearm),1)

    def test_both_wrist_goals_raise_the_fingers_from_the_neutral_line(self):
        k=character.motions
        for name in ['dumbbell-wrist-curl','dumbbell-reverse-wrist-curl']:
            _,start=self.points(name,0)
            _,end=self.points(name,2)
            self.assertGreater(k.rotate((0,-.1,0),end[14])[1],k.rotate((0,-.1,0),start[14])[1]+.02)
