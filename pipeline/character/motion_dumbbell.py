"""Original upper-body dumbbell motions with distinct joint and support constraints."""
import math

EXERCISES = ('dumbbell-pullover', 'dumbbell-reverse-fly', 'lying-triceps-extension',
             'overhead-triceps-extension', 'dumbbell-side-bend',
             'side-lying-dumbbell-external-rotation')


def arm_segments(bones, result, arm, upper_direction, lower_direction, k):
    """Set explicit world-space segment directions without moving the elbow origin."""
    _, rotations = k.forward(bones, result)
    upper_rest = k.sub(bones[arm+1][2], bones[arm][2])
    lower_rest = k.sub(bones[arm+2][2], bones[arm+1][2])
    upper = k.align(upper_rest, upper_direction)
    lower = k.multiply(k.align(k.rotate(lower_rest, upper), lower_direction), upper)
    result[arm] = (None, k.multiply(k.inverse(rotations[bones[arm][1]]), upper))
    result[arm+1] = (None, k.multiply(k.inverse(upper), lower))
    hand = k.align((0, -1, 0), lower_direction)
    result[arm+2] = (None, k.multiply(k.inverse(lower), hand))


def follow_forearm(bones, result, arm, k):
    world, rotations = k.forward(bones, result)
    hand = k.align((0, -1, 0), k.sub(world[arm+2], world[arm+1]))
    result[arm+2] = (None, k.multiply(k.inverse(rotations[arm+1]), hand))


def pose(bones, t, exercise, k, squat_pose=None):
    amount = (1-math.cos(2*math.pi*t/4))/2
    result = {18: (None, k.IDENTITY), 19: (None, k.IDENTITY)}
    if exercise in ('dumbbell-pullover', 'lying-triceps-extension'):
        result[1] = ((0, .60, 0), k.axis_x(-math.pi/2))
        for leg in (6, 9):
            k.limb(bones, result, leg, (bones[leg][2][0], .10, .65), (0, 1, 0))
        for arm, sign in ((12, 1), (15, -1)):
            if exercise == 'dumbbell-pullover':
                world, _ = k.forward(bones, result)
                angle = 1.25*amount
                target = k.add(world[arm], (sign*.025, .51*math.cos(angle), -.51*math.sin(angle)))
                k.limb(bones, result, arm, target, (sign, 0, .1))
                follow_forearm(bones, result, arm, k)
            else:
                angle = .15+1.45*amount
                arm_segments(bones, result, arm, (0, 1, 0), (0, math.cos(angle), -math.sin(angle)), k)
        return result
    if exercise == 'overhead-triceps-extension':
        for arm in (12, 15):
            angle = .20+1.70*amount
            arm_segments(bones, result, arm, (0, .97, -.24), (0, math.cos(angle), -math.sin(angle)), k)
        return result
    if exercise == 'dumbbell-reverse-fly':
        result[1] = ((0, .90, -.20), k.axis_x(.80))
        k.planted_legs(bones, result)
        for arm, clavicle, sign in ((12, 18, 1), (15, 19, -1)):
            rest = k.sub(bones[clavicle][2], bones[3][2])
            result[clavicle] = (k.add(rest, (0, 0, -.02*amount)), k.IDENTITY)
            world, _ = k.forward(bones, result)
            angle = .10+1.15*amount
            k.limb(bones, result, arm, k.add(world[arm], (sign*.51*math.sin(angle), -.51*math.cos(angle), -.035*amount)), (sign, -.2, 0))
            follow_forearm(bones, result, arm, k)
        return result
    if exercise == 'dumbbell-side-bend':
        result.update({2: (None, k.axis_z(.22*amount)), 3: (None, k.axis_z(.12*amount))})
        k.hanging_arms(bones, result)
        arm_segments(bones, result, 15, (-.32, -1, 0), (-.32, -1, 0), k)
        for arm in (12, 15):
            follow_forearm(bones, result, arm, k)
        return result
    if exercise == 'side-lying-dumbbell-external-rotation':
        q = k.axis_z(-math.pi/2)
        result[1] = ((0, .272, 0), q)
        k.limb(bones, result, 6, (-.45, .075, .32), (0, 0, 1), q)
        k.limb(bones, result, 9, (-.45, .20, .32), (0, 0, 1), q)
        k.limb(bones, result, 12, (.52, .10, .24), (0, 1, 0), q)
        angle = .10+.95*amount
        arm_segments(bones, result, 15, (-1, 0, 0), (0, math.sin(angle), math.cos(angle)), k)
        # Axial humeral rotation changes shoulder orientation, not elbow position.
        _, rotations = k.forward(bones, result)
        upper = k.multiply(k.axis_x(-.95*amount), rotations[15])
        result[15] = (None, k.multiply(k.inverse(rotations[bones[15][1]]), upper))
        result[16] = (None, k.multiply(k.inverse(upper), rotations[16]))
        return result
    raise ValueError(f'Unknown dumbbell motion: {exercise}')
