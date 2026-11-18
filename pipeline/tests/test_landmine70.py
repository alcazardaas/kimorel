"""Authoring invariants for fixed-pivot unilateral load arcs, not clinical validation."""
import importlib.util
import math
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('landmine_character', Path(__file__).parents[1]/'character/build.py')
character = importlib.util.module_from_spec(spec)
spec.loader.exec_module(character)
k = character.motions


class LandmineTests(unittest.TestCase):
    def test_fixed_pivot_distal_grip_and_rigid_length_every_frame(self):
        for name in character.landmine.EXERCISES:
            baseline = None
            for frame in range(121):
                time = frame/30
                pose = character.motion_pose(character.BONES,time,name,character.pose)
                world, rotations = k.forward(character.BONES,pose)
                load = k.equipment_pose(character.BONES,time,name)['landmine']
                self.assertEqual(load['translation'],tuple(k.PROFILES[name]['landminePivot']))
                self.assertAlmostEqual(sum(v*v for v in load['rotation']),1)
                grip = k.add(load['translation'],k.rotate(character.landmine.GRIP,load['rotation']))
                actual = k.add(world[17],k.rotate((-.02,-.055,.005),rotations[17]))
                self.assertLess(character.length(k.sub(grip,actual)),1e-12,name)
                self.assertAlmostEqual(character.length(k.sub(grip,load['translation'])),1.79)
                if baseline is None: baseline = world
                for foot in (8,11): self.assertLess(character.length(k.sub(world[foot],baseline[foot])),1e-12)

    def test_press_and_row_have_distinct_stable_trunks_and_upward_arcs(self):
        for name in character.landmine.EXERCISES:
            frames = [character.motion_pose(character.BONES,t,name,character.pose) for t in (0,2,4)]
            points = [k.forward(character.BONES,p)[0] for p in frames]
            self.assertEqual(points[0][1],points[1][1])
            self.assertEqual(points[0][3],points[1][3])
            self.assertGreater(points[1][17][1]-points[0][17][1],.30)
            self.assertLess(character.length(k.sub(points[0][17],points[2][17])),1e-12)
        press = character.motion_pose(character.BONES,0,'landmine-press',character.pose)
        row = character.motion_pose(character.BONES,0,'landmine-row',character.pose)
        self.assertEqual(press[1][1],k.IDENTITY)
        self.assertGreater(abs(row[1][1][0]),.3)

    def test_original_landmine_and_anchor_geometry_are_meter_scaled(self):
        vertices,normals,indices = character.barbell.geometry(character.landmine.SEGMENTS)
        self.assertEqual(len(vertices),48)
        self.assertEqual(len(indices),264)
        self.assertEqual(len(normals),48)
        self.assertAlmostEqual(max(p[0] for p in vertices),1.8)
        self.assertTrue(all(math.isfinite(v) for p in vertices for v in p))
        vertices,_,_ = character.props.geometry('landmine-anchor')
        self.assertAlmostEqual(min(p[1] for p in vertices),0)
        self.assertAlmostEqual(max(p[1] for p in vertices),.15)
