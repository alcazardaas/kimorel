"""Original reusable quaternion motion clips; meters, Y-up, +Z forward."""
import math
import json
from pathlib import Path

IDENTITY = (0, 0, 0, 1)
PROFILES = json.loads(Path(__file__).with_name('motion-profiles.json').read_text())
EXERCISES = tuple(PROFILES)


def add(a, b):
    return tuple(x+y for x, y in zip(a, b))


def sub(a, b):
    return tuple(x-y for x, y in zip(a, b))


def scale(a, s):
    return tuple(x*s for x in a)


def dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def unit(a):
    n = math.sqrt(dot(a, a))
    return scale(a, 1/max(n, 1e-12))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def multiply(a, b):
    x,y,z,w = a
    X,Y,Z,W = b
    return (w*X+x*W+y*Z-z*Y, w*Y-x*Z+y*W+z*X,
            w*Z+x*Y-y*X+z*W, w*W-x*X-y*Y-z*Z)


def inverse(q):
    return (-q[0], -q[1], -q[2], q[3])


def rotate(v, q):
    return multiply(multiply(q, (*v, 0)), inverse(q))[:3]


def axis_x(angle):
    return (math.sin(angle/2), 0, 0, math.cos(angle/2))


def align(a, b):
    a,b = unit(a),unit(b)
    d = dot(a,b)
    if d < -.999999:
        axis = unit(cross(a, (1,0,0) if abs(a[0]) < .9 else (0,1,0)))
        return (*axis, 0)
    q = (*cross(a,b), 1+d)
    n = math.sqrt(dot(q,q))
    return scale(q,1/n)


def solve_chain(start, end, upper, lower, pole):
    """Two-bone IK with a stable world-space bend plane."""
    delta = sub(end,start)
    distance = math.sqrt(dot(delta,delta))
    direction = unit(delta)
    a = (upper*upper-lower*lower+distance*distance)/(2*distance)
    h = math.sqrt(max(0,upper*upper-a*a))
    bend = unit(sub(pole,scale(direction,dot(pole,direction))))
    return add(start,add(scale(direction,a),scale(bend,h)))


def forward(bones, pose):
    world, rotations = [],[]
    for i,(_,parent,rest) in enumerate(bones):
        local = sub(rest,bones[parent][2]) if parent is not None else rest
        translation, rotation = pose.get(i,(None,IDENTITY))
        local = translation if translation is not None else local
        if parent is None:
            world.append(local)
            rotations.append(rotation)
        else:
            world.append(add(world[parent],rotate(local,rotations[parent])))
            rotations.append(multiply(rotations[parent],rotation))
    return world, rotations


def axis_z(angle):
    return (0, 0, math.sin(angle/2), math.cos(angle/2))


def limb(bones, pose, start, target, pole, end_rotation=IDENTITY):
    """Aim a canonical two-segment limb at a reachable world-space target."""
    world, rotations = forward(bones, pose)
    first = sub(bones[start+1][2], bones[start][2])
    second = sub(bones[start+2][2], bones[start+1][2])
    upper_length, lower_length = math.sqrt(dot(first, first)), math.sqrt(dot(second, second))
    distance = math.sqrt(dot(sub(target, world[start]), sub(target, world[start])))
    if not abs(upper_length-lower_length) < distance <= upper_length+lower_length+1e-8:
        raise ValueError(f'Unreachable target for {bones[start][0]}: {distance}')
    elbow = solve_chain(world[start], target, upper_length, lower_length, pole)
    upper = align(first, sub(elbow, world[start]))
    # Transport the upper orientation before bending the elbow/knee. Independent
    # shortest-arc alignments can introduce a half-turn of artificial limb twist.
    lower = multiply(align(rotate(second, upper), sub(target, elbow)), upper)
    pose[start] = (None, multiply(inverse(rotations[bones[start][1]]), upper))
    pose[start+1] = (None, multiply(inverse(upper), lower))
    pose[start+2] = (None, multiply(inverse(lower), end_rotation))


def planted_legs(bones, pose):
    for start in (6, 9):
        limb(bones, pose, start, bones[start+2][2], (0, 0, 1))


def hanging_arms(bones, pose, raise_angle=0, lateral=False):
    """World-space arm directions independent of a leaning trunk."""
    for start, sign in ((12, 1), (15, -1)):
        world, rotations = forward(bones, pose)
        upper_direction = ((sign*math.sin(raise_angle), -math.cos(raise_angle), 0)
                           if lateral else (sign*.06, -math.cos(raise_angle), math.sin(raise_angle)))
        first = sub(bones[start+1][2], bones[start][2])
        second = sub(bones[start+2][2], bones[start+1][2])
        upper = align(first, upper_direction)
        lower = align(second, upper_direction)
        pose[start] = (None, multiply(inverse(rotations[bones[start][1]]), upper))
        pose[start+1] = (None, multiply(inverse(upper), lower))
        pose[start+2] = (None, IDENTITY)


def additional_pose(bones, t, exercise, amount):
    if exercise in ('dumbbell-lateral-raise', 'dumbbell-front-raise'):
        pose = {}
        hanging_arms(bones, pose, .10+1.25*amount, exercise == 'dumbbell-lateral-raise')
        return pose
    if exercise in ('dumbbell-romanian-deadlift', 'bent-over-dumbbell-row'):
        lean = .78*amount if exercise == 'dumbbell-romanian-deadlift' else .78
        pose = {1: ((0, .98-.10*lean/.78, -.25*lean/.78), axis_x(lean))}
        planted_legs(bones, pose)
        if exercise == 'bent-over-dumbbell-row':
            for arm, sign in ((12, 1), (15, -1)):
                world, _ = forward(bones, pose)
                target = add(world[arm], (sign*.02, -.52+.30*amount, -.15*amount))
                limb(bones, pose, arm, target, (sign, 0, -1))
        else:
            hanging_arms(bones, pose)
        return pose
    if exercise == 'reverse-lunge':
        pose = {1: ((0, .98-.27*amount, -.14*amount), axis_x(.10*amount))}
        limb(bones, pose, 6, bones[8][2], (0, 0, 1))
        target = (-.145, .10+.10*math.sin(math.pi*amount), .035-.67*amount)
        limb(bones, pose, 9, target, (0, 0, 1))
        hanging_arms(bones, pose)
        return pose
    if exercise == 'standing-calf-raise':
        angle = .32*amount
        q = axis_x(angle)
        anchor = (0, .005, .16)
        ankle = add(anchor, rotate(sub((0, .10, .035), anchor), q))
        pose = {1: ((0, .98+ankle[1]-.10, ankle[2]-.035), IDENTITY)}
        for start in (6, 9):
            target = (bones[start][2][0], ankle[1], ankle[2])
            limb(bones, pose, start, target, (0, 0, 1), q)
        hanging_arms(bones, pose)
        return pose
    if exercise == 'glute-bridge':
        q = axis_x(-math.pi/2-.45*amount)
        chest = (0, .15, -.40)
        pelvis = sub(chest, rotate(sub(bones[3][2], bones[1][2]), q))
        pose = {1: (pelvis, q), 3: (None, multiply(inverse(q), axis_x(-math.pi/2)))}
        for start in (6, 9):
            limb(bones, pose, start, (bones[start][2][0], .10, .48), (0, 1, 0))
        return pose
    if exercise == 'dead-bug':
        pose = {1: ((0, .15, 0), axis_x(-math.pi/2))}
        wave = 0 if t % 2 == 0 else math.sin(2*math.pi*t/4)
        for leg, arm, sign in ((6, 15, 1), (9, 12, -1)):
            extension = max(0, sign*wave)**2
            limb(bones, pose, leg, (bones[leg][2][0], .65-.52*extension, .40+.48*extension), (0, 1, 1))
            world, _ = forward(bones, pose)
            shoulder = world[arm]
            angle = math.pi/2*extension
            target = add(shoulder, (0, .52*math.cos(angle), -.52*math.sin(angle)))
            limb(bones, pose, arm, target, ((1 if arm == 12 else -1), 0, 0), axis_x(-math.pi/2))
        return pose
    if exercise == 'bird-dog':
        pose = {1: ((0, .49, -.35), axis_x(math.pi/2))}
        wave = 0 if t % 2 == 0 else math.sin(2*math.pi*t/4)
        for leg, arm, sign in ((9, 12, 1), (6, 15, -1)):
            extension = max(0, sign*wave)**2
            # Support knee stays below hip; active leg unfolds rearward.
            target = (bones[leg][2][0], .11+.42*extension, -.76-.46*extension)
            limb(bones, pose, leg, target, (0, -1, 0), IDENTITY)
            target = ((.32 if arm == 12 else -.32), .045+.50*extension, .30+.31*extension)
            limb(bones, pose, arm, target, ((1 if arm == 12 else -1), 0, -.5), axis_x(-math.pi/2))
        return pose
    if exercise == 'side-lying-hip-abduction':
        q = axis_z(-math.pi/2)
        pose = {1: ((0, .272, 0), q)}
        world, rotations = forward(bones, pose)
        # Upper (right) straight leg abducts in the frontal plane.
        start = 9
        first = sub(bones[10][2], bones[9][2])
        upper = align(first, (-math.cos(.65*amount), math.sin(.65*amount), 0))
        second = sub(bones[11][2], bones[10][2])
        lower = align(second, (-math.cos(.65*amount), math.sin(.65*amount), 0))
        pose[9] = (None, multiply(inverse(rotations[1]), upper))
        pose[10] = (None, multiply(inverse(upper), lower))
        pose[11] = (None, multiply(inverse(lower), q))
        limb(bones, pose, 12, (.52, .10, .24), (0, 1, 0), q)
        limb(bones, pose, 15, (.25, .14, .23), (0, 1, 0), q)
        return pose
    raise ValueError(f'Unknown motion: {exercise}')


def motion_pose(bones, t, exercise, squat_pose):
    amount = (1-math.cos(2*math.pi*t/4))/2
    if exercise == 'bodyweight-squat':
        return {i:(p,axis_x(a)) for i,(p,a) in squat_pose(t).items()}
    if exercise == 'dumbbell-biceps-curl':
        pose = {}
        for start in (12,15):
            # Keep upper arms close to the torso; elbow flexion is not shoulder swing.
            sign = 1 if start == 12 else -1
            rest = sub(bones[start+1][2],bones[start][2])
            pose[start] = (None,multiply(align(rest,(sign*.10,-.278,0)),axis_x(-.08)))
            pose[start+1] = (None,axis_x(-1.95*amount))
            pose[start+2] = (None,IDENTITY)
        return pose
    if exercise != 'push-up':
        return additional_pose(bones, t, exercise, amount)
    lean = 1.35+.16*amount
    ankle = (0,.10,-1.13)
    pelvis = add(ankle,rotate((0,.88,-.035),axis_x(lean)))
    pose = {1:(pelvis,axis_x(lean))}
    for foot in (8,11):
        pose[foot] = (None,axis_x(-lean))
    # Fixed ankle and wrist targets. Full-body pose is solved from the same rest rig.
    targets = [(12,(.39,.045,.29),(1,0,-.5)),
               (15,(-.39,.045,.29),(-1,0,-.5))]
    for start,target,pole in targets:
        world, rotations = forward(bones,pose)
        first,second = sub(bones[start+1][2],bones[start][2]),sub(bones[start+2][2],bones[start+1][2])
        elbow = solve_chain(world[start],target,math.sqrt(dot(first,first)),math.sqrt(dot(second,second)),pole)
        parent = bones[start][1]
        upper_world = align(first,sub(elbow,world[start]))
        pose[start] = (None,multiply(inverse(rotations[parent]),upper_world))
        lower_world = align(second,sub(target,elbow))
        pose[start+1] = (None,multiply(inverse(upper_world),lower_world))
        # Hands and soles stay in a fixed world orientation, not bent with the forearm/shin.
        pose[start+2] = (None,multiply(inverse(lower_world),axis_x(-math.pi/2)))
    return pose
