"""Technical motion goals for original milestone-fifty previews, not clinical approval."""
import importlib.util
import math
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('character50', Path(__file__).parents[1]/'character/build.py')
character = importlib.util.module_from_spec(spec)
spec.loader.exec_module(character)


class Milestone50Tests(unittest.TestCase):
    def pose(self, name, time):
        return character.motion_pose(character.BONES, time, name, character.pose)

    def points(self, name, time):
        return character.motions.forward(character.BONES, self.pose(name, time))[0]

    def test_standing_hip_planes_and_straight_leg_raise_are_distinct(self):
        for name, axis, sign in [('standing-hip-abduction', 0, -1), ('standing-hip-flexion', 2, 1)]:
            start, end = self.points(name, 0), self.points(name, 2)
            self.assertGreater(sign*(end[11][axis]-start[11][axis]), .30)
            self.assertLess(character.length(character.sub(end[8], start[8])), 1e-6)
        start, end = self.points('straight-leg-raise', 0), self.points('straight-leg-raise', 2)
        self.assertGreater(end[8][1]-start[8][1], .4)
        self.assertEqual(start[11], end[11])

    def test_trunk_mobility_has_local_spine_and_chest_articulation(self):
        for name in ['supine-pelvic-tilt','supine-trunk-rotation','thoracic-open-book','quadruped-thoracic-rotation','seated-trunk-rotation','curl-up','superman']:
            values = [self.pose(name, time) for time in (0,1,2,3)]
            self.assertTrue(any(values[0].get(bone) != pose.get(bone) for pose in values[1:] for bone in (2,3)), name)
        self.assertLess(character.length(character.sub(self.points('seated-trunk-rotation',0)[1], self.points('seated-trunk-rotation',1)[1])), 1e-6)

    def test_holds_are_static_and_labeled(self):
        for name in ['hollow-body-hold','standing-hamstring-stretch','wall-sit']:
            self.assertEqual(character.motions.PROFILES[name]['kind'], 'hold')
            for time in (1,2,3,4): self.assertEqual(self.pose(name,0),self.pose(name,time))

    def test_seated_knee_and_heel_raise_goals(self):
        start,end=self.points('seated-knee-extension',0),self.points('seated-knee-extension',2)
        self.assertGreater(end[8][1]-start[8][1], .25)
        self.assertEqual(start[11],end[11])
        for time in [i/30 for i in range(121)]:
            pose=self.pose('seated-calf-raise',time)
            world,rotations=character.motions.forward(character.BONES,pose)
            for foot in (8,11):
                pivot=character.motions.add(world[foot],character.motions.rotate((0,-.095,.125),rotations[foot]))
                self.assertAlmostEqual(pivot[1],.005,places=6)
        self.assertGreater(self.points('sit-to-stand',2)[1][1]-self.points('sit-to-stand',0)[1][1],.3)

    def test_step_lifts_clear_then_transfers_and_returns(self):
        start=self.points('step-up',0)
        clear=self.points('step-up',.4)
        top=self.points('step-up',2)
        self.assertGreater(clear[8][1], .35)
        self.assertLess(clear[8][2], .20)
        self.assertAlmostEqual(top[8][1], .35, places=6)
        self.assertAlmostEqual(top[11][1], .35, places=6)
        self.assertGreater(top[1][1]-start[1][1], .20)
        self.assertEqual(self.pose('step-up',0),self.pose('step-up',4))

    def test_single_leg_support_is_not_a_mirrored_bilateral_copy(self):
        for name in ['single-leg-glute-bridge','single-leg-romanian-deadlift']:
            start,end=self.points(name,0),self.points(name,2)
            self.assertLess(character.length(character.sub(start[8],end[8])), 1e-6)
            self.assertGreater(character.length(character.sub(start[11],end[11])), .10)
        start,end=self.points('prone-hip-extension',0),self.points('prone-hip-extension',2)
        self.assertEqual(start[8],end[8])
        self.assertGreater(end[11][1]-start[11][1], .15)

    def test_press_fly_and_kickback_have_different_joint_goals(self):
        for name in ['dumbbell-floor-press','dumbbell-chest-fly']:
            start,end=self.points(name,0),self.points(name,2)
            self.assertGreater(end[14][1]-start[14][1], .25)
        start,end=self.points('dumbbell-triceps-kickback',0),self.points('dumbbell-triceps-kickback',2)
        self.assertLess(end[14][2],start[14][2]-.18)
        self.assertEqual(self.pose('dumbbell-triceps-kickback',0)[12],self.pose('dumbbell-triceps-kickback',2)[12])
        self.assertNotEqual(self.pose('dumbbell-triceps-kickback',0)[13],self.pose('dumbbell-triceps-kickback',2)[13])

    def test_equipment_is_original_rigid_meter_geometry(self):
        for name,definition in character.props.DEFINITIONS.items():
            vertices,normals,indices=character.props.geometry(name)
            self.assertEqual(len(vertices),len(normals))
            self.assertEqual(len(vertices),24*len(definition['boxes']))
            self.assertTrue(all(math.isfinite(v) for p in vertices for v in p))
            self.assertLess(max(indices),len(vertices))
            for axis,size in enumerate(definition['dimensions']):
                self.assertAlmostEqual(max(p[axis] for p in vertices)-min(p[axis] for p in vertices),size)


if __name__ == '__main__': unittest.main()
