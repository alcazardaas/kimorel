"""Eight band actions use distinct limb goals and true endpoint attachments."""
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('band83_character',Path(__file__).parents[1]/'character/build.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c);k=c.motions
NAMES=k._load_family('motion_band_lower').EXERCISES


class Band83Tests(unittest.TestCase):
    def points(self,name,t):return k.forward(c.BONES,c.motion_pose(c.BONES,t,name,c.pose))

    def test_every_band_end_matches_declared_joint_offset_or_two_hand_handle(self):
        for name in NAMES:
            for frame in range(121):
                t=frame/30;world,q=self.points(name,t);band=k.equipment_pose(c.BONES,t,name)['elasticBand'];a=k.PROFILES[name]['elasticBand'];points=[]
                self.assertEqual(band['start'],tuple(a['anchor']))
                for attach in a['attachments']:
                    joint=next(i for i,b in enumerate(c.BONES) if b[0]==attach['bone'])
                    points.append(k.add(world[joint],k.rotate(attach['local'],q[joint])))
                expected=k.scale(k.add(*points),.5) if len(points)==2 else points[0]
                self.assertLess(c.length(k.sub(band['end'],expected)),1e-12)
                if len(points)==2:self.assertLess(c.length(k.sub(k.sub(points[0],points[1]),(.13,0,0))),1e-12)

    def test_rotations_pushdown_and_pallof_have_distinct_joint_goals(self):
        for name in ('band-internal-rotation','band-triceps-pushdown'):
            p,_=self.points(name,0);q,_=self.points(name,2)
            self.assertLess(c.length(k.sub(p[16],q[16])),1e-12)
        p,_=self.points('band-internal-rotation',0);q,_=self.points('band-internal-rotation',2)
        self.assertGreater(q[17][0]-p[17][0],.14)
        p,_=self.points('band-triceps-pushdown',0);q,_=self.points('band-triceps-pushdown',2)
        self.assertLess(q[17][1],p[17][1]-.20)
        p,qp=self.points('band-pallof-press',0);q,qq=self.points('band-pallof-press',2)
        self.assertGreater(q[17][2]-p[17][2],.24)
        self.assertEqual(qp[3],qq[3]);self.assertEqual(p[1],q[1])

    def test_seated_curl_fixes_thigh_and_moves_lower_leg(self):
        p,_=self.points('seated-band-hamstring-curl',0);q,_=self.points('seated-band-hamstring-curl',2)
        self.assertLess(c.length(k.sub(p[10],q[10])),1e-12)
        self.assertLess(q[11][2],p[11][2]-.20)
        self.assertLess(q[11][1],p[11][1]-.25)

    def test_knee_extension_and_adduction_preserve_support_feet(self):
        p,_=self.points('band-terminal-knee-extension',0);q,_=self.points('band-terminal-knee-extension',2)
        for foot in (8,11):self.assertLess(c.length(k.sub(p[foot],q[foot])),1e-12)
        self.assertLess(q[10][2],p[10][2]-.08)
        p,_=self.points('band-hip-adduction',0);q,_=self.points('band-hip-adduction',2)
        self.assertLess(c.length(k.sub(p[8],q[8])),1e-12)
        self.assertGreater(q[11][0]-p[11][0],.29)

    def test_adduction_keeps_constant_leg_reach_and_seated_hands_rest_low(self):
        lengths=[]
        for frame in range(121):
            world,_=self.points('band-hip-adduction',frame/30)
            lengths.append(c.length(k.sub(world[11],world[9])))
        self.assertLess(max(lengths)-min(lengths),1e-10)
        for name in ('seated-band-hamstring-curl','band-ankle-dorsiflexion','band-ankle-plantarflexion'):
            world,_=self.points(name,0)
            self.assertAlmostEqual(world[14][1],.66);self.assertAlmostEqual(world[17][1],.66)

    def test_ankle_antagonists_fix_ankle_origin_and_move_forefoot_oppositely(self):
        heights=[]
        for name in ('band-ankle-dorsiflexion','band-ankle-plantarflexion'):
            p,qp=self.points(name,0);q,qq=self.points(name,2)
            self.assertLess(c.length(k.sub(p[11],q[11])),1e-12)
            toe=k.PROFILES[name]['elasticBand']['attachments'][0]['local']
            heights.append(k.rotate(toe,qq[11])[1]-k.rotate(toe,qp[11])[1])
        self.assertGreater(heights[0],.13);self.assertLess(heights[1],-.13)

    def test_new_region_labels_are_opt_in_and_truthful(self):
        self.assertEqual(c.region_definition('band-row')['version'],'1.4.0')
        definition=c.region_definition('band-hip-adduction')
        self.assertEqual(definition['version'],'1.5.0')
        self.assertEqual(c.muscle_region((.08,.70,0),definition),19)
        self.assertEqual(c.muscle_region((.14,.30,.05),definition),20)
