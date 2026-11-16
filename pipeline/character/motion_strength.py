"""Original unilateral bridge/hinge and floor dumbbell exercise motions."""
import math

EXERCISES = ('single-leg-glute-bridge', 'single-leg-romanian-deadlift',
             'dumbbell-floor-press', 'dumbbell-chest-fly', 'dumbbell-triceps-kickback')


def pose(bones, t, exercise, k, squat_pose=None):
    amount = (1-math.cos(2*math.pi*t/4))/2
    if exercise == 'single-leg-glute-bridge':
        q = k.axis_x(-math.pi/2-.40*amount)
        chest = (0, .15, -.40)
        pelvis = k.sub(chest, k.rotate(k.sub(bones[3][2], bones[1][2]), q))
        result = {1: (pelvis, q), 3: (None, k.multiply(k.inverse(q), k.axis_x(-math.pi/2)))}
        k.limb(bones, result, 6, (.145, .10, .48), (0, 1, 0))
        k.limb(bones, result, 9, (-.145, .65+.15*amount, .45), (0, 1, 0))
        return result
    if exercise == 'single-leg-romanian-deadlift':
        lean = .70*amount
        result = {1: ((.10, .96-.08*amount, -.14*amount), k.axis_x(lean))}
        k.limb(bones, result, 6, bones[8][2], (0, 0, 1))
        k.limb(bones, result, 9, (-.145, .10+.40*amount, .035-.42*amount), (0, 0, 1))
        k.hanging_arms(bones, result)
        return result
    if exercise == 'dumbbell-triceps-kickback':
        q = k.axis_x(.65)
        result = {1: ((0, .90, -.20), q)}
        k.planted_legs(bones, result)
        for arm in (12, 15):
            _, rotations = k.forward(bones, result)
            first = k.sub(bones[arm+1][2], bones[arm][2])
            second = k.sub(bones[arm+2][2], bones[arm+1][2])
            upper = k.align(first, (0, -.10, -.28))
            angle = 1.25*amount
            lower = k.multiply(k.align(k.rotate(second, upper), (0, -math.cos(angle), -math.sin(angle))), upper)
            result[arm] = (None, k.multiply(k.inverse(rotations[bones[arm][1]]), upper))
            result[arm+1] = (None, k.multiply(k.inverse(upper), lower))
            result[arm+2] = (None, k.IDENTITY)
        return result
    if exercise not in ('dumbbell-floor-press', 'dumbbell-chest-fly'):
        raise ValueError(f'Unknown strength motion: {exercise}')
    result = {1: ((0, .15, 0), k.axis_x(-math.pi/2))}
    for leg in (6, 9):
        k.limb(bones, result, leg, (bones[leg][2][0], .10, .48), (0, 1, 0))
    for arm, sign in ((12, 1), (15, -1)):
        world, _ = k.forward(bones, result)
        if exercise == 'dumbbell-floor-press':
            delta = (sign*(.18-.14*amount), .20+.30*amount, .04)
        else:
            angle = .18+1.12*amount
            delta = (sign*.51*math.cos(angle), .51*math.sin(angle), .02)
        k.limb(bones, result, arm, k.add(world[arm], delta), (sign, -.10, .3))
    return result
