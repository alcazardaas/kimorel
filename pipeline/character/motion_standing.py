"""Original in-place standing motions with explicit planted-foot targets."""
import math

EXERCISES = ('split-squat', 'lateral-lunge', 'standing-hip-extension')


def pose(bones, t, exercise, k, squat_pose=None):
    amount = (1-math.cos(2*math.pi*t/4))/2
    if exercise == 'split-squat':
        result = {1: ((0, .88-.22*amount, -.03), k.axis_x(.08+.06*amount))}
        k.limb(bones, result, 6, (.145, .10, .28), (0, 0, 1))
        k.limb(bones, result, 9, (-.145, .10, -.40), (0, 0, 1))
    elif exercise == 'lateral-lunge':
        result = {1: ((.30*amount, .90-.12*amount, 0), k.axis_z(-.08*amount))}
        k.limb(bones, result, 6, (.36, .10, .035), (0, 0, 1))
        k.limb(bones, result, 9, (-.36, .10, .035), (0, 0, 1))
    elif exercise == 'standing-hip-extension':
        result = {1: ((.12, .96, 0), k.IDENTITY)}
        k.limb(bones, result, 6, bones[8][2], (0, 0, 1))
        k.limb(bones, result, 9, (-.145, .10+.12*amount, .035-.35*amount), (0, 0, 1))
    else:
        raise ValueError(f'Unknown standing motion: {exercise}')
    k.hanging_arms(bones, result)
    return result
