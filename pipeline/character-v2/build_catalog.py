"""Non-overwriting first catalog batch; parent runs pinned native Blender."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys

import bpy
from mathutils import Matrix

HERE = Path(__file__).resolve().parent


def module(name):
    spec = importlib.util.spec_from_file_location('catalog_export_' + name, HERE / (name + '.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


c = module('catalog_motion')
p = module('build_exercise_pilot')
g = module('groin_weights')
OUT = HERE / 'catalog-v2-groin-1'


def action(mesh, rig, exercise, clip):
    scene = bpy.context.scene
    scene.render.fps, scene.frame_start, scene.frame_end = c.FPS, 0, 120
    animation = bpy.data.actions.new(clip)
    animation.use_fake_user = True
    for owner in (rig, mesh.data.shape_keys):
        owner.animation_data_create().action = animation
        owner.animation_data.action_slot = animation.slots.new(owner.id_type, owner.name)
    markers = {}
    for name in c.k.PROFILES[exercise].get('pivots', []):
        markers[name] = bpy.data.objects.new(name, None)
        bpy.context.collection.objects.link(markers[name])
        markers[name].animation_data_create().action = animation
        markers[name].animation_data.action_slot = animation.slots.new('OBJECT', name)
    for index, frame in enumerate(c.frames(exercise)):
        scene.frame_set(index)
        p.desired_pose(rig, frame, {}, c.ROOT_OFFSET)
        for bone in rig.pose.bones:
            bone.rotation_mode = 'QUATERNION'
            for path in ('location', 'rotation_quaternion', 'scale'):
                bone.keyframe_insert(data_path=path, frame=index)
        for name, value in frame['morphWeights'].items():
            key = mesh.data.shape_keys.key_blocks[name]
            key.value = value
            key.keyframe_insert(data_path='value', frame=index)
        for name, obj in markers.items():
            obj.matrix_world = Matrix.Translation(p.point(c.k.add(frame['markers'][name], c.ROOT_OFFSET)))
            obj.keyframe_insert(data_path='location', frame=index)
    for layer in animation.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = 'LINEAR'
    keys = mesh.data.shape_keys
    track = keys.animation_data.nla_tracks.new()
    track.name = clip
    nla = track.strips.new(clip, 0, animation)
    nla.action_slot = keys.animation_data.action_slot
    track.mute = True
    keys.animation_data.action = None
    scene.frame_set(0)
    return list(markers.values())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-sha', required=True)
    parser.add_argument('--adapter-sha', required=True)
    parser.add_argument('--field-sha', required=True)
    parser.add_argument('--ids', nargs='+', choices=c.FIRST + c.EXISTING, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if (args.source_sha != c.digest(Path(__file__)) or args.adapter_sha != c.digest(HERE / 'catalog_motion.py') or
            args.field_sha != c.digest(HERE / 'groin_weights.py')):
        raise ValueError('Source-ready snapshot changed')
    if len(set(args.ids)) != len(args.ids):
        raise ValueError('Duplicate export IDs')
    protected = c.input_contract()
    # Also preserve every existing pilot artifact, not just the frozen v1 corpus.
    protected.update({file.relative_to(c.ROOT).as_posix(): c.digest(file) for file in c.PILOT.iterdir() if file.is_file()})
    protected.update({file.relative_to(c.ROOT).as_posix(): c.digest(file) for file in (HERE / 'catalog-v2').iterdir() if file.is_file()})
    if OUT.exists() or OUT.is_symlink():
        raise FileExistsError('Catalog output exists; no automatic overwrite/retry')
    OUT.mkdir()
    rows = c.inventory()
    if set(args.ids) != set(c.FIRST + c.EXISTING):
        raise ValueError('Derived body requires all six regression exports')
    bpy.ops.wm.open_mainfile(filepath=str(c.PILOT / 'source.blend'))
    mesh, rig = bpy.data.objects['connected-deformation-draft'], bpy.data.objects['character-v2-rig']
    records = p.native_records(mesh, rig)
    points = [record['position'] for record in records]
    original = [record['weights'] for record in records]
    derived, field_report = g.field(points, [tuple(edge.vertices) for edge in mesh.data.edges], original)
    changed = []
    for index, (old, value) in enumerate(zip(original, derived)):
        if old == value:
            continue
        for name in old:
            mesh.vertex_groups[name].remove([index])
        for name, weight in value.items():
            mesh.vertex_groups[name].add([index], weight, 'REPLACE')
        changed.append(index)
    p.clear_animation(mesh, rig)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'source.blend'))
    records = p.native_records(mesh, rig)
    for index in changed:
        records[index]['active'] = True
    proof = {'schema': 'kimorel.groin-native-weights/v1', 'sourceBlendSha256': c.digest(OUT / 'source.blend'),
             'inputSourceBlendSha256': c.CACHE_SHA, 'inputNeutralGlbSha256': c.BODY_SHA,
             'fieldSourceSha256': c.digest(HERE / 'groin_weights.py'), 'field': field_report,
             'records': [{'position': records[i]['position'], 'original': original[i], 'weights': records[i]['weights']} for i in changed]}
    (OUT / 'native-weight-proof.json').write_text(json.dumps(proof, indent=2) + '\n')
    p.export(OUT / 'character.glb', mesh, rig, animated=False)
    p.restore_file(OUT / 'character.glb', records)
    outputs = {}
    for exercise in args.ids:
        bpy.ops.wm.open_mainfile(filepath=str(OUT / 'source.blend'))
        mesh, rig = bpy.data.objects['connected-deformation-draft'], bpy.data.objects['character-v2-rig']
        if len(rig.data.bones) != 50:
            raise ValueError('Expected the pinned 50-joint body')
        row = next(row for row in rows if row['id'] == exercise)
        path = OUT / (exercise + '.glb')
        if exercise in c.EXISTING:
            # Faithful skin replacement retains proven contact IK, grip and all
            # original clip/equipment bytes; no neutral-cache grip reconstruction.
            path.write_bytes((c.PILOT / path.name).read_bytes())
        else:
            markers = action(mesh, rig, exercise, row['clip'])
            p.export(path, mesh, rig, markers)
        p.restore_file(path, records)
        outputs[exercise] = {'file': path.relative_to(c.ROOT).as_posix(), 'sha256': c.digest(path), 'bytes': path.stat().st_size}
        row['status'] = 'exported-needs-independent-qa'
        row['export'] = outputs[exercise]
    # Reuse only the known camera/render functions, never the pilot main/solver.
    p.OUT = OUT
    p.s.base.OUT = OUT
    for exercise in args.ids:
        p.render_proof(exercise)
    c.verify_hashes(c.ROOT, protected)
    manifest = {'schema': 'kimorel.experimental-catalog/v1', 'status': 'exported-needs-independent-qa',
                'humanApproval': False, 'anatomicalValidation': False, 'totalSourceIds': 100,
                'sourceSha256': c.digest(Path(__file__)), 'adapterSha256': c.digest(HERE / 'catalog_motion.py'),
                'bodySourceSha256': c.CACHE_SHA, 'bodyGlbSha256': c.BODY_SHA, 'nativeWeightProofSha256': c.NATIVE_SHA,
                'derivedBody': {'file': 'character.glb', 'sha256': c.digest(OUT / 'character.glb'),
                                'sourceBlendSha256': c.digest(OUT / 'source.blend'),
                                'nativeWeightProofSha256': c.digest(OUT / 'native-weight-proof.json'),
                                'fieldSourceSha256': c.digest(HERE / 'groin_weights.py')},
                'rootOffsetMeters': c.ROOT_OFFSET, 'contactAdjustments': {},
                'toolchain': {'blender': bpy.app.version_string, 'buildHash': bpy.app.build_hash.decode()},
                'inventory': rows, 'exercises': outputs,
                'files': {file.name: {'bytes': file.stat().st_size, 'sha256': c.digest(file)} for file in sorted(OUT.iterdir()) if file.is_file()}}
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('CATALOG_BATCH_EXPORTED', ','.join(args.ids), 'pending independent QA; not 100 complete')


if __name__ == '__main__':
    main()
