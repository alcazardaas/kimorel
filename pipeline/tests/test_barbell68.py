"""Original shared-bar authoring invariants, not clinical or anatomical approval."""
import importlib.util
import math
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('bar_character',Path(__file__).parents[1]/'character/build.py')
character=importlib.util.module_from_spec(spec)
spec.loader.exec_module(character)
k=character.motions
IDS=('barbell-back-squat','barbell-front-squat','barbell-conventional-deadlift',
     'barbell-good-morning','barbell-bench-press','barbell-overhead-press',
     'barbell-bent-over-row','hip-thrust')


class BarbellTests(unittest.TestCase):
    def pose(self,name,time):return character.motion_pose(character.BONES,time,name,character.pose)
    def points(self,name,time):return k.forward(character.BONES,self.pose(name,time))[0]
    def bar(self,name,time):return k.equipment_pose(character.BONES,time,name,character.pose)['barbell']

    def test_both_hands_follow_one_rigid_bar_on_every_authored_frame(self):
        for name in IDS:
            for f in range(121):
                time=f/30
                points,rotations=k.forward(character.BONES,self.pose(name,time))
                bar=self.bar(name,time)
                self.assertAlmostEqual(sum(v*v for v in bar['rotation']),1,places=12)
                for hand,sign in ((14,1),(17,-1)):
                    actual=k.add(points[hand],k.rotate((sign*.02,-.055,.005),rotations[hand]))
                    expected=k.add(bar['translation'],k.rotate((sign*k.PROFILES[name].get('barGripSpan',.33),0,0),bar['rotation']))
                    self.assertLess(character.length(k.sub(actual,expected)),1e-12,name)
                ends=[k.add(bar['translation'],k.rotate((x,0,0),bar['rotation'])) for x in (-.75,.75)]
                self.assertAlmostEqual(character.length(k.sub(*ends)),1.5,places=12)

    def test_front_and_back_squat_have_distinct_racks_and_trunk_angles(self):
        for name,direction in [('barbell-back-squat',-1),('barbell-front-squat',1)]:
            pose=self.pose(name,0)
            points,rotations=k.forward(character.BONES,pose)
            local=k.rotate(k.sub(self.bar(name,0)['translation'],points[3]),k.inverse(rotations[3]))
            self.assertGreater(direction*local[2],.13)
            self.assertGreater(self.points(name,0)[1][1]-self.points(name,2)[1][1],.35)
        self.assertNotEqual(self.pose('barbell-back-squat',2)[1],self.pose('barbell-front-squat',2)[1])

    def test_deadlift_is_a_vertical_floor_pull_with_stable_feet_and_nearly_straight_arms(self):
        name='barbell-conventional-deadlift'
        for t in (0,4):self.assertAlmostEqual(self.bar(name,t)['translation'][1]-.16,.01)
        initial=self.points(name,0)
        for f in range(121):
            points=self.points(name,f/30)
            self.assertAlmostEqual(self.bar(name,f/30)['translation'][2],.16)
            for shoulder in (12,15):self.assertAlmostEqual(character.length(k.sub(points[shoulder],points[shoulder+2])),.534,places=10)
            for foot in (8,11):self.assertLess(character.length(k.sub(points[foot],initial[foot])),1e-12)
        self.assertAlmostEqual(initial[8][0]-initial[11][0],.40)

    def test_good_morning_is_a_hinge_not_a_renamed_squat(self):
        start,end=self.points('barbell-good-morning',0),self.points('barbell-good-morning',2)
        self.assertAlmostEqual(start[1][1]-end[1][1],.08)
        self.assertGreater(end[3][2]-start[3][2],.06)
        self.assertLess(self.points('barbell-back-squat',2)[1][1],end[1][1]-.20)

    def test_press_paths_and_row_have_distinct_joint_goals(self):
        for name,height in [('barbell-bench-press',.34),('barbell-overhead-press',.50),('barbell-bent-over-row',.32)]:
            self.assertAlmostEqual(self.bar(name,2)['translation'][1]-self.bar(name,0)['translation'][1],height)
        for f in range(121):
            center=self.bar('barbell-overhead-press',f/30)['translation']
            if 1.55<center[1]<1.85:self.assertGreater(center[2],.15)
        for name in ('barbell-bench-press','barbell-bent-over-row'):
            self.assertEqual(self.points(name,0)[1],self.points(name,2)[1])
            self.assertEqual(self.points(name,0)[3],self.points(name,2)[3])

    def test_hip_thrust_has_stationary_upper_back_and_a_real_pad(self):
        name='hip-thrust'
        start,end=self.points(name,0),self.points(name,2)
        self.assertGreater(end[1][1]-start[1][1],.20)
        self.assertLess(character.length(k.sub(start[3],end[3])),1e-12)
        self.assertTrue(k.PROFILES[name]['barPad'])
        self.assertEqual(k.PROFILES[name]['props'][0]['id'],'bench')

    def test_bar_and_pad_are_closed_original_meter_geometry(self):
        for segments,count,width in [(character.barbell.SEGMENTS,72,1.5),(character.barbell.PAD,24,.5)]:
            positions,normals,indices=character.barbell.geometry(segments)
            self.assertEqual(len(positions),count)
            self.assertEqual(len(normals),count)
            self.assertEqual(len(indices),132*len(segments))
            self.assertLess(max(indices),count)
            self.assertAlmostEqual(max(p[0] for p in positions)-min(p[0] for p in positions),width)
            self.assertTrue(all(math.isfinite(v) for p in positions for v in p))

    def test_front_rack_elbows_point_forward_not_above_the_head(self):
        for t in (0,1,2,3,4):
            points=self.points('barbell-front-squat',t)
            for arm in (12,15):
                self.assertGreater(points[arm+1][2]-points[arm][2],.25)
                self.assertLess(points[arm+1][1]-points[arm][1],.05)
