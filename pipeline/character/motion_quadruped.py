"""Original quadruped motions with independently constrained support joints."""
import math

EXERCISES = ('quadruped-hip-extension', 'fire-hydrant', 'cat-cow')


def kneeling(bones, k):
    result = {1: ((0, .49, -.35), k.axis_x(math.pi/2))}
    for leg in (6, 9):
        k.limb(bones, result, leg, (bones[leg][2][0], .11, -.76), (0, -1, 0))
    for arm, sign in ((12, 1), (15, -1)):
        k.limb(bones, result, arm, (sign*.32, .045, .30), (sign, 0, -.5), k.axis_x(-math.pi/2))
    return result


def cat_cow(bones, t, k):
    wave = 0 if t % 2 == 0 else math.sin(2*math.pi*t/4)
    pelvis_q = k.axis_x(math.pi/2+.16*wave)
    thigh_q = k.axis_x(.04*wave)
    first = k.sub(bones[7][2], bones[6][2])
    # Position pelvis on the fixed-knee arc, instead of translating locked knees.
    hip = k.sub((0, .065, -.35), k.rotate(first, thigh_q))
    pelvis = k.sub(hip, k.rotate((0, -.04, 0), pelvis_q))
    result = {1: (pelvis, pelvis_q), 2: (None, k.axis_x(-.28*wave)),
              3: (None, k.axis_x(-.12*wave)), 4: (None, k.axis_x(.10*wave))}
    second = k.sub(bones[8][2], bones[7][2])
    length = math.sqrt(k.dot(second, second))
    shin_q = k.align(second, (0, .045, -math.sqrt(length*length-.045*.045)))
    for leg in (6, 9):
        result[leg] = (None, k.multiply(k.inverse(pelvis_q), thigh_q))
        result[leg+1] = (None, k.multiply(k.inverse(thigh_q), shin_q))
        result[leg+2] = (None, k.inverse(shin_q))
    for arm, sign in ((12, 1), (15, -1)):
        k.limb(bones, result, arm, (sign*.30, .045, .30), (sign, 0, -.5), k.axis_x(-math.pi/2))
    return result


def pose(bones, t, exercise, k, squat_pose=None):
    if exercise == 'cat-cow':
        return cat_cow(bones, t, k)
    result = kneeling(bones, k)
    amount = (1-math.cos(2*math.pi*t/4))/2
    _world, rotations = k.forward(bones, result)
    if exercise == 'quadruped-hip-extension':
        lift = k.axis_x(.75*amount)
    elif exercise == 'fire-hydrant':
        lift = k.axis_z(-.80*amount)
    else:
        raise ValueError(f'Unknown quadruped motion: {exercise}')
    upper, lower = k.multiply(lift, rotations[9]), k.multiply(lift, rotations[10])
    result[9] = (None, k.multiply(k.inverse(rotations[1]), upper))
    result[10] = (None, k.multiply(k.inverse(upper), lower))
    result[11] = (None, k.multiply(k.inverse(lower), lift))
    return result
