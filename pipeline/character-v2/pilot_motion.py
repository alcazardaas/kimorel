"""Canonical semantic pilot motion. No Blender dependency or medical motion claim."""
import importlib.util
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


legacy = load(HERE.parent / 'character' / 'build.py', 'pilot_canonical_source')
k = legacy.motions
EXERCISES = ('bodyweight-squat', 'push-up', 'dumbbell-shoulder-press')
DURATION = 4.
FPS = 30


def canonical(exercise, time):
    if exercise not in EXERCISES:
        raise ValueError('Not a pilot exercise')
    bones = k.enhanced_bones(legacy.BONES) if k.PROFILES[exercise].get('rig') == 'upper-quarter-v2' else legacy.BONES
    pose = k.motion_pose(bones, time, exercise, legacy.pose)
    points, rotations = k.forward(bones, pose)
    return {bone[0]: {'position': points[i], 'rotation': rotations[i]} for i, bone in enumerate(bones)}


def angular_change(rest, rotation):
    moved = k.rotate(rest, rotation)
    return math.acos(max(-1., min(1., k.dot(k.unit(rest), k.unit(moved)))))


def influence(angle, onset, peak):
    t = max(0., min(1., (angle-onset)/(peak-onset)))
    return t*t*(3-2*t)


def corrective_weights(frame):
    """Engineering pose-angle envelope, not activation or clinical ROM."""
    angles = {'shoulder': [], 'hip': []}
    rest = {name: point for name, _, point in legacy.BONES}
    for side in ('left', 'right'):
        for part, child, parent, group in (
            ('upper_arm', 'forearm', 'chest', 'shoulder'),
            ('thigh', 'shin', 'pelvis', 'hip'),
        ):
            name, end = side+'_'+part, side+'_'+child
            relative = k.multiply(k.inverse(frame[parent]['rotation']), frame[name]['rotation'])
            angles[group].append(angular_change(k.sub(rest[end], rest[name]), relative))
    return {
        'shoulder-elevation-patch': influence(max(angles['shoulder']), math.radians(25), math.radians(65)),
        'hip-flexion-patch': influence(max(angles['hip']), math.radians(20), math.radians(55)),
    }


def frames(exercise, contact_adjustment=False):
    result = []
    for i in range(int(DURATION*FPS)+1):
        time = i/FPS
        original = canonical(exercise, time)
        adjusted = original
        changes = {}
        if contact_adjustment and exercise == 'push-up':
            # Initial actual-skin diagnostics found a 10.76 mm maximum palm gap
            # after the sole floor datum. Solve both arm chains to targets 11 mm
            # lower; do not translate just the hand or change limb lengths.
            bones = legacy.BONES
            pose = k.motion_pose(bones, time, exercise, legacy.pose)
            indices = {bone[0]: index for index, bone in enumerate(bones)}
            for side, sign in (('left', 1), ('right', -1)):
                target = add_y(original[side+'_hand']['position'], -.011)
                k.limb(bones, pose, indices[side+'_upper_arm'], target, (sign, 0, -.5), k.axis_x(-math.pi/2))
            points, rotations = k.forward(bones, pose)
            adjusted = {bone[0]: {'position': points[j], 'rotation': rotations[j]} for j, bone in enumerate(bones)}
            changes = {name: adjusted[name] for name in adjusted if name.endswith(('_upper_arm', '_forearm', '_hand'))}
        result.append({'time': time, 'joints': original, 'contactJoints': changes,
                       'morphWeights': corrective_weights(adjusted)})
    return result


def add_y(point, amount):
    return point[0], point[1]+amount, point[2]


def sparse_blend(original, target, amount):
    """Pilot-only continuous four-slot field; no dominant/chest anchor band.

    Subtract the fifth-largest convex weight from every influence. This keeps
    at most four positives and is continuous wherever the residual sum is
    nonzero. A tied five-way uniform field is explicitly unsupported, not
    silently resolved by a discontinuous arbitrary dominant choice.
    """
    if not math.isfinite(amount) or not 0 <= amount <= 1:
        raise ValueError('Invalid blend amount')
    for weights in (original, target):
        if (not weights or len(weights) > 4 or
                any(not math.isfinite(v) or v <= 0 for v in weights.values()) or
                abs(sum(weights.values())-1) > 1e-6):
            raise ValueError('Expected normalized sparse field')
    values = {name: (1-amount)*original.get(name, 0)+amount*target.get(name, 0)
              for name in sorted(set(original) | set(target))}
    ordered = sorted(values.values(), reverse=True)
    cutoff = ordered[4] if len(ordered) > 4 else 0.
    residual = {name: max(0., value-cutoff) for name, value in values.items()}
    total = sum(residual.values())
    if total <= 1e-12:
        raise ValueError('Degenerate tied sparse blend residual')
    return {name: value/total for name, value in residual.items() if value > 0}


def regularize_displacements(points, edges, deltas, limit=2., sweeps=128):
    """Project local displacement gradients, preserving a fixed zero exterior.

    Existing nonzero support plus two mesh rings is the only editable domain.
    This modifies a draft corrective, not activation or neutral geometry.
    """
    active = {i for i, delta in enumerate(deltas) if sum(v*v for v in delta) > 1e-20}
    for _ in range(2):
        active |= {j for a, b in edges for i, j in ((a, b), (b, a)) if i in active}
    value = [list(delta) for delta in deltas]
    constraints = [(a, b, limit*math.dist(points[a], points[b])) for a, b in edges
                   if (a in active or b in active) and math.dist(points[a], points[b]) >= .001]
    for _ in range(sweeps):
        worst = 0.
        for a, b, maximum in constraints:
            delta = [value[a][k]-value[b][k] for k in range(3)]
            length = math.sqrt(sum(v*v for v in delta))
            worst = max(worst, length/maximum)
            if length <= maximum:
                continue
            movable = int(a in active)+int(b in active)
            correction = [(1-maximum/length)*v/movable for v in delta]
            for k in range(3):
                if a in active:
                    value[a][k] -= correction[k]
                if b in active:
                    value[b][k] += correction[k]
        if worst <= 1+1e-7:
            break
    maximum = max((math.dist(value[a], value[b])/math.dist(points[a], points[b])
                   for a, b, _ in constraints), default=0.)
    if maximum > limit*(1+1e-5):
        raise ValueError('Hip displacement gradient did not converge')
    before = sum(sum(v*v for v in delta) for delta in deltas)
    after = sum(sum(v*v for v in delta) for delta in value)
    if before <= 0 or after < before*.2:
        raise ValueError('Hip correction lost meaningful nonzero energy')
    return [tuple(delta) for delta in value], {'maximumGradient': maximum,
            'gradientLimit': limit, 'energyBefore': before, 'energyRatio': after/before, 'supportVertices': len(active)}


def smooth(a, b, value):
    t = max(0., min(1., (value-a)/(b-a)))
    return t*t*(3-2*t)


def segment_distance(point, a, b):
    direction = [b[k]-a[k] for k in range(3)]
    t = max(0., min(1., sum((point[k]-a[k])*direction[k] for k in range(3))/sum(v*v for v in direction)))
    return math.dist(point, [a[k]+t*direction[k] for k in range(3)])


def compact(distance, radius):
    t = min(1., distance/radius)
    return (1-t)**4*(4*t+1)


def arm_partition(point):
    """One C2 compact partition; disjoint clavicle/forearm supports imply <=4."""
    x, y, z = point
    sign, side = (1, 'left') if x >= 0 else (-1, 'right')
    chain = [(sign*.08, 1.43, 0.), (sign*.22, 1.43, 0.),
             (sign*.36, 1.17, 0.), (sign*.43, .94, 0.), (sign*.45, .89, 0.)]
    distances = [segment_distance(point, a, b) for a, b in zip(chain, chain[1:])]
    medial = max(.12, .16-.08*smooth(1.24, 1.38, y))
    arm_gate = smooth(medial, medial+.04, abs(x))*(1-smooth(1.50, 1.54, y))
    radii = (.13, .17, .13, .13)
    raw = {side+'_'+name: compact(distance, radius)*arm_gate
           for name, distance, radius in zip(('clavicle', 'upper_arm', 'forearm', 'hand'), distances, radii)}
    raw['chest'] = compact(segment_distance(point, (0., 1.14, 0.), (0., 1.50, 0.)), .28)
    raw = {name: value for name, value in raw.items() if value > 0}
    total = sum(raw.values())
    if not total:
        return {}, 0.
    amount = (smooth(medial-.04, medial, abs(x))*(1-smooth(.55, .60, abs(x)))
              *smooth(.80, .86, y)*(1-smooth(1.54, 1.62, y))
              *(1-smooth(.18, .24, abs(z)))*(1-smooth(1., 1.3, min(distance/radius for distance, radius in zip(distances, radii)))))
    target = {name: value/total for name, value in raw.items()}
    if len(target) > 4:
        raise ValueError('Compact arm support exceeds four semantic influences')
    return target, amount


def semantic_weights(weights):
    result = {}
    for name, weight in weights.items():
        parts = name.split('_')
        semantic = (parts[0]+'_hand' if parts[-1].isdigit() else name)
        if semantic not in {side+'_'+part for side in ('left', 'right') for part in ('clavicle', 'upper_arm', 'forearm', 'hand')}:
            semantic = 'chest'
        result[semantic] = result.get(semantic, 0.)+weight
    return result


def proximal_palm_support(point):
    """Compact bind-space collar; distal digit articulation stays immutable."""
    x, y, z = point
    return (smooth(.89, .925, y)*(1-smooth(.99, 1.02, y))
            *smooth(.36, .40, abs(x))*(1-smooth(.50, .54, abs(x)))
            *(1-smooth(.07, .11, abs(z))))


def whole_arm_field(points, edges, original, limit=24., sweeps=8192):
    """Replace stitched patches; constrain the entire semantic arm/collar field.

    Distal digit distributions and zero-support exterior are fixed. Trunk
    proportions survive the original collar; only chest is used in the full
    analytic partition. No nearest-four or dominant-anchor election is used.
    """
    if limit <= 0 or sweeps < 1:
        raise ValueError('Invalid whole-arm construction controls')
    active, initial, torso, hands = set(), [], [], []
    for i, (point, old) in enumerate(zip(points, original)):
        target, amount = arm_partition(point)
        if any(name.rsplit('_', 1)[-1].isdigit() for name in old):
            amount *= proximal_palm_support(point)
        value = sparse_blend(old, target, amount) if amount > 0 else dict(old)
        if amount > 0:
            active.add(i)
        initial.append(value)
        hand_parts = {name: weight for name, weight in value.items()
                      if name.endswith('_hand') or name.rsplit('_', 1)[-1].isdigit()}
        total_hand = sum(hand_parts.values())
        hands.append({name: weight/total_hand for name, weight in hand_parts.items()} if total_hand else {})
        trunk = {name: weight for name, weight in value.items() if not name.rsplit('_', 1)[-1].isdigit() and (name not in semantic_weights({name: 1.}) or name == 'chest')}
        total = sum(trunk.values())
        torso.append({name: weight/total for name, weight in trunk.items()} if total else {})
    field = [semantic_weights(value) for value in initial]
    allowed = [set(value) for value in field]
    constraints = [(a, b, limit*math.dist(points[a], points[b])) for a, b in sorted({tuple(sorted(edge)) for edge in edges})
                   if (a in active or b in active) and math.dist(points[a], points[b]) >= .001]
    def distance(a, b):
        return sum(abs(a.get(name, 0.)-b.get(name, 0.)) for name in sorted(set(a)|set(b)))
    for iteration in range(sweeps):
        worst = 0.
        for a, b, maximum in constraints:
            delta = distance(field[a], field[b])
            worst = max(worst, delta/maximum)
            if delta <= maximum:
                continue
            left, right = dict(field[a]), dict(field[b])
            names = sorted(set(left)|set(right))
            difference = {name: left.get(name, 0.)-right.get(name, 0.) for name in names}
            projected = {}
            # Euclidean projection onto the zero-sum L1 ball: positive and
            # negative masses each project to maximum/2, preserving sum=0.
            for sign in (-1, 1):
                values = sorted((sign*value for value in difference.values() if sign*value > 0), reverse=True)
                total, threshold = 0., 0.
                for count, value in enumerate(values, 1):
                    total += value
                    candidate = (total-maximum/2)/count
                    if count == len(values) or candidate >= values[count]:
                        threshold = max(0., candidate)
                        break
                for name, value in difference.items():
                    if sign*value > 0:
                        projected[name] = sign*max(0., sign*value-threshold)
            movable = int(a in active)+int(b in active)
            for i, source, direction in ((a, left, 1), (b, right, -1)):
                if i not in active:
                    continue
                value = {name: source.get(name, 0.)+direction*(projected.get(name, 0.)-difference[name])/movable for name in names}
                # True Euclidean simplex projection, not renormalization, so
                # cyclic convex projections converge without anchor elections.
                ordered = sorted((value.get(name, 0.) for name in allowed[i]), reverse=True)
                total, threshold = 0., 0.
                for count, weight in enumerate(ordered, 1):
                    total += weight
                    candidate = (total-1)/count
                    if count == len(ordered) or candidate >= ordered[count]:
                        threshold = candidate
                        break
                field[i] = {name: max(0., value.get(name, 0.)-threshold) for name in sorted(allowed[i])}
                field[i] = {name: weight for name, weight in field[i].items() if weight > 0}
        if worst <= 1+1e-7:
            break
    gradient = max((distance(field[a], field[b])/math.dist(points[a], points[b]) for a, b, _ in constraints), default=0.)
    if gradient > limit*(1+1e-4):
        worst = max(constraints, key=lambda edge: distance(field[edge[0]], field[edge[1]])/math.dist(points[edge[0]], points[edge[1]]))
        a, b, _ = worst
        raise ValueError('Whole-arm gradient constraint did not converge: '+repr((gradient, a, b, points[a], points[b], field[a], field[b], a in active, b in active)))
    result = [dict(value) for value in original]
    for i in sorted(active):
        value = {name: weight for name, weight in field[i].items() if name != 'chest'}
        if hands[i]:
            side = 'left' if points[i][0] > 0 else 'right'
            hand_mass = value.pop(side+'_hand', 0.)
            for name, proportion in hands[i].items():
                value[name] = hand_mass*proportion
        for name, proportion in torso[i].items():
            value[name] = field[i].get('chest', 0.)*proportion
        value = {name: weight for name, weight in value.items() if weight > 0}
        if len(value) > 4 or abs(sum(value.values())-1) > 1e-6:
            raise ValueError('Invalid reconstructed compact arm skin field')
        result[i] = value
    return result, {'changedVertices': sum(value != old for value, old in zip(result, original)),
                    'proximalPalm': {'criterion': 'bind-space C1 collar: Y .89/.925/.99/1.02; absX .36/.40/.50/.54; absZ .07/.11; zero distal Y<=.89',
                       'changedDigitVertexIndices': [i for i, (old, new) in enumerate(zip(original, result))
                           if old != new and any(name.rsplit('_', 1)[-1].isdigit() for name in old)],
                       'distalDigitVerticesPreserved': sum(proximal_palm_support(point) == 0 and any(name.rsplit('_', 1)[-1].isdigit() for name in old)
                           for point, old in zip(points, original))},
                    'supportVertices': len(active), 'projectionSweeps': iteration+1, 'maximumSemanticGradient': gradient,
                    'gradientLimit': limit, 'compactRadiiMeters': [.13, .17, .13, .13], 'trunkRadiusMeters': .28}


def restore_export_weights(data, records):
    """Faithful four-slot skin export; preserve every other GLB byte exactly."""
    import json
    import struct
    import hashlib
    def require(condition, message):
        if not condition:
            raise ValueError(message)
    require(struct.unpack_from('<III', data) == (0x46546c67, 2, len(data)), 'Invalid pinned GLB header')
    size, kind = struct.unpack_from('<II', data, 12)
    require(kind == 0x4e4f534a, 'Missing GLB JSON')
    doc = json.loads(data[20:20+size])
    binary = 28+size
    length, kind = struct.unpack_from('<II', data, 20+size)
    require(kind == 0x004e4942 and binary+length == len(data), 'Invalid pinned GLB binary')
    nodes = [node for node in doc['nodes'] if 'skin' in node]
    require(len(nodes) == 1, 'Expected one native body skin')
    node = nodes[0]
    primitives = doc['meshes'][node['mesh']]['primitives']
    require(len(primitives) == 1, 'Expected one native body primitive')
    attrs = primitives[0]['attributes']
    def layout(name, component, shape, width):
        a = doc['accessors'][attrs[name]]
        require(a['componentType'] in component and a['type'] == shape and not a.get('normalized') and 'sparse' not in a, 'Unsupported pinned skin accessor '+name)
        view = doc['bufferViews'][a['bufferView']]
        require(view.get('buffer', 0) == 0, 'External skin buffer')
        scalar = {5121: 1, 5123: 2, 5126: 4}[a['componentType']]
        stride = view.get('byteStride', scalar*width)
        offset = binary+view.get('byteOffset', 0)+a.get('byteOffset', 0)
        require(stride >= scalar*width and offset+(a['count']-1)*stride+scalar*width <= binary+view.get('byteOffset', 0)+view['byteLength'], 'Invalid skin accessor bounds')
        return a, offset, stride, scalar
    pos, po, ps, _ = layout('POSITION', {5126}, 'VEC3', 3)
    joints, jo, js, scalar = layout('JOINTS_0', {5121, 5123}, 'VEC4', 4)
    weights, wo, ws, _ = layout('WEIGHTS_0', {5126}, 'VEC4', 4)
    require(pos['count'] == joints['count'] == weights['count'], 'Skin accessor count mismatch')
    target_views = {joints['bufferView'], weights['bufferView']}
    require(len(target_views) == 2, 'Overlapping skin target views')
    for index, accessor in enumerate(doc['accessors']):
        if index not in (attrs['JOINTS_0'], attrs['WEIGHTS_0']):
            require(accessor.get('bufferView') not in target_views, 'Skin view aliases non-skin accessor')
    for target in target_views:
        a = doc['bufferViews'][target]
        start, end = a.get('byteOffset', 0), a.get('byteOffset', 0)+a['byteLength']
        for index, view in enumerate(doc['bufferViews']):
            if index != target:
                lo, hi = view.get('byteOffset', 0), view.get('byteOffset', 0)+view['byteLength']
                require(end <= lo or hi <= start, 'Overlapping skin buffer views')
    lookup = {}
    for record in records:
        key = tuple(record['position'])
        require(key not in lookup or lookup[key] == record, 'Ambiguous native position/weights')
        lookup[key] = record
    names = [doc['nodes'][i]['name'] for i in doc['skins'][node['skin']]['joints']]
    require(len(names) == len(set(names)), 'Ambiguous semantic skin joints')
    result = bytearray(data)
    allowed = set()
    restored, tiny = [], 0
    for i in range(pos['count']):
        point = struct.unpack_from('<3f', data, po+i*ps)
        require(point in lookup, 'Missing exact native position mapping')
        record = lookup[point]
        if not record['active']:
            continue
        values = sorted(record['weights'].items())
        require(0 < len(values) <= 4 and all(math.isfinite(w) and w > 0 for _, w in values), 'Invalid native named weights')
        total = sum(w for _, w in values)
        require(abs(total-1) < 1e-6, 'Native weights not normalized')
        require(all(name in names for name, _ in values), 'Missing semantic skin joint')
        ids = [names.index(name) for name, _ in values]
        normalized = [w/total for _, w in values]
        tiny += sum(w <= .0001 for w in normalized)
        ids += [0]*(4-len(ids))
        normalized += [0.]*(4-len(normalized))
        struct.pack_into('<'+('4B' if scalar == 1 else '4H'), result, jo+i*js, *ids)
        struct.pack_into('<4f', result, wo+i*ws, *normalized)
        allowed.update(range(jo+i*js, jo+i*js+4*scalar))
        allowed.update(range(wo+i*ws, wo+i*ws+16))
        restored.append(i)
    require(all(a == b or i in allowed for i, (a, b) in enumerate(zip(data, result))), 'Inactive/non-skin bytes changed')
    inactive = bytes(value for i, value in enumerate(data) if i not in allowed)
    return bytes(result), {'restoredVertices': len(restored), 'tinyInfluencesPreserved': tiny,
                           'inactiveBytesSha256': hashlib.sha256(inactive).hexdigest()}
