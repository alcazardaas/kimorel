"""Distinct joint goals for the six original Unit B technical previews."""
import importlib.util
import math
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('dumbbell_character', Path(__file__).parents[1]/'character/build.py')
character = importlib.util.module_from_spec(spec)
spec.loader.exec_module(character)
k = character.motions


class DumbbellTests(unittest.TestCase):
    def pose(self, name, time):
        return character.motion_pose(character.BONES, time, name, character.pose)

    def points(self, name, time):
        return k.forward(character.BONES, self.pose(name,time))[0]

    def elbow_cosine(self, points, arm):
        a=k.unit(k.sub(points[arm],points[arm+1]))
        b=k.unit(k.sub(points[arm+2],points[arm+1]))
        return k.dot(a,b)

    def test_pullover_is_a_shoulder_arc_not_an_elbow_extension(self):
        start=self.points('dumbbell-pullover',0)
        end=self.points('dumbbell-pullover',2)
        self.assertLess(end[14][2]-start[14][2],-.45)
        self.assertAlmostEqual(self.elbow_cosine(start,12),self.elbow_cosine(end,12),places=6)
        self.assertEqual(start[3],end[3])

    def test_reverse_fly_keeps_hinge_and_feet_while_opening_laterally(self):
        start=self.points('dumbbell-reverse-fly',0)
        end=self.points('dumbbell-reverse-fly',2)
        self.assertGreater(end[14][0]-start[14][0],.40)
        for index in (1,3,8,11):self.assertEqual(start[index],end[index])
        self.assertGreater(start[3][2],start[1][2]+.20)

    def test_triceps_clips_keep_upper_arms_and_elbows_stationary(self):
        for name in ('lying-triceps-extension','overhead-triceps-extension'):
            start,end=self.points(name,0),self.points(name,2)
            for arm in (12,15):
                self.assertEqual(start[arm+1],end[arm+1])
                self.assertEqual(self.pose(name,0)[arm],self.pose(name,2)[arm])
                self.assertGreater(character.length(k.sub(start[arm+2],end[arm+2])),.25)
        self.assertGreater(self.points('overhead-triceps-extension',0)[13][1],1.65)
        self.assertAlmostEqual(self.points('lying-triceps-extension',0)[1][1],.60)

    def test_side_bend_uses_trunk_not_pelvis_or_whole_body_translation(self):
        start,end=self.points('dumbbell-side-bend',0),self.points('dumbbell-side-bend',2)
        self.assertLess(end[5][0]-start[5][0],-.12)
        for index in (1,8,11):self.assertEqual(start[index],end[index])
        self.assertNotEqual(self.pose('dumbbell-side-bend',0)[2],self.pose('dumbbell-side-bend',2)[2])

    def test_external_rotation_is_humeral_twist_with_a_stationary_bent_elbow(self):
        name='side-lying-dumbbell-external-rotation'
        start,end=self.points(name,0),self.points(name,2)
        self.assertGreater(end[17][1]-start[17][1],.15)
        self.assertLess(character.length(k.sub(start[16],end[16])),1e-12)
        self.assertAlmostEqual(self.elbow_cosine(start,15),self.elbow_cosine(end,15),places=6)
        self.assertAlmostEqual(self.elbow_cosine(start,15),0,places=6)
        self.assertNotEqual(self.pose(name,0)[15],self.pose(name,2)[15])

    def test_load_sides_and_full_length_bench_are_declared(self):
        for name in ('dumbbell-side-bend','side-lying-dumbbell-external-rotation'):
            self.assertEqual(k.PROFILES[name]['equipmentHands'],['right'])
        self.assertEqual(character.props.DEFINITIONS['flat-bench']['dimensions'],[.65,.50,1.5])
        for name in ('dumbbell-pullover','lying-triceps-extension'):
            self.assertEqual(k.PROFILES[name]['props'][0]['id'],'flat-bench')
            for t in (0,1,2,3,4):
                self.assertEqual(self.points(name,t)[8],self.points(name,0)[8])

    def test_new_mapping_is_opt_in_and_legacy_versions_remain_available(self):
        self.assertEqual(character.region_definition('bodyweight-squat')['version'],'1.2.0')
        self.assertEqual(character.region_definition('dumbbell-wrist-curl')['version'],'1.3.0')
        self.assertEqual(character.region_definition('dumbbell-side-bend')['version'],'1.4.0')
        definition=character.DUMBBELL_REGION_DEFINITION
        self.assertEqual(character.muscle_region((.22,1.36,-.08),definition),17)
        self.assertEqual(character.muscle_region((.17,1.12,.05),definition),18)
