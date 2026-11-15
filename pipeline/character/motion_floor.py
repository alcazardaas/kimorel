"""Original prone, supine and side-lying floor motions."""
import math

EXERCISES = ('prone-hamstring-curl', 'supine-heel-slide',
             'side-lying-clamshell', 'reverse-crunch')


def pose(bones, t, exercise, k, squat_pose=None):
    amount = (1-math.cos(2*math.pi*t/4))/2
    if exercise == 'prone-hamstring-curl':
        result = {1: ((0, .15, 0), k.axis_x(math.pi/2)),
                  7: (None, k.axis_x(.20+1.00*amount)), 10: (None, k.axis_x(.20))}
        _world, rotations = k.forward(bones, result)
        for shin in (7, 10):
            result[shin+1] = (None, k.multiply(k.inverse(rotations[shin]), k.axis_x(math.pi)))
        return result
    if exercise == 'supine-heel-slide':
        result = {1: ((0, .15, 0), k.axis_x(-math.pi/2))}
        k.limb(bones, result, 6, (.145, .10, .80-.45*amount), (0, 1, 0))
        k.limb(bones, result, 9, (-.145, .10, .80), (0, 1, 0))
        return result
    if exercise == 'side-lying-clamshell':
        q = k.axis_z(-math.pi/2)
        result = {1: ((0, .272, 0), q)}
        k.limb(bones, result, 6, (-.45, .075, .32), (0, 0, 1), q)
        pole = (0, math.sin(.85*amount), math.cos(.85*amount))
        k.limb(bones, result, 9, (-.45, .20, .32), pole, q)
        k.limb(bones, result, 12, (.52, .10, .24), (0, 1, 0), q)
        k.limb(bones, result, 15, (.25, .14, .23), (0, 1, 0), q)
        return result
    if exercise != 'reverse-crunch':
        raise ValueError(f'Unknown floor motion: {exercise}')
    q = k.axis_x(-math.pi/2-.30*amount)
    result = {1: ((0, 0, 0), q), 2: (None, k.axis_x(.15*amount)),
              3: (None, k.axis_x(.15*amount))}
    world, _rotations = k.forward(bones, result)
    result[1] = (k.sub((0, .15, -.40), world[3]), q)
    for leg in (6, 9):
        k.limb(bones, result, leg, (bones[leg][2][0], .65+.12*amount, .45-.20*amount), (0, 1, 1))
    return result
