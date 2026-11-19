"""Original, proportion-preserving draft reference; no Blender dependency."""
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / 'assets/characters/neutral-human.glb'
DIGITS = {'index': (.022, .068), 'middle': (.007, .078), 'ring': (-.009, .073), 'little': (-.024, .058)}


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def scale(a, value):
    return tuple(x * value for x in a)


def unit(a):
    length = math.sqrt(sum(x * x for x in a))
    if not length or not math.isfinite(length):
        raise ValueError('Invalid direction')
    return scale(a, 1 / length)


def blender_point(p):
    """glTF X/Y-up/Z-forward to Blender X/Z-up/-Y-forward."""
    return (p[0], -p[2], p[1])


def gltf_point(p):
    return (p[0], p[2], -p[1])


def reference():
    data = REFERENCE.read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + size])
    binary = 28 + size
    nodes = {node['name']: node for node in doc['nodes'] if 'name' in node}
    worlds = {}
    def visit(index, parent=(0, 0, 0)):
        node = doc['nodes'][index]
        point = add(parent, node.get('translation', (0, 0, 0)))
        if 'name' in node:
            worlds[node['name']] = point
        for child in node.get('children', []):
            visit(child, point)
    for index in doc['scenes'][doc.get('scene', 0)]['nodes']:
        visit(index)
    accessor = doc['accessors'][doc['meshes'][0]['primitives'][0]['attributes']['POSITION']]
    view = doc['bufferViews'][accessor['bufferView']]
    start = binary + view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    stride = view.get('byteStride', 12)
    positions = [struct.unpack_from('<3f', data, start + i * stride) for i in range(accessor['count'])]
    bounds = [[min(p[i] for p in positions), max(p[i] for p in positions)] for i in range(3)]
    return {'boundsMeters': bounds, 'jointCentersMeters': {name: worlds[name] for name in worlds if name in nodes and name != 'human'},
            'heightMeters': bounds[1][1] - bounds[1][0], 'source': REFERENCE.relative_to(ROOT).as_posix()}


def hand_layout(side, wrist, elbow):
    sign = 1 if side == 'left' else -1
    along = unit(sub(wrist, elbow))
    across = unit((sign * abs(along[1]), abs(along[0]), 0))
    origin = add(wrist, scale(along, .055))
    chains = {}
    for name, (offset, length) in DIGITS.items():
        base = add(origin, scale(across, offset))
        direction = unit(add(along, scale(across, offset * 2)))
        chains[name] = [add(base, scale(direction, length * t)) for t in (0, .44, .76, 1)]
    base = add(add(wrist, scale(along, .015)), scale(across, .028))
    direction = unit(add(scale(along, .55), scale(across, .84)))
    chains['thumb'] = [add(base, scale(direction, .060 * t)) for t in (0, .4, .74, 1)]
    return {'along': along, 'across': across, 'center': add(wrist, scale(along, .028)), 'chains': chains}


def skeleton():
    joints = reference()['jointCentersMeters']
    parents = {'root': None, 'pelvis': 'root', 'spine': 'pelvis', 'chest': 'spine', 'neck': 'chest', 'head': 'neck'}
    points = {name: tuple(joints[name]) for name in parents}
    for side, sign in (('left', 1), ('right', -1)):
        parents[f'{side}_clavicle'] = 'chest'
        points[f'{side}_clavicle'] = (sign * .08, 1.43, 0)
        for name, parent in (('upper_arm', 'clavicle'), ('forearm', 'upper_arm'), ('hand', 'forearm'), ('thigh', None), ('shin', 'thigh'), ('foot', 'shin')):
            key = f'{side}_{name}'
            parents[key] = 'pelvis' if parent is None else f'{side}_{parent}'
            points[key] = tuple(joints[key])
        layout = hand_layout(side, points[f'{side}_hand'], points[f'{side}_forearm'])
        for digit, chain in layout['chains'].items():
            for i in range(3):
                name = f'{side}_{digit}_{i + 1}'
                points[name] = chain[i]
                parents[name] = f'{side}_hand' if i == 0 else f'{side}_{digit}_{i}'
    return points, parents


def loft(points, radii, sides=12):
    """Closed quad tube around a chain, with finite cap triangles."""
    if len(points) != len(radii) or sides < 3:
        raise ValueError('Invalid loft profile')
    vertices = []
    for i, point in enumerate(points):
        tangent = unit(sub(points[min(i + 1, len(points) - 1)], points[max(0, i - 1)]))
        across = unit((tangent[1], -tangent[0], 0)) if abs(tangent[2]) < .9 else (1, 0, 0)
        normal = (tangent[1] * across[2] - tangent[2] * across[1], tangent[2] * across[0] - tangent[0] * across[2], tangent[0] * across[1] - tangent[1] * across[0])
        for k in range(sides):
            angle = 2 * math.pi * k / sides
            vertices.append(add(point, add(scale(across, radii[i] * math.cos(angle)), scale(normal, radii[i] * math.sin(angle)))))
    faces = []
    for i in range(len(points) - 1):
        for k in range(sides):
            a, b = i * sides + k, i * sides + (k + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    for end, reverse in ((0, True), (len(points) - 1, False)):
        center = len(vertices)
        vertices.append(points[end])
        for k in range(sides):
            edge = (end * sides + k, end * sides + (k + 1) % sides)
            faces.append((center, *edge[::-1]) if reverse else (center, *edge))
    return vertices, faces
