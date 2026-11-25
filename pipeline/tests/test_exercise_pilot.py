import importlib.util
import json
import math
import os
from pathlib import Path
import subprocess
import struct
import sys
import unittest

HERE = Path(__file__).resolve().parents[1] / 'character-v2'
spec = importlib.util.spec_from_file_location('pilot_motion', HERE / 'pilot_motion.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class PilotMotion(unittest.TestCase):
    def test_faithful_export_retains_tiny_weights_and_all_inactive_bytes(self):
        positions = struct.pack('<6f', .43,.92,0., .43,.85,0.)
        joints = bytes(8)
        weights = struct.pack('<8f',1.,0.,0.,0.,1.,0.,0.,0.)
        binary = positions+joints+weights
        doc = {'nodes':[{'mesh':0,'skin':0},{'name':'right_hand'},{'name':'right_ring_1'}],
               'skins':[{'joints':[1,2]}], 'meshes':[{'primitives':[{'attributes':{'POSITION':0,'JOINTS_0':1,'WEIGHTS_0':2}}]}],
               'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':24},{'buffer':0,'byteOffset':24,'byteLength':8},{'buffer':0,'byteOffset':32,'byteLength':32}],
               'accessors':[{'bufferView':0,'componentType':5126,'type':'VEC3','count':2},
                            {'bufferView':1,'componentType':5121,'type':'VEC4','count':2},
                            {'bufferView':2,'componentType':5126,'type':'VEC4','count':2}]}
        raw = json.dumps(doc).encode(); raw += b' '*((-len(raw))%4)
        offset = 28+len(raw)
        data = struct.pack('<IIIII',0x46546c67,2,offset+len(binary),len(raw),0x4e4f534a)+raw+struct.pack('<II',len(binary),0x004e4942)+binary
        points = [struct.unpack_from('<3f',positions,i*12) for i in range(2)]
        records = [{'position':points[0],'weights':{'right_hand':.99995,'right_ring_1':.00005},'active':True},
                   {'position':points[1],'weights':{'right_hand':1.},'active':False}]
        result, report = p.restore_export_weights(data, records)
        self.assertEqual(report['restoredVertices'],1)
        self.assertEqual(report['tinyInfluencesPreserved'],1)
        self.assertGreater(struct.unpack_from('<f',result,offset+36)[0],0.)
        allowed = set(range(offset+24,offset+28))|set(range(offset+32,offset+48))
        self.assertTrue(all(a==b for i,(a,b) in enumerate(zip(data,result)) if i not in allowed))
        self.assertEqual(result[offset+48:],data[offset+48:])
        bad_doc = json.loads(json.dumps(doc))
        bad_doc['bufferViews'][2]['byteOffset'] = 0
        raw_bad = json.dumps(bad_doc).encode(); raw_bad += b' '*((-len(raw_bad))%4)
        bad_data = struct.pack('<IIIII',0x46546c67,2,28+len(raw_bad)+len(binary),len(raw_bad),0x4e4f534a)+raw_bad+struct.pack('<II',len(binary),0x004e4942)+binary
        with self.assertRaisesRegex(ValueError,'Overlapping skin buffer views'):
            p.restore_export_weights(bad_data,records)
        for bad, message in [
            ([{**records[0],'position':(.430001,.92,0.)},records[1]],'exact native position'),
            ([{**records[0],'weights':{'missing_joint':1.}},records[1]],'semantic skin joint'),
            (records+[{**records[0],'weights':{'right_hand':1.}}],'Ambiguous native'),
            ([{**records[0],'weights':{'right_hand':.5}},records[1]],'not normalized'),
        ]:
            with self.assertRaisesRegex(ValueError,message):
                p.restore_export_weights(data,bad)

    def test_proximal_palm_boundary_preserves_distal_digits(self):
        old = {'right_hand': .4748743176, 'right_thumb_1': .2160993814,
               'right_forearm': .1624073088, 'right_ring_1': .1466189922}
        points = [(-.4236814678,.9280682802,.0190302748),
                  (-.4237192571,.9267740250,.0192319490),
                  (-.43,.89,.01), (-.43,.87,.01)]
        values, report = p.whole_arm_field(points, [(0,1)], [old]*4)
        self.assertEqual(values[2:], [old]*2)
        self.assertEqual(report['proximalPalm']['changedDigitVertexIndices'], [0,1])
        self.assertEqual(report['proximalPalm']['distalDigitVerticesPreserved'], 2)
        self.assertLessEqual(report['maximumSemanticGradient'],24.0024)
        for value in values[:2]:
            self.assertFalse(any(name.rsplit('_',1)[-1].isdigit() for name in value))
        for y in (.895, .90, .91, .92, 1.00, 1.015):
            partial, _ = p.whole_arm_field([(-.43,y,.01)], [], [old])
            self.assertAlmostEqual(sum(partial[0].values()),1.)
            self.assertLessEqual(len(partial[0]),4)
            self.assertTrue(any(name.rsplit('_',1)[-1].isdigit() for name in partial[0]))
        for y in (.89, .90, .91, .925, .99, 1.02):
            point = (-.43,y,.01)
            support = p.proximal_palm_support(point)
            nearby = p.proximal_palm_support((point[0],y+1e-9,point[2]))
            self.assertLess(abs(support-nearby),1e-6)
        for point in [(-.43,.89,0),(-.43,.95,.11),(-.54,.95,0),(-.36,.95,0)]:
            self.assertEqual(p.proximal_palm_support(point),0)


    def test_hip_displacement_gradient_is_bounded_without_zeroing_target(self):
        points = [(i*.002, 0., 0.) for i in range(9)]
        edges = [(i, i+1) for i in range(8)]
        original = [(0., .02 if i == 4 else 0., 0.) for i in range(9)]
        corrected, report = p.regularize_displacements(points, edges, original)
        self.assertLessEqual(report['maximumGradient'], 2.00002)
        self.assertGreaterEqual(report['energyRatio'], .2)
        self.assertEqual(corrected[0], original[0])
        self.assertEqual(corrected[-1], original[-1])
        self.assertGreater(sum(math.dist(delta, (0,0,0)) for delta in corrected), 0.)

    def test_compact_whole_arm_partition_and_fixed_exterior(self):
        for sign in (-1, 1):
            for x in (.08, .12, .17, .26, .34, .43, .50):
                for y in (.85, .94, 1.05, 1.23, 1.43, 1.55):
                    target, amount = p.arm_partition((sign*x, y, .04))
                    self.assertLessEqual(len(target), 4)
                    if target:
                        self.assertAlmostEqual(sum(target.values()), 1.)
                    self.assertTrue(0 <= amount <= 1)
                    self.assertFalse({'pelvis', 'spine', 'neck', 'head'} & set(target))
        points = [(.34, 1.05, .01), (.341, 1.05, .01), (.342, 1.05, .01), (.145, .85, 0.), (.43, .89, 0.)]
        old = [{'left_forearm': .85, 'pelvis': .1, 'spine': .05} for _ in range(3)]+[{'left_thigh': 1.}, {'left_index_1': 1.}]
        values, report = p.whole_arm_field(points, [(0, 1), (1, 2)], old)
        self.assertLessEqual(report['maximumSemanticGradient'], 24.0024)
        for value in values[:3]:
            self.assertFalse({'pelvis', 'spine', 'chest'} & set(value))
            self.assertLessEqual(len(value), 4)
        self.assertEqual(values[3:], old[3:])
        first, amount = p.arm_partition((.12, 1.43, .04))
        nearby, nearby_amount = p.arm_partition((.12+1e-8, 1.43, .04))
        self.assertLess(sum(abs(first.get(name, 0)-nearby.get(name, 0)) for name in set(first)|set(nearby)), 1e-5)
        self.assertLess(abs(amount-nearby_amount), 1e-5)

    def test_continuous_pilot_sparse_field_endpoints_ties_and_degenerate(self):
        old = {'upper_arm': .6, 'forearm': .2, 'clavicle': .15, 'spine': .05}
        target = {'upper_arm': .5, 'chest': .3, 'clavicle': .2}
        self.assertEqual(p.sparse_blend(old, target, 0), old)
        for amount in [0., 1e-8, .2, 1/3, .5, 2/3, .8, 1.]:
            value = p.sparse_blend(old, target, amount)
            self.assertLessEqual(len(value), 4)
            self.assertAlmostEqual(sum(value.values()), 1.)
            self.assertTrue(all(weight > 0 for weight in value.values()))
            nearby = p.sparse_blend(old, target, min(1., amount+1e-8))
            self.assertLess(sum(abs(value.get(name, 0)-nearby.get(name, 0)) for name in set(value)|set(nearby)), 1e-6)
        # Fourth/fifth ties disappear together, not via arbitrary name ordering.
        tied = p.sparse_blend({'a': .5, 'b': .25, 'c': .25}, {'a': .5, 'd': .25, 'e': .25}, .5)
        self.assertEqual(tied, {'a': 1.})
        with self.assertRaisesRegex(ValueError, 'Degenerate'):
            p.sparse_blend({'a': .4, 'b': .4, 'c': .2}, {'c': .2, 'd': .4, 'e': .4}, .5)


    def test_declared_palm_ik_preserves_lengths_and_original_reference(self):
        for frame in p.frames('push-up', contact_adjustment=True):
            self.assertEqual(frame['joints'], p.canonical('push-up', frame['time']))
            for side in ('left', 'right'):
                arm, elbow, hand = [side+'_'+part for part in ('upper_arm', 'forearm', 'hand')]
                old = frame['joints']
                new = {**old, **frame['contactJoints']}
                self.assertAlmostEqual(new[hand]['position'][1]-old[hand]['position'][1], -.011, places=8)
                for a, b in ((arm, elbow), (elbow, hand)):
                    self.assertAlmostEqual(math.dist(old[a]['position'], old[b]['position']), math.dist(new[a]['position'], new[b]['position']), places=8)
                self.assertEqual(frame['morphWeights'], p.corrective_weights(new))

    def test_exact_three_canonical_exercises_are_nonstatic_and_loop(self):
        for exercise in p.EXERCISES:
            frames = p.frames(exercise)
            self.assertEqual(len(frames), 121)
            self.assertEqual(frames[-1]['time'], 4)
            first, peak, last = [frames[i]['joints'] for i in (0, 60, 120)]
            movement = 0
            for name in first:
                self.assertLess(math.dist(first[name]['position'], last[name]['position']), 1e-9)
                movement = max(movement, math.dist(first[name]['position'], peak[name]['position']))
                self.assertAlmostEqual(sum(v*v for v in peak[name]['rotation']), 1, places=8)
            self.assertGreater(movement, .1)

    def test_canonical_contacts_preserved_before_retarget(self):
        for exercise in p.EXERCISES:
            fs = p.frames(exercise)
            names = ['left_foot', 'right_foot'] + (['left_hand', 'right_hand'] if exercise == 'push-up' else [])
            for name in names:
                self.assertLess(max(math.dist(f['joints'][name]['position'], fs[0]['joints'][name]['position']) for f in fs), 1e-8)

    def test_correctives_are_derived_from_pose_not_rep_phase(self):
        rest = {name: {'position': point, 'rotation': p.k.IDENTITY} for name, _, point in p.legacy.BONES}
        self.assertEqual(p.corrective_weights(rest), {'shoulder-elevation-patch': 0, 'hip-flexion-patch': 0})
        squat = p.frames('bodyweight-squat')
        self.assertGreater(squat[60]['morphWeights']['hip-flexion-patch'], squat[0]['morphWeights']['hip-flexion-patch'])
        for exercise in p.EXERCISES:
            for frame in p.frames(exercise):
                self.assertTrue(all(0 <= w <= 1 for w in frame['morphWeights'].values()))

    def test_sparse_joint_order_stable_across_process_hash_seeds(self):
        script = f"import runpy,json; w=runpy.run_path({str(HERE/'shoulder_weights.py')!r}); print(json.dumps(list(w['sparse_handoff']({{'spine':.4,'pelvis':.3,'neck':.2,'head':.1}},{{'chest':.1,'left_clavicle':.2,'left_upper_arm':.6,'left_forearm':.1}},.8))))"
        results = [subprocess.check_output([sys.executable, '-c', script], env={**os.environ, 'PYTHONHASHSEED': str(seed)}, text=True) for seed in (1, 2, 47)]
        self.assertEqual(len(set(results)), 1)
        self.assertEqual(json.loads(results[0]), sorted(json.loads(results[0])))
