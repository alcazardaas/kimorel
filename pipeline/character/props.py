"""Original meter-scaled rigid equipment built from indexed cuboid faces."""
import json
from pathlib import Path

DEFINITIONS = json.loads(Path(__file__).with_name('equipment-profiles.json').read_text())


def geometry(kind):
    vertices, normals, indices = [], [], []
    for cx, cy, cz, sx, sy, sz in DEFINITIONS[kind]['boxes']:
        for axis, sign in ((0, -1), (0, 1), (1, -1), (1, 1), (2, -1), (2, 1)):
            other = [i for i in range(3) if i != axis]
            start = len(vertices)
            for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                p = [cx, cy, cz]
                p[axis] += sign*(sx, sy, sz)[axis]/2
                p[other[0]] += a*(sx, sy, sz)[other[0]]/2
                p[other[1]] += b*(sx, sy, sz)[other[1]]/2
                vertices.append(tuple(p))
                normal = [0, 0, 0]
                normal[axis] = sign
                normals.append(tuple(normal))
            # Choose winding from cross product, consistently outward on all axes.
            order = (0, 1, 2, 0, 2, 3) if sign == (1 if axis != 1 else -1) else (0, 2, 1, 0, 3, 2)
            indices.extend(start+i for i in order)
    return vertices, normals, indices
