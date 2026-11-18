"""Elastic visualization invariants, not resistance-force or clinical validation."""
import importlib.util
import math
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('band_character',Path(__file__).parents[1]/'character/build.py')
character = importlib.util.module_from_spec(spec)
spec.loader.exec_module(character)
k = character.motions


class BandTests(unittest.TestCase):
    def points(self,name,t):
        pose = character.motion_pose(character.BONES,t,name,character.pose)
        return k.forward(character.BONES,pose)

    def test_endpoints_are_real_fixed_palms_or_physical_anchor(self):
        for name in character.band.EXERCISES:
            first = self.points(name,0)[0]
            for frame in range(121):
                time=frame/30
                world,rotation=self.points(name,time)
                band=k.equipment_pose(character.BONES,time,name)['elasticBand']
                self.assertEqual(band['end'],k.add(world[17],k.rotate(character.band.PALM['right'],rotation[17])))
                expected=tuple(k.PROFILES[name]['elasticBand']['anchor']) if name!='band-pull-apart' else k.add(world[14],k.rotate(character.band.PALM['left'],rotation[14]))
                self.assertEqual(band['start'],expected)
                for foot in (8,11):self.assertLess(character.length(k.sub(first[foot],world[foot])),1e-12)

    def test_distinct_goals_and_stationary_external_rotation_elbow(self):
        start={n:self.points(n,0)[0] for n in character.band.EXERCISES}
        peak={n:self.points(n,2)[0] for n in character.band.EXERCISES}
        self.assertLess(peak['band-row'][17][2],start['band-row'][17][2]-.3)
        self.assertGreater(peak['band-chest-press'][17][2],start['band-chest-press'][17][2]+.3)
        self.assertGreater(peak['band-pull-apart'][14][0]-peak['band-pull-apart'][17][0],.9)
        self.assertLess(peak['band-face-pull'][17][2],start['band-face-pull'][17][2]-.25)
        self.assertGreater(peak['band-face-pull'][17][1],start['band-face-pull'][17][1]+.06)
        self.assertLess(character.length(k.sub(peak['band-external-rotation'][16],start['band-external-rotation'][16])),1e-12)
        self.assertLess(peak['band-external-rotation'][17][0],start['band-external-rotation'][17][0]-.14)

    def test_pull_apart_keeps_slight_elbow_bend_and_face_pull_elbow_below_eye_line(self):
        lengths=[]
        for frame in range(121):
            world,_=self.points('band-pull-apart',frame/30)
            lengths.append(character.length(k.sub(world[17],world[15])))
            self.assertGreater(lengths[-1],.51)
            face,_=self.points('band-face-pull',frame/30)
            self.assertLess(face[16][1],1.55)
        self.assertLess(max(lengths)-min(lengths),1e-10)

    def test_deformed_tube_keeps_radius_and_changes_length(self):
        for name in character.band.EXERCISES:
            lengths=[]
            for time in (0,1,2,3,4):
                endpoints=k.equipment_pose(character.BONES,time,name)['elasticBand']
                points,normals,indices=character.band.deformed_geometry(endpoints,k)
                a,b=endpoints['start'],endpoints['end'];length=character.length(k.sub(b,a));lengths.append(length)
                for i,p in enumerate(points):
                    t=(i//character.band.SIDES)/character.band.RINGS
                    center=k.add(k.scale(a,1-t),k.scale(b,t))
                    self.assertAlmostEqual(character.length(k.sub(p,center)),character.band.RADIUS)
                self.assertEqual(len(points),72);self.assertEqual(len(normals),72);self.assertEqual(len(indices),420)
                self.assertTrue(all(math.isfinite(v) for p in points for v in p))
            self.assertGreater(max(lengths)-min(lengths),.15)
