"""Distinct isometric poses. Time never creates a fake oscillation."""
import math

EXERCISES = ('forearm-plank', 'side-plank')


def pose(bones, t, exercise, k, squat_pose=None):
    if exercise == 'forearm-plank':
        lean = 1.38
        ankle = (0, .10, -1.13)
        pelvis = k.add(ankle, k.rotate((0, .88, -.035), k.axis_x(lean)))
        result = {1: (pelvis, k.axis_x(lean))}
        for foot in (8, 11):
            result[foot] = (None, k.axis_x(-lean))
        for arm, sign in ((12, 1), (15, -1)):
            k.limb(bones, result, arm, (sign*.30, .055, .40), (0, -1, 0), k.axis_x(-math.pi/2))
        return result
    if exercise != 'side-plank':
        raise ValueError(f'Unknown isometric pose: {exercise}')
    slope = .287
    q = k.axis_z(-math.pi/2+slope)
    # A straight lower leg and inclined trunk place the shoulder above its elbow.
    pelvis_y = .065+.145*math.cos(slope)+.88*math.sin(slope)
    result = {1: ((0, pelvis_y, 0), q)}
    lower_foot = k.forward(bones, result)[0][8]
    k.limb(bones, result, 6, lower_foot, (0, 0, 1), k.axis_z(-math.pi/2))
    k.limb(bones, result, 9, (-.72, .065, .08), (0, 0, 1), k.axis_z(-math.pi/2))
    _world, rotations = k.forward(bones, result)
    upper = k.align(k.sub(bones[13][2], bones[12][2]), (0, -1, 0))
    lower = k.multiply(k.align(k.rotate(k.sub(bones[14][2], bones[13][2]), upper), (0, -.02, .24)), upper)
    result[12] = (None, k.multiply(k.inverse(rotations[3]), upper))
    result[13] = (None, k.multiply(k.inverse(upper), lower))
    result[14] = (None, k.multiply(k.inverse(lower), k.axis_x(-math.pi/2)))
    k.limb(bones, result, 15, (.10, .50, .14), (0, 0, 1), q)
    return result
