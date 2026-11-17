"""Original closed twelve-sided shared bar and reusable hip-pad geometry, in meters."""
import math

SEGMENTS = ((-.75, .75, .012), (-.67, -.62, .16), (.62, .67, .16))
PAD = ((-.25, .25, .05),)
GRIP_SPAN = .33


def geometry(segments=SEGMENTS):
    vertices, normals, indices = [], [], []
    for lo, hi, radius in segments:
        start = len(vertices)
        for x in (lo, hi):
            for j in range(12):
                angle = j*math.pi/6
                vertices.append((x, radius*math.cos(angle), radius*math.sin(angle)))
                normals.append((0, math.cos(angle), math.sin(angle)))
        for j in range(12):
            a,b = start+j,start+(j+1)%12
            indices.extend((a,b,b+12,a,b+12,a+12))
        for offset, reverse in ((0, True), (12, False)):
            for j in range(1,11):
                face = (start+offset,start+offset+j,start+offset+j+1)
                indices.extend(face[::-1] if reverse else face)
    return vertices,normals,indices
