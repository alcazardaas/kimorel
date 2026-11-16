"""Opt-in shoulder-girdle and wrist pilot; original educational motion, not clinical data."""
import math

EXERCISES = ('dumbbell-shoulder-press', 'dumbbell-wrist-curl',
             'dumbbell-reverse-wrist-curl', 'supine-serratus-punch')


def pose(bones, t, exercise, k, squat_pose=None):
    amount = (1-math.cos(2*math.pi*t/4))/2
    result = {18: (None, k.IDENTITY), 19: (None, k.IDENTITY)}
    if exercise == 'supine-serratus-punch':
        result[1] = ((0, .15, 0), k.axis_x(-math.pi/2))
        for leg in (6, 9):
            k.limb(bones, result, leg, (bones[leg][2][0], .10, .48), (0, 1, 0))
    for arm, clavicle, sign in ((12, 18, 1), (15, 19, -1)):
        rest = k.sub(bones[clavicle][2], bones[3][2])
        if exercise == 'dumbbell-shoulder-press':
            # Shoulder-girdle elevation/upward rotation accompanies humeral elevation.
            result[clavicle] = (k.add(rest, (0, .025*amount, 0)), k.axis_z(sign*.18*amount))
            world, _ = k.forward(bones, result)
            target = k.add(world[arm], (sign*(.20-.12*amount), .10+.38*amount, .10))
            k.limb(bones, result, arm, target, (sign, 0, .10), k.axis_x(-math.pi/2))
        elif exercise == 'supine-serratus-punch':
            # Local +Z becomes world +Y while supine: the shoulder girdle protracts.
            result[clavicle] = (k.add(rest, (0, 0, .055*amount)), k.IDENTITY)
            world, _ = k.forward(bones, result)
            k.limb(bones, result, arm, k.add(world[arm], (sign*.015, .525, 0)), (sign, 0, .2), k.axis_x(-math.pi/2))
        elif exercise in ('dumbbell-wrist-curl', 'dumbbell-reverse-wrist-curl'):
            world, _ = k.forward(bones, result)
            pronated = exercise == 'dumbbell-reverse-wrist-curl'
            # Neutral fingers follow the forearm, rather than hanging vertically.
            k.limb(bones, result, arm, k.add(world[arm], (sign*.035, -.28, .26)), (sign, -1, 0))
            world, rotations = k.forward(bones, result)
            neutral = k.align((0, -1, 0), k.sub(world[arm+2], world[arm+1]))
            pronation = (0, 1, 0, 0) if pronated else k.IDENTITY
            wrist = k.axis_x((.50 if pronated else -.50)*amount)
            orientation = k.multiply(k.multiply(neutral, pronation), wrist)
            result[arm+2] = (None, k.multiply(k.inverse(rotations[arm+1]), orientation))

        else:
            raise ValueError(f'Unknown upper-quarter motion: {exercise}')
    return result
