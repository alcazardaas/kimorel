"""Observable physical support and joint goals for the final17 original motions."""
import importlib.util
import math
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('final_character',Path(__file__).parents[1]/'character/build.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c);k=c.motions
IDS=c.final.EXERCISES

class Final100Tests(unittest.TestCase):
    def points(self,name,t):return k.forward(c.BONES,c.motion_pose(c.BONES,t,name,c.pose))

    def test_hanging_palms_are_fixed_and_dynamic_goals_are_distinct(self):
        for name in IDS[:4]:
            spec=k.PROFILES[name]['hangingSupport']
            for frame in range(121):
                w,q=self.points(name,frame/30)
                for joint,sign in ((14,1),(17,-1)):
                    palm=k.add(w[joint],k.rotate((sign*.02,-.055,.005),q[joint]))
                    self.assertLess(c.length(k.sub(palm,(sign*.30,spec['height'],spec['z']))),1e-10)
        p,_=self.points('pull-up',0);q,_=self.points('pull-up',2)
        self.assertAlmostEqual(q[1][1]-p[1][1],.35)
        p,_=self.points('hanging-knee-raise',0);q,_=self.points('hanging-knee-raise',2)
        self.assertAlmostEqual(q[8][1]-p[8][1],.50)
        self.assertEqual(p[1],q[1])

    def test_wheel_rolls_without_slip_and_knees_stay_planted(self):
        for frame in range(121):
            t=frame/30;w,q=self.points('ab-wheel-rollout',t)
            wheel=k.equipment_pose(c.BONES,t,'ab-wheel-rollout')['wheel']
            self.assertAlmostEqual(wheel['translation'][1],.18)
            angle=2*math.atan2(wheel['rotation'][0],wheel['rotation'][3])
            self.assertAlmostEqual(.18*angle,wheel['translation'][2]-.32)
            for joint,sign in ((7,1),(10,-1)):
                self.assertLess(c.length(k.sub(w[joint],(sign*.145,.08,-.35))),1e-10)
            for joint,sign in ((14,1),(17,-1)):
                palm=k.add(w[joint],k.rotate((sign*.02,-.055,.005),q[joint]))
                self.assertLess(c.length(k.sub(palm,(sign*.18,.18,wheel['translation'][2]))),1e-10)

    def test_support_holds_do_not_oscillate_and_all_dynamic_clips_move(self):
        for name in IDS:
            poses=[c.motion_pose(c.BONES,t,name,c.pose) for t in (0,1,2,3,4)]
            self.assertEqual(poses[0],poses[-1],name)
            for pose in poses:
                self.assertTrue(all(math.isfinite(x) for translation,rotation in pose.values() for x in (translation or ()) + tuple(rotation)),name)
            if k.PROFILES[name].get('kind')=='hold':self.assertTrue(all(p==poses[0] for p in poses),name)
            else:self.assertTrue(any(p!=poses[0] for p in poses),name)

    def test_cervical_and_scapular_work_is_not_whole_body_rocking(self):
        for name in ('chin-tuck','cervical-rotation','cervical-lateral-flexion','scapular-retraction'):
            a,qa=self.points(name,0);b,qb=self.points(name,1)
            self.assertEqual(a[1],b[1]);self.assertEqual(qa[3],qb[3])
        a,_=self.points('chin-tuck',0);b,_=self.points('chin-tuck',2)
        self.assertLess(b[5][2],a[5][2]-.03)
        a,_=self.points('scapular-retraction',0);b,_=self.points('scapular-retraction',2)
        self.assertLess(b[12][2],a[12][2]-.04)
        self.assertEqual(c.region_definition('chin-tuck')['version'],'1.6.0')
        self.assertEqual(c.region_definition('band-row')['version'],'1.4.0')

    def test_wall_slide_forearms_are_parallel_to_actual_wall(self):
        for frame in range(121):
            w,_=self.points('forearm-wall-slide',frame/30)
            for elbow,wrist in ((13,14),(16,17)):
                self.assertAlmostEqual(w[elbow][2],.245)
                self.assertAlmostEqual(w[wrist][2],.245)
                self.assertAlmostEqual(w[elbow][0],w[wrist][0])

    def test_final_records_have_truthful_regions_and_hold_semantics(self):
        import json
        records=json.loads((c.ROOT/'packages/data/src/exercises.json').read_text())
        self.assertEqual(len(records),100)
        self.assertEqual(len({r['id'] for r in records}),100)
        for record in records[-17:]:
            self.assertEqual(record['animation']['kind'],k.PROFILES[record['id']].get('kind','repetition'))
            self.assertEqual(record['review']['status'],'pending')
            if record['id'] in ('ankle-dorsiflexion-rock','ninety-ninety-hip-rotation','half-kneeling-hip-flexor-stretch'):
                self.assertIn('lower-body',record['bodyRegions'])

    def test_ninety_ninety_knees_switch_together_without_a_flexion_alias(self):
        left,_=self.points('ninety-ninety-hip-rotation',1)
        right,_=self.points('ninety-ninety-hip-rotation',3)
        for knee in (7,10):self.assertGreater(left[knee][0]-right[knee][0],.40)
        for points in (left,right):
            for hip,knee,foot in ((6,7,8),(9,10,11)):
                a=k.sub(points[hip],points[knee]);b=k.sub(points[foot],points[knee])
                angle=math.acos(k.dot(a,b)/(c.length(a)*c.length(b)))
                self.assertGreater(angle,math.radians(80));self.assertLess(angle,math.radians(100))
