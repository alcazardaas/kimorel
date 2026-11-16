"""Original single-joint and articulated trunk motions for milestone fifty."""
import math

EXERCISES = ('standing-hip-abduction', 'standing-hip-flexion', 'straight-leg-raise',
             'supine-pelvic-tilt', 'supine-trunk-rotation', 'thoracic-open-book',
             'quadruped-thoracic-rotation', 'curl-up', 'bicycle-crunch',
             'hollow-body-hold', 'superman', 'prone-hip-extension',
             'standing-hamstring-stretch')


def axis_y(angle):
    return (0, math.sin(angle/2), 0, math.cos(angle/2))


def straight_limb(bones, result, start, direction, k, end=None):
    """Transport both segments together without introducing independent axial twist."""
    _, rotations = k.forward(bones, result)
    first = k.sub(bones[start+1][2], bones[start][2])
    second = k.sub(bones[start+2][2], bones[start+1][2])
    upper = k.align(first, direction)
    lower = k.multiply(k.align(k.rotate(second, upper), direction), upper)
    result[start] = (None, k.multiply(k.inverse(rotations[bones[start][1]]), upper))
    result[start+1] = (None, k.multiply(k.inverse(upper), lower))
    result[start+2] = (None, k.multiply(k.inverse(lower), end or k.IDENTITY))


def supine(k):
    return {1: ((0, .15, 0), k.axis_x(-math.pi/2))}


def bent_feet(bones, result, k, z=.48):
    for leg in (6, 9):
        k.limb(bones, result, leg, (bones[leg][2][0], .10, z), (0, 1, 0))


def pose(bones, t, exercise, k, squat_pose=None):
    amount = (1-math.cos(2*math.pi*t/4))/2
    wave = 0 if t % 2 == 0 else math.sin(2*math.pi*t/4)
    if exercise in ('standing-hip-abduction', 'standing-hip-flexion'):
        result = {1: ((.12, .96, 0), k.IDENTITY)}
        k.limb(bones, result, 6, bones[8][2], (0, 0, 1))
        target = (-.145-.38*amount, .10+.15*amount, .035) if exercise.endswith('abduction') else (-.145, .10+.38*amount, .035+.45*amount)
        k.limb(bones, result, 9, target, (0, 0, 1))
        k.hanging_arms(bones, result)
        return result
    if exercise == 'standing-hamstring-stretch':
        result = {1: ((0, .85, -.08), k.axis_x(.30))}
        k.limb(bones, result, 6, (.145, .10, .35), (0, 0, 1))
        k.limb(bones, result, 9, (-.145, .10, -.15), (0, 0, 1))
        k.hanging_arms(bones, result)
        return result
    if exercise == 'straight-leg-raise':
        result = supine(k)
        for leg in (6, 9):
            angle = .12+.70*amount if leg == 6 else .02
            straight_limb(bones, result, leg, (0, math.sin(angle), math.cos(angle)), k)
        return result
    if exercise == 'supine-pelvic-tilt':
        q = k.axis_x(-math.pi/2-.12*amount)
        result = {1: ((0, 0, 0), q), 2: (None, k.axis_x(.07*amount)), 3: (None, k.axis_x(.05*amount))}
        world, _ = k.forward(bones, result)
        result[1] = (k.sub((0, .15, -.40), world[3]), q)
        bent_feet(bones, result, k)
        return result
    if exercise == 'supine-trunk-rotation':
        q = k.multiply(k.axis_z(.38*wave), k.axis_x(-math.pi/2))
        result = {1: ((0, 0, 0), q), 2: (None, k.multiply(k.inverse(q), k.axis_x(-math.pi/2)))}
        world, _ = k.forward(bones, result)
        result[1] = (k.sub((0, .15, -.40), world[3]), q)
        for leg in (6, 9):
            k.limb(bones, result, leg, (bones[leg][2][0]+.30*wave, .32, .42), (0, 1, 0))
        return result
    if exercise == 'thoracic-open-book':
        q = k.axis_z(-math.pi/2)
        result = {1: ((0, .272, 0), q), 2: (None, axis_y(.25*amount)), 3: (None, axis_y(.35*amount))}
        k.limb(bones, result, 6, (-.45, .075, .32), (0, 0, 1), q)
        k.limb(bones, result, 9, (-.45, .20, .32), (0, 0, 1), q)
        for arm in (12, 15):
            world, _ = k.forward(bones, result)
            angle = math.pi*.75*amount if arm == 15 else 0
            target = k.add(world[arm], (0, .10+.40*math.sin(angle), .47*math.cos(angle)))
            k.limb(bones, result, arm, target, (0, 1, 0), q)
        return result
    if exercise == 'quadruped-thoracic-rotation':
        result = {1: ((0, .49, -.35), k.axis_x(math.pi/2)), 2: (None, axis_y(-.20*amount)), 3: (None, axis_y(-.45*amount))}
        for leg in (6, 9):
            k.limb(bones, result, leg, (bones[leg][2][0], .11, -.76), (0, -1, 0))
        k.limb(bones, result, 12, (.32, .045, .30), (1, 0, -.5), k.axis_x(-math.pi/2))
        world, _ = k.forward(bones, result)
        k.limb(bones, result, 15, k.add(world[15], (-.10-.22*amount, .05+.28*amount, .25-.20*amount)), (-1, 0, -1))
        return result
    if exercise in ('curl-up', 'bicycle-crunch', 'hollow-body-hold'):
        held = exercise == 'hollow-body-hold'
        flexion = .25 if held else (.16+.12*amount if exercise == 'bicycle-crunch' else .28*amount)
        result = supine(k)
        result[2] = (None, k.axis_x(flexion))
        result[3] = (None, k.axis_x(flexion*.5))
        if exercise == 'curl-up':
            bent_feet(bones, result, k)
            for arm in (12, 15):
                straight_limb(bones, result, arm, (0, .05, 1), k, k.axis_x(-math.pi/2))
        elif held:
            for leg in (6, 9):
                straight_limb(bones, result, leg, (0, .30, .95), k)
            for arm in (12, 15):
                straight_limb(bones, result, arm, (0, .25, -.97), k)
        else:
            result[3] = (None, k.multiply(k.axis_x(.10), axis_y(.25*wave)))
            for leg, sign in ((6, 1), (9, -1)):
                extension = (1+sign*wave)/2
                k.limb(bones, result, leg, (bones[leg][2][0], .60-.30*extension, .32+.50*extension), (0, 1, 1))
            for arm, sign in ((12, 1), (15, -1)):
                world, _ = k.forward(bones, result)
                k.limb(bones, result, arm, k.add(world[arm], (sign*.06, .15, -.16)), (sign, 1, 0))
        return result
    if exercise in ('superman', 'prone-hip-extension'):
        result = {1: ((0, .15, 0), k.axis_x(math.pi/2))}
        if exercise == 'superman':
            result[2] = (None, k.axis_x(-.15*amount))
            result[3] = (None, k.axis_x(-.12*amount))
            for arm in (12, 15):
                straight_limb(bones, result, arm, (0, .20*amount, 1), k)
        for leg in (6, 9):
            lift = .30*amount if (exercise == 'superman' or leg == 9) else .02
            straight_limb(bones, result, leg, (0, math.sin(lift), -math.cos(lift)), k, k.axis_x(math.pi))
        return result
    raise ValueError(f'Unknown mobility motion: {exercise}')
