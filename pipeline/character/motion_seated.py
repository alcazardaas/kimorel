"""Original seated, stepping and supported standing exercise poses."""
import math

EXERCISES = ('seated-trunk-rotation', 'seated-knee-extension', 'seated-calf-raise',
             'sit-to-stand', 'step-up', 'bulgarian-split-squat', 'wall-sit')


def axis_y(angle):
    return (0, math.sin(angle/2), 0, math.cos(angle/2))


def seat(bones, k):
    result = {1: ((0, .64, -.12), k.IDENTITY)}
    for leg in (6, 9):
        k.limb(bones, result, leg, (bones[leg][2][0], .10, .50), (0, 0, 1))
    seated_arms(bones, result, k)
    return result


def seated_arms(bones, result, k):
    for arm, sign in ((12, 1), (15, -1)):
        world, _ = k.forward(bones, result)
        k.limb(bones, result, arm, k.add(world[arm], (sign*.04, -.20, .32)), (sign, 0, 1))


def smooth(value):
    return value*value*(3-2*value)


def step_state(t):
    """Three deliberate transfers up and their reversed path down; no teleporting support."""
    p = (t/4) if t <= 2 else (1-t/4)
    u = min(1, max(0, p*2))
    if u < 1/3:
        a = smooth(u*3)
        lift = smooth(min(1, a*2))
        travel = smooth(max(0, a*2-1))
        return (0, .93, -.08), (.145, .10+.30*lift-.05*travel, .43*travel), (-.145, .10, -.25)
    if u < 2/3:
        a = smooth((u-1/3)*3)
        return (0, .93+.25*a, -.08+.33*a), (.145, .35, .43), (-.145, .10+.25*a, -.25+.35*a)
    a = smooth((u-2/3)*3)
    return (0, 1.18, .25), (.145, .35, .43), (-.145, .35+.10*math.sin(math.pi*a), .10+.33*a)


def pose(bones, t, exercise, k, squat_pose=None):
    amount = (1-math.cos(2*math.pi*t/4))/2
    if exercise == 'step-up':
        pelvis, left, right = step_state(t)
        result = {1: (pelvis, k.IDENTITY)}
        k.limb(bones, result, 6, left, (0, 0, 1))
        k.limb(bones, result, 9, right, (0, 0, 1))
    elif exercise == 'bulgarian-split-squat':
        result = {1: ((0, .88-.20*amount, .02), k.axis_x(.12))}
        k.limb(bones, result, 6, (.145, .10, .35), (0, 0, 1))
        k.limb(bones, result, 9, (-.145, .55, -.70), (0, 0, 1), k.IDENTITY)
    elif exercise == 'wall-sit':
        result = {1: ((0, .60, -.05), k.IDENTITY)}
        for leg in (6, 9):
            k.limb(bones, result, leg, (bones[leg][2][0], .10, .48), (0, 0, 1))
    elif exercise == 'sit-to-stand':
        result = {1: ((0, .62+.34*amount, -.12+.52*amount), k.axis_x(.20*math.sin(math.pi*amount)))}
        for leg in (6, 9):
            k.limb(bones, result, leg, (bones[leg][2][0], .10, .40), (0, 0, 1))
    else:
        result = seat(bones, k)
        if exercise == 'seated-trunk-rotation':
            wave = 0 if t % 2 == 0 else math.sin(2*math.pi*t/4)
            result[2] = (None, axis_y(.20*wave))
            result[3] = (None, axis_y(.30*wave))
        elif exercise == 'seated-knee-extension':
            world, rotations = k.forward(bones, result)
            second = k.sub(bones[8][2], bones[7][2])
            direction = k.rotate(second, rotations[7])
            direction = (0, direction[1]*(1-amount), direction[2]*(1-amount)+.41*amount)
            lower = k.align(second, direction)
            result[7] = (None, k.multiply(k.inverse(rotations[6]), lower))
            result[8] = (None, k.inverse(lower))
        elif exercise == 'seated-calf-raise':
            angle = .32*amount
            q = k.axis_x(angle)
            for leg in (6, 9):
                anchor = (bones[leg][2][0], .005, .625)
                foot = k.add(anchor, k.rotate((0, .095, -.125), q))
                k.limb(bones, result, leg, foot, (0, 0, 1), q)
        else:
            raise ValueError(f'Unknown seated motion: {exercise}')
        if exercise == 'seated-trunk-rotation':
            for arm, sign in ((12, 1), (15, -1)):
                world, _ = k.forward(bones, result)
                k.limb(bones, result, arm, k.add(world[arm], (-sign*.12, -.20, .20)), (sign, 0, 1))
        return result
    if exercise == 'sit-to-stand':
        seated_arms(bones, result, k)
    else:
        k.hanging_arms(bones, result)
    return result
