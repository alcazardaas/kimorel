"""Isolated real exercise pilot. Parent executes pinned native Blender, never v1 writes."""
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = Path(__file__).resolve().parent
OUT = HERE / 'exercise-pilot'


def module(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name+'.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


p = module('pilot_motion')
s = module('build_shoulder_refinement')
C = Matrix.Rotation(math.pi/2, 4, 'X')  # canonical(x,y,z) -> Blender(x,-z,y)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rotation(q):
    return C @ Quaternion((q[3], q[0], q[1], q[2])).to_matrix().to_4x4() @ C.inverted()


def point(v):
    return C.to_3x3() @ Vector(v)


def clear_animation(mesh, rig):
    for owner in (rig, mesh.data.shape_keys):
        owner.animation_data_clear()
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    for key in mesh.data.shape_keys.key_blocks:
        key.value = 0.
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()


def select_export(mesh, rig, props=()):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in (mesh, rig, *props):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig


def export(path, mesh, rig, props=(), animated=True):
    select_export(mesh, rig, props)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format='GLB', use_selection=True,
        export_yup=True, export_skins=True, export_animations=animated,
        export_animation_mode='ACTIONS', export_force_sampling=True,
        export_influence_nb=4, export_extras=True, export_morph=True,
        export_morph_normal=True, export_frame_range=True,
        export_copyright='Original experimental exercise retarget; CC0-1.0; needs-review')
    restore_file(path, native_records(mesh, rig))


def native_records(mesh, rig):
    names = {group.index: group.name for group in mesh.vertex_groups}
    bones = {bone.name for bone in rig.data.bones}
    records = []
    for vertex in mesh.data.vertices:
        position = s.base.g.gltf_point(tuple(vertex.co))
        weights = {names[g.group]: g.weight for g in vertex.groups if names[g.group] in bones and g.weight > 0}
        active = p.arm_partition(position)[1] > 0 and (p.proximal_palm_support(position) > 0 or not any(name.rsplit('_', 1)[-1].isdigit() for name in weights))
        records.append({'position': position, 'weights': weights, 'active': active})
    return records


def restore_file(path, records):
    result, report = p.restore_export_weights(path.read_bytes(), records)
    path.write_bytes(result)
    return report


def write_native_proof(mesh, rig):
    proof = {'schemaVersion': 'kimorel.native-weight-proof/v1-draft',
             'sourceBlendSha256': digest(OUT/'source.blend'),
             'generatorSha256': digest(Path(__file__)), 'helperSha256': digest(HERE/'pilot_motion.py'),
             'records': native_records(mesh, rig)}
    path = OUT/'native-weight-proof.json'
    path.write_text(json.dumps(proof, separators=(',', ':'), sort_keys=True)+'\n')
    return {'file': 'native-weight-proof.json', 'sha256': digest(path), 'sourceBlendSha256': proof['sourceBlendSha256']}


def finish_manifest(manifest, protected):
    assert all(digest(Path(file)) == sha for file, sha in protected.items()), 'Historical asset changed'
    manifest.update(generatorSha256=digest(Path(__file__)), helperSha256=digest(HERE/'pilot_motion.py'),
                    nativeWeightProofSha256=digest(OUT/'native-weight-proof.json'),
                    files={f.name: {'bytes': f.stat().st_size, 'sha256': digest(f)} for f in sorted(OUT.iterdir()) if f.suffix in ('.glb', '.blend', '.png')})
    (OUT/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')


def restore_failed_export(manifest):
    assert digest(OUT/'manifest.json') == '195cc36c323ba490e50167b987f8305ce6d33b1c0894f1f8eb1c549f5e04249e', 'Restore requires exact failed manifest'
    assert manifest['generatorSha256'] == '51a5ae72c714f031058136d0a4436509faeb63883670c58af34742a872496a32'
    assert manifest['helperSha256'] == '0b6c9dfd8f82fd1d132b71badc36c7a38a12b38f2cf1c1ae55c02e5be0d3fef0'
    assert manifest['humanApproval'] is False
    assert digest(OUT/'retarget-contract.json') == '247761a558bfee1ecbfa748fd22c3075057b1d33880237c3b9204bae06081586', 'Failed retarget contract changed'
    assert all(digest(OUT/name) == info['sha256'] for name, info in manifest['files'].items()), 'Failed export snapshot changed'
    protected = protected_assets()
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'source.blend'))
    mesh, rig = bpy.data.objects['connected-deformation-draft'], bpy.data.objects['character-v2-rig']
    reference = write_native_proof(mesh, rig)
    records = native_records(mesh, rig)
    reports = {name: restore_file(OUT/name, records) for name in ['character.glb']+[exercise+'.glb' for exercise in p.EXERCISES]}
    contract = json.loads((OUT/'retarget-contract.json').read_text())
    contract['nativeWeightProof'] = reference
    (OUT/'retarget-contract.json').write_text(json.dumps(contract, indent=2)+'\n')
    for exercise in p.EXERCISES:
        render_proof(exercise)
    finish_manifest(manifest, protected)
    print('EXERCISE_PILOT_WEIGHTS_RESTORED', json.dumps(reports))


def protected_assets():
    result = {str(f): digest(f) for f in (HERE.parent.parent/'assets').rglob('*') if f.is_file()}
    for directory in ['correctives', 'deformation', 'prototype', 'shoulder-refinement', 'masks', 'muscles-upper-arm-draft']:
        result.update({str(f): digest(f) for f in (HERE/directory).rglob('*') if f.is_file()})
    return result


def depth(bone):
    return 0 if bone.parent is None else 1+depth(bone.parent)


def desired_pose(rig, frame, grip, root_offset):
    desired = {}
    joints = {**frame['joints'], **frame.get('contactJoints', {})}
    # Evaluate parents before children, never rely on node index or dictionary order.
    for bone in sorted(rig.data.bones, key=lambda b: (depth(b), b.name)):
        rest = bone.matrix_local
        if bone.name in joints:
            data = joints[bone.name]
            desired[bone.name] = Matrix.Translation(point(p.k.add(data['position'], root_offset))) @ rotation(data['rotation']) @ rest.to_quaternion().to_matrix().to_4x4()
        elif bone.name.endswith('_clavicle'):
            # Legacy no-clavicle motions inherit the chest; preserve the v2 pivot.
            desired[bone.name] = desired[bone.parent.name] @ bone.parent.matrix_local.inverted() @ rest
        else:
            local = bone.parent.matrix_local.inverted() @ rest
            desired[bone.name] = desired[bone.parent.name] @ local @ grip.get(bone.name, Matrix.Identity(4))
    for bone in sorted(rig.data.bones, key=lambda b: (depth(b), b.name)):
        pb = rig.pose.bones[bone.name]
        if bone.parent:
            local_rest = bone.parent.matrix_local.inverted() @ bone.matrix_local
            basis = local_rest.inverted() @ desired[bone.parent.name].inverted() @ desired[bone.name]
        else:
            basis = bone.matrix_local.inverted() @ desired[bone.name]
        pb.matrix_basis = basis
    bpy.context.view_layer.update()
    return desired


def dumbbells():
    positions, _, indices = p.legacy.dumbbell_geometry()
    data = bpy.data.meshes.new('pilot-canonical-dumbbell')
    data.from_pydata([point(v) for v in positions], [], [indices[i:i+3] for i in range(0, len(indices), 3)])
    material = bpy.data.materials.new('pilot-rigid-equipment')
    material.diffuse_color = (.09, .11, .13, 1)
    data.materials.append(material)
    result = []
    for side in ('left', 'right'):
        obj = bpy.data.objects.new(side+'_hand_dumbbell', data)
        bpy.context.collection.objects.link(obj)
        result.append(obj)
    return result


def make_action(mesh, rig, exercise, grip, root_offset):
    scene = bpy.context.scene
    scene.render.fps, scene.frame_start, scene.frame_end = p.FPS, 0, 120
    action = bpy.data.actions.new('rep')
    action.use_fake_user = True
    owners = [rig, mesh.data.shape_keys]
    props = dumbbells() if exercise == 'dumbbell-shoulder-press' else []
    owners += props
    for owner in owners:
        owner.animation_data_create().action = action
        owner.animation_data.action_slot = action.slots.new(owner.id_type, owner.name)
    source_frames = p.frames(exercise, contact_adjustment=True)
    for i, frame in enumerate(source_frames):
        scene.frame_set(i)
        desired_pose(rig, frame, grip if props else {}, root_offset)
        for pb in rig.pose.bones:
            pb.rotation_mode = 'QUATERNION'
            # Insert AFTER decomposition to the evaluated pose local basis.
            for path in ('location', 'rotation_quaternion', 'scale'):
                pb.keyframe_insert(data_path=path, frame=i)
        for name, value in frame['morphWeights'].items():
            key = mesh.data.shape_keys.key_blocks[name]
            key.value = value
            key.keyframe_insert(data_path='value', frame=i)
        for obj, side, sign in zip(props, ('left', 'right'), (1, -1)):
            hand = frame['joints'][side+'_hand']
            center = p.k.add(p.k.add(hand['position'], root_offset), p.k.rotate((sign*.02, -.055, .005), hand['rotation']))
            obj.matrix_world = Matrix.Translation(point(center)) @ rotation(hand['rotation'])
            obj.rotation_mode = 'QUATERNION'
            for path in ('location', 'rotation_quaternion'):
                obj.keyframe_insert(data_path=path, frame=i)
    # glTF uses linear frame samples, no Bezier overshoot between authored keys.
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = 'LINEAR'
    keys = mesh.data.shape_keys
    track = keys.animation_data.nla_tracks.new()
    track.name = 'rep'
    nla = track.strips.new('rep', 0, action)
    nla.action_slot = keys.animation_data.action_slot
    track.mute = True
    keys.animation_data.action = None
    scene.frame_set(0)
    return props, source_frames


def setup_scene(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    bpy.ops.import_scene.gltf(filepath=str(path))
    owners = list(bpy.context.scene.objects)
    owners += [obj.data.shape_keys for obj in bpy.context.scene.objects if obj.type == 'MESH' and obj.data.shape_keys]
    for owner in owners:
        animation = owner.animation_data
        if animation and animation.nla_tracks:
            strips = [strip for track in animation.nla_tracks for strip in track.strips if strip.action is not None and strip.action_slot is not None]
            if not strips:
                continue
            action, slot = strips[0].action, strips[0].action_slot
            for track in animation.nla_tracks:
                track.mute = True
            animation.action = action
            animation.action_slot = slot
    s.base.OUT = OUT
    s.base.setup_render()
    bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = 480, 480


def proof_points():
    bpy.context.scene.frame_set(61)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            evaluated = obj.evaluated_get(depsgraph)
            geometry = evaluated.to_mesh()
            points.extend(evaluated.matrix_world @ vertex.co for vertex in geometry.vertices)
            evaluated.to_mesh_clear()
    return points


def floor_grid():
    # Blender Z=0 corresponds to canonical Y=0; only a reference, never a body offset.
    vertices, faces = [], []
    for index in range(-12, 13):
        value, half = index*.25, .001
        for axis in (0, 1):
            start = len(vertices)
            vertices.extend([(value-half, -3., 0.), (value+half, -3., 0.),
                             (value+half, 3., 0.), (value-half, 3., 0.)] if axis == 0 else
                            [(-3., value-half, 0.), (3., value-half, 0.),
                             (3., value+half, 0.), (-3., value+half, 0.)])
            faces.append(tuple(range(start, start+4)))
    data = bpy.data.meshes.new('floor-datum-grid')
    data.from_pydata(vertices, [], faces)
    obj = bpy.data.objects.new('floor-datum-grid-Y0', data)
    bpy.context.collection.objects.link(obj)
    material = bpy.data.materials.new('floor-datum-subtle')
    material.diffuse_color = (.19, .21, .23, 1.)
    data.materials.append(material)


def render_proof(exercise):
    paths = [('v1', HERE.parent.parent/'assets/exercises'/f'{exercise}.glb'), ('v2', OUT/f'{exercise}.glb')]
    # Fit the UNION of evaluated v1/v2 body and prop surfaces, giving each pair
    # exactly the same view basis, target and orthographic scale.
    points = []
    for _, path in paths:
        setup_scene(path)
        points.extend(proof_points())
    fits = {}
    center = sum(points, Vector())/len(points)
    for view, direction in [('front', Vector((0, -1, .08))), ('side', Vector((1, 0, .08))), ('quarter', Vector((.6, -.8, .12)))]:
        direction.normalize()
        rotation = (-direction).to_track_quat('-Z', 'Y')
        right, up = rotation @ Vector((1, 0, 0)), rotation @ Vector((0, 1, 0))
        xs, ys = [point.dot(right) for point in points], [point.dot(up) for point in points]
        target = center+right*((min(xs)+max(xs))/2-center.dot(right))+up*((min(ys)+max(ys))/2-center.dot(up))
        scale = max(max(xs)-min(xs), max(ys)-min(ys))*1.25+.15
        fits[view] = (target+direction*5, target, scale)
    names = []
    for version, path in paths:
        setup_scene(path)
        floor_grid()
        for view, (position, target, scale) in fits.items():
            bpy.context.scene.frame_set(61)
            camera = s.base.stage.base.camera(position, target, scale, 'pilot-review')
            bpy.context.view_layer.update()
            caption, data = s.caption(version.upper()+' / '+view.upper(), camera)
            name = exercise+'-'+version+'-'+view
            bpy.context.scene.render.filepath = str(OUT/(name+'.png'))
            bpy.ops.render.render(write_still=True)
            bpy.data.objects.remove(caption, do_unlink=True)
            bpy.data.curves.remove(data)
            names.append(name)
    # Read the actual image dimensions; the older sheet helper has a fixed
    # 480x600 layout and cannot compose this independent square review sheet.
    from array import array
    sources = [bpy.data.images.load(str(OUT/(name+'.png')), check_existing=False) for name in names]
    width, height = sources[0].size
    assert all(tuple(source.size) == (width, height) for source in sources)
    columns, rows = 3, 2
    image = bpy.data.images.new(exercise+'-comparison', width=width*columns, height=height*rows)
    pixels = array('f', [0.])*(width*height*columns*rows*4)
    for index, source in enumerate(sources):
        sample = array('f', [0.])*(width*height*4)
        source.pixels.foreach_get(sample)
        column, row = index % columns, rows-1-index//columns
        for y in range(height):
            offset = ((row*height+y)*width*columns+column*width)*4
            pixels[offset:offset+width*4] = sample[y*width*4:(y+1)*width*4]
        bpy.data.images.remove(source)
    image.pixels.foreach_set(pixels)
    image.filepath_raw, image.file_format = str(OUT/(exercise+'-comparison.png')), 'PNG'
    image.save()
    bpy.data.images.remove(image)


def main():
    assert bpy.app.version[:3] == (5, 2, 4), 'Pinned Blender5.2.4 required'
    OUT.mkdir(exist_ok=True)
    if (OUT/'manifest.json').exists():
        manifest = json.loads((OUT/'manifest.json').read_text())
        if '--restore-export-weights' in sys.argv:
            assert '--repeat' not in sys.argv and '--rebuild-failed-pilot' not in sys.argv
            restore_failed_export(manifest)
            return
        if '--rebuild-failed-pilot' in sys.argv:
            assert manifest['humanApproval'] is False
            assert manifest['generatorSha256'] == '08e686f8ed4ff89665c606d356221a012ed5812645ea7cb902b1e894c2e8a381', 'Only the identified failed visual candidate may be rebuilt'
        else:
            assert '--repeat' in sys.argv, 'Completed pilot requires explicit same-source --repeat'
            assert manifest['generatorSha256'] == digest(Path(__file__)), 'Repeat source changed; use a new variant'
            assert manifest['helperSha256'] == digest(HERE/'pilot_motion.py'), 'Repeat helper changed'
    protected = protected_assets()
    bpy.ops.wm.open_mainfile(filepath=str(HERE/'correctives/source.blend'))
    mesh, rig = bpy.data.objects['connected-deformation-draft'], bpy.data.objects['character-v2-rig']
    neutral = [tuple(v.co) for v in mesh.data.vertices]
    topology = [tuple(face.vertices) for face in mesh.data.polygons]
    s.base.select_action(rig, None, bpy.data.actions['hand-closure'], 31)
    grip = {b.name: b.matrix_basis.copy() for b in rig.pose.bones if b.name.rsplit('_', 1)[-1].isdigit()}
    group_names = {group.index: group.name for group in mesh.vertex_groups}
    bone_names = {bone.name for bone in rig.data.bones}
    original = [{group_names[group.group]: group.weight for group in vertex.groups if group_names[group.group] in bone_names} for vertex in mesh.data.vertices]
    points = [s.base.g.gltf_point(tuple(vertex.co)) for vertex in mesh.data.vertices]
    refined, arm_field = p.whole_arm_field(points, [tuple(edge.vertices) for edge in mesh.data.edges], original)
    changed = arm_field['changedVertices']
    for i, value in enumerate(refined):
        if value == original[i]:
            continue
        for name in original[i]:
            mesh.vertex_groups[name].remove([i])
        for name, weight in value.items():
            mesh.vertex_groups[name].add([i], weight, 'REPLACE')
    foot_changed = 0
    bone_names = {bone.name for bone in rig.data.bones}
    group_names = {group.index: group.name for group in mesh.vertex_groups}
    # Actual bind-space foot surface, not the ankle's dominant influence. Blend
    # rigid sole ownership to existing calf weights through a declared collar.
    for vertex in mesh.data.vertices:
        x, y, _ = s.base.g.gltf_point(tuple(vertex.co))
        amount = 1-s.w.smoothstep(.13, .25, y)
        if amount <= 0:
            continue
        original = {group_names[group.group]: group.weight for group in vertex.groups if group_names[group.group] in bone_names}
        target = ('left' if x > 0 else 'right')+'_foot'
        values = {name: (1-amount)*value for name, value in original.items()}
        values[target] = values.get(target, 0)+amount
        assert len([value for value in values.values() if value > 0]) <= 4
        total = sum(values.values())
        for name in original:
            mesh.vertex_groups[name].remove([vertex.index])
        for name in sorted(values):
            if values[name] > 0:
                mesh.vertex_groups[name].add([vertex.index], values[name]/total, 'REPLACE')
        foot_changed += 1
    correction = s.rebuild_shoulder(mesh, rig, bpy.data.actions['shoulder-elevation'])
    shoulder = mesh.data.shape_keys.key_blocks['shoulder-elevation-patch']
    shoulder_deltas, shoulder_regularization = p.regularize_displacements(
        neutral, [tuple(edge.vertices) for edge in mesh.data.edges],
        [tuple(shoulder.data[i].co-vertex.co) for i, vertex in enumerate(mesh.data.vertices)])
    for i, delta in enumerate(shoulder_deltas):
        shoulder.data[i].co = mesh.data.vertices[i].co+Vector(delta)
    hip = mesh.data.shape_keys.key_blocks['hip-flexion-patch']
    hip_deltas = [tuple(hip.data[i].co-vertex.co) for i, vertex in enumerate(mesh.data.vertices)]
    hip_deltas, hip_regularization = p.regularize_displacements(
        neutral, [tuple(edge.vertices) for edge in mesh.data.edges], hip_deltas)
    for i, delta in enumerate(hip_deltas):
        hip.data[i].co = mesh.data.vertices[i].co+Vector(delta)
    assert neutral == [tuple(v.co) for v in mesh.data.vertices]
    assert topology == [tuple(face.vertices) for face in mesh.data.polygons]
    clear_animation(mesh, rig)
    root_offset = (0., -min(s.base.g.gltf_point(tuple(v.co))[1] for v in mesh.data.vertices), 0.)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source.blend'))
    native_proof = write_native_proof(mesh, rig)
    export(OUT/'character.glb', mesh, rig, animated=False)
    contract = {'schemaVersion': 'kimorel.exercise-pilot/v1-draft', 'nativeWeightProof': native_proof, 'status': 'needs-anatomy-and-contact-review', 'humanApproval': False,
                'anatomicalValidation': False, 'durationSeconds': 4, 'fps': 30, 'coordinateBasis': 'meters +Yup +Zforward',
                'method': 'canonical semantic world pose converted through exact v2 rest and parent bases; added digits inherit hand with draft closed press grip',
                'contactCorrection': {'rootOffsetMeters': root_offset, 'reason': 'Align actual neutral sole minimum with floor datum without changing joint-relative motion',
                                      'footWeightCollarY': [.13, .25], 'footWeightVertices': foot_changed, 'wholeArmField': arm_field, 'shoulderDisplacementRegularization': shoulder_regularization, 'hipDisplacementRegularization': hip_regularization,
                                      'pushUpPalmTargetDeltaMeters': [0., -.011, 0.], 'pushUpMethod': 'Two-bone IK preserves arm lengths; original and adjusted semantic poses both retained'}, 'exercises': {}}
    for exercise in p.EXERCISES:
        bpy.ops.wm.open_mainfile(filepath=str(OUT/'source.blend'))
        mesh, rig = bpy.data.objects['connected-deformation-draft'], bpy.data.objects['character-v2-rig']
        props, frames = make_action(mesh, rig, exercise, grip, root_offset)
        export(OUT/f'{exercise}.glb', mesh, rig, props)
        contract['exercises'][exercise] = {'clip': 'rep', 'file': f'{exercise}.glb', 'canonicalFrames': frames,
                                          'equipment': 'two original rigid dumbbells' if props else 'none'}
    (OUT/'retarget-contract.json').write_text(json.dumps(contract, indent=2)+'\n')
    for exercise in p.EXERCISES:
        render_proof(exercise)
    assert all(digest(Path(file)) == sha for file, sha in protected.items()), 'Historical asset changed'
    manifest = {'status': 'experimental-pilot-needs-review', 'humanApproval': False, 'anatomicalValidation': False,
                'sourceLicense': 'CC0-1.0', 'changedWeightVertices': changed, 'shoulderCorrection': correction,
                'generatorSha256': digest(Path(__file__)), 'helperSha256': digest(HERE/'pilot_motion.py'),
                'weightHelperSha256': digest(HERE/'shoulder_weights.py'), 'toolchain': {'blender': bpy.app.version_string, 'buildHash': bpy.app.build_hash.decode()},
                'inputSource': {'file': 'correctives/source.blend', 'sha256': digest(HERE/'correctives/source.blend')},
                'limitations': ['Draft anatomy/topology and combined-pose correctives not accepted', 'No physical device acceptance', 'No default viewer or v1 registry replacement'],
                'files': {f.name: {'bytes': f.stat().st_size, 'sha256': digest(f)} for f in sorted(OUT.iterdir()) if f.suffix in ('.glb', '.blend', '.png')}}
    finish_manifest(manifest, protected)
    print('EXERCISE_PILOT_COMPLETE', changed, json.dumps(correction))


if __name__ == '__main__':
    main()
