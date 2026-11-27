"""Read-only canonical catalog adapter and immutable processed-body contract."""
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PILOT = HERE / 'exercise-pilot'
FIRST = ('reverse-lunge', 'standing-calf-raise', 'lateral-lunge')
EXISTING = ('bodyweight-squat', 'push-up', 'dumbbell-shoulder-press')
CACHE_SHA = '18ad766419af8d78a799925932db71af9613f42ed82d7ee621cefb9b04c691af'
BODY_SHA = 'c7b0bcd52e36f0f281cd13e990c65db9907e3a27ee162a1790837d7236a50571'
NATIVE_SHA = 'eb625a1cd87b5ba652b2d9204d6b225f5db0f93a0556a53e5de8f0ff6940800a'
ROOT_OFFSET = (0., -.008360867388546467, 0.)
FPS, DURATION = 30, 4


def load(name):
    spec = importlib.util.spec_from_file_location('catalog_' + name, HERE / (name + '.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


pilot = load('pilot_motion')
k, legacy = pilot.k, pilot.legacy


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def checked_file(root, relative):
    if not re.fullmatch(r'[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*', relative) or any(p in ('.', '..') for p in relative.split('/')):
        raise ValueError('Unsafe input path')
    path = root
    for part in relative.split('/'):
        path = path / part
        if path.is_symlink():
            raise ValueError('Symlink input is not permitted')
    if not path.is_file():
        raise ValueError('Input is not a regular file')
    return path


def verify_hashes(root, expected):
    for relative, sha in expected.items():
        if digest(checked_file(root, relative)) != sha:
            raise ValueError('Immutable input changed: ' + relative)


def input_contract():
    baseline = json.loads((HERE / 'v1-baseline.json').read_text())
    expected = {entry['path']: entry['sha256'] for entry in baseline['files']}
    if sum(entry['role'] == 'source' for entry in baseline['files']) != 34:
        raise ValueError('Expected the original 34 source inputs')
    expected.update({
        'pipeline/character-v2/exercise-pilot/source.blend': CACHE_SHA,
        'pipeline/character-v2/exercise-pilot/character.glb': BODY_SHA,
        'pipeline/character-v2/exercise-pilot/native-weight-proof.json': NATIVE_SHA,
    })
    manifest = json.loads((PILOT / 'manifest.json').read_text())
    for file, key in [('build_exercise_pilot.py', 'generatorSha256'), ('pilot_motion.py', 'helperSha256'), ('shoulder_weights.py', 'weightHelperSha256')]:
        expected['pipeline/character-v2/' + file] = manifest[key]
    verify_hashes(ROOT, expected)
    proof = json.loads((PILOT / 'native-weight-proof.json').read_text())
    if proof['sourceBlendSha256'] != CACHE_SHA:
        raise ValueError('Native proof belongs to another cached body')
    return expected


def batch(exercise, profile):
    if exercise in FIRST + EXISTING:
        return 'CV2-09ALL-01'
    if profile.get('equipment') or profile.get('sharedBar') or profile.get('landminePivot'):
        return 'CV2-09ALL-04'
    if profile.get('elasticBand') or profile.get('hangingSupport') or profile.get('wheelSupport'):
        return 'CV2-09ALL-05'
    return 'CV2-09ALL-03' if profile.get('props') or profile.get('finalMotion') else 'CV2-09ALL-02'


def inventory():
    catalog = json.loads((ROOT / 'packages/data/src/exercises.json').read_text())
    ids = [exercise['id'] for exercise in catalog]
    if len(ids) != len(set(ids)) or len(ids) != 100 or set(ids) != set(k._REGISTRY) or set(ids) != set(k.PROFILES):
        raise ValueError('Catalog, source registry and profiles must contain the same 100 unique IDs')
    rows = []
    for exercise in sorted(catalog, key=lambda value: value['id']):
        id = exercise['id']
        profile = k.PROFILES[id]
        source = Path(k._REGISTRY[id].__code__.co_filename).relative_to(ROOT).as_posix()
        clip, kind = profile.get('clip', 'rep'), profile.get('kind', 'repetition')
        if clip != exercise['animation']['clip'] or kind != exercise['animation'].get('kind', 'repetition'):
            raise ValueError('Source/catalog clip identity mismatch')
        rows.append({'id': id, 'batch': batch(id, profile), 'clip': clip, 'kind': kind,
                     'source': source, 'sourceSha256': digest(ROOT / source), 'profileSha256': canonical_hash(profile),
                     'v1File': 'assets/' + exercise['animation']['file'],
                     'v1Sha256': digest(ROOT / 'assets' / exercise['animation']['file']),
                     'status': 'existing-pilot' if id in EXISTING else 'pending',
                     'humanApproval': False, 'anatomicalValidation': False})
    return rows


def canonical(exercise, time):
    if exercise not in k.PROFILES or not math.isfinite(time) or not 0 <= time <= DURATION:
        raise ValueError('Unknown exercise or sample time')
    bones = k.enhanced_bones(legacy.BONES) if k.PROFILES[exercise].get('rig') == 'upper-quarter-v2' else legacy.BONES
    points, rotations = k.forward(bones, k.motion_pose(bones, time, exercise, legacy.pose))
    if not all(math.isfinite(value) for row in points + rotations for value in row):
        raise ValueError('Non-finite canonical pose')
    return {bone[0]: {'position': points[index], 'rotation': rotations[index]} for index, bone in enumerate(bones)}


def frames(exercise):
    result = []
    for index in range(FPS * DURATION + 1):
        time = index / FPS
        joints = canonical(exercise, time)
        markers = {}
        for name in k.PROFILES[exercise].get('pivots', []):
            foot = joints[name.replace('forefoot', 'foot')]
            markers[name] = k.add(foot['position'], k.rotate((0., -.095, .125), foot['rotation']))
        result.append({'time': time, 'joints': joints, 'markers': markers,
                       'morphWeights': pilot.corrective_weights(joints)})
    return result
