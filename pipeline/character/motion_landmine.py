"""Original unilateral landmine motions around a fixed grounded pivot, in meters."""
import math

EXERCISES = ('landmine-press', 'landmine-row')
SEGMENTS = ((0, 1.8, .012), (1.40, 1.45, .13))
GRIP = (1.79, 0, 0)


def frame(bones, time, exercise, k):
    amount = (1-math.cos(2*math.pi*time/4))/2
    row = exercise == 'landmine-row'
    angle = .38+.22*amount if row else .78+.32*amount
    direction = (0, math.sin(angle), -math.cos(angle))
    rotation = k.align((1, 0, 0), direction)
    pivot = tuple(k.profiles[exercise]['landminePivot'])
    result = {18: (None, k.IDENTITY), 19: (None, k.IDENTITY)}
    result[1] = ((0, .85, -.20), k.axis_x(.75)) if row else ((0, .98, 0), k.IDENTITY)
    k.planted_legs(bones, result)
    k.hanging_arms(bones, result)
    grip = k.add(pivot, k.rotate(GRIP, rotation))
    # The physical palm marker stays fixed in the right hand, not animated to fake contact.
    hand_rotation = k.axis_z(math.pi/2)
    target = k.sub(grip, k.rotate((-.02, -.055, .005), hand_rotation))
    k.limb(bones, result, 15, target, (-1, 0, -1), hand_rotation)
    return result, {'translation': pivot, 'rotation': rotation}


def pose(bones, time, exercise, k, squat_pose=None):
    return frame(bones, time, exercise, k)[0]


def equipment_pose(bones, time, exercise, k, squat_pose=None):
    return {'landmine': frame(bones, time, exercise, k)[1]}
