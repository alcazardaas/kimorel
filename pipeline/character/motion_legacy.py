"""Stable original thirteen motions; math is supplied by the shared authoring API."""
import math

EXERCISES = ('bodyweight-squat', 'push-up', 'dumbbell-biceps-curl', 'dumbbell-lateral-raise', 'dumbbell-romanian-deadlift', 'reverse-lunge', 'standing-calf-raise', 'dumbbell-front-raise', 'bent-over-dumbbell-row', 'glute-bridge', 'bird-dog', 'dead-bug', 'side-lying-hip-abduction')

def additional_pose(bones, t, exercise, amount, k):
    if exercise in ('dumbbell-lateral-raise', 'dumbbell-front-raise'):
        pose = {}
        k.hanging_arms(bones, pose, .10+1.25*amount, exercise == 'dumbbell-lateral-raise')
        return pose
    if exercise in ('dumbbell-romanian-deadlift', 'bent-over-dumbbell-row'):
        lean = .78*amount if exercise == 'dumbbell-romanian-deadlift' else .78
        pose = {1: ((0, .98-.10*lean/.78, -.25*lean/.78), k.axis_x(lean))}
        k.planted_legs(bones, pose)
        if exercise == 'bent-over-dumbbell-row':
            for arm, sign in ((12, 1), (15, -1)):
                world, _ = k.forward(bones, pose)
                target = k.add(world[arm], (sign*.02, -.52+.30*amount, -.15*amount))
                k.limb(bones, pose, arm, target, (sign, 0, -1))
        else:
            k.hanging_arms(bones, pose)
        return pose
    if exercise == 'reverse-lunge':
        pose = {1: ((0, .98-.27*amount, -.14*amount), k.axis_x(.10*amount))}
        k.limb(bones, pose, 6, bones[8][2], (0, 0, 1))
        target = (-.145, .10+.10*math.sin(math.pi*amount), .035-.67*amount)
        k.limb(bones, pose, 9, target, (0, 0, 1))
        k.hanging_arms(bones, pose)
        return pose
    if exercise == 'standing-calf-raise':
        angle = .32*amount
        q = k.axis_x(angle)
        anchor = (0, .005, .16)
        ankle = k.add(anchor, k.rotate(k.sub((0, .10, .035), anchor), q))
        pose = {1: ((0, .98+ankle[1]-.10, ankle[2]-.035), k.IDENTITY)}
        for start in (6, 9):
            target = (bones[start][2][0], ankle[1], ankle[2])
            k.limb(bones, pose, start, target, (0, 0, 1), q)
        k.hanging_arms(bones, pose)
        return pose
    if exercise == 'glute-bridge':
        q = k.axis_x(-math.pi/2-.45*amount)
        chest = (0, .15, -.40)
        pelvis = k.sub(chest, k.rotate(k.sub(bones[3][2], bones[1][2]), q))
        pose = {1: (pelvis, q), 3: (None, k.multiply(k.inverse(q), k.axis_x(-math.pi/2)))}
        for start in (6, 9):
            k.limb(bones, pose, start, (bones[start][2][0], .10, .48), (0, 1, 0))
        return pose
    if exercise == 'dead-bug':
        pose = {1: ((0, .15, 0), k.axis_x(-math.pi/2))}
        wave = 0 if t % 2 == 0 else math.sin(2*math.pi*t/4)
        for leg, arm, sign in ((6, 15, 1), (9, 12, -1)):
            extension = max(0, sign*wave)**2
            k.limb(bones, pose, leg, (bones[leg][2][0], .65-.52*extension, .40+.48*extension), (0, 1, 1))
            world, _ = k.forward(bones, pose)
            shoulder = world[arm]
            angle = math.pi/2*extension
            target = k.add(shoulder, (0, .52*math.cos(angle), -.52*math.sin(angle)))
            k.limb(bones, pose, arm, target, ((1 if arm == 12 else -1), 0, 0), k.axis_x(-math.pi/2))
        return pose
    if exercise == 'bird-dog':
        pose = {1: ((0, .49, -.35), k.axis_x(math.pi/2))}
        wave = 0 if t % 2 == 0 else math.sin(2*math.pi*t/4)
        for leg, arm, sign in ((9, 12, 1), (6, 15, -1)):
            extension = max(0, sign*wave)**2
            # Support knee stays below hip; active leg unfolds rearward.
            target = (bones[leg][2][0], .11+.42*extension, -.76-.46*extension)
            k.limb(bones, pose, leg, target, (0, -1, 0), k.IDENTITY)
            target = ((.32 if arm == 12 else -.32), .045+.50*extension, .30+.31*extension)
            k.limb(bones, pose, arm, target, ((1 if arm == 12 else -1), 0, -.5), k.axis_x(-math.pi/2))
        return pose
    if exercise == 'side-lying-hip-abduction':
        q = k.axis_z(-math.pi/2)
        pose = {1: ((0, .272, 0), q)}
        world, rotations = k.forward(bones, pose)
        # Upper (right) straight leg abducts in the frontal plane.
        start = 9
        first = k.sub(bones[10][2], bones[9][2])
        upper = k.align(first, (-math.cos(.65*amount), math.sin(.65*amount), 0))
        second = k.sub(bones[11][2], bones[10][2])
        lower = k.align(second, (-math.cos(.65*amount), math.sin(.65*amount), 0))
        pose[9] = (None, k.multiply(k.inverse(rotations[1]), upper))
        pose[10] = (None, k.multiply(k.inverse(upper), lower))
        pose[11] = (None, k.multiply(k.inverse(lower), q))
        k.limb(bones, pose, 12, (.52, .10, .24), (0, 1, 0), q)
        k.limb(bones, pose, 15, (.25, .14, .23), (0, 1, 0), q)
        return pose
    raise ValueError(f'Unknown motion: {exercise}')


def pose(bones, t, exercise, k, squat_pose=None):
    amount = (1-math.cos(2*math.pi*t/4))/2
    if exercise == 'bodyweight-squat':
        return {i:(p,k.axis_x(a)) for i,(p,a) in squat_pose(t).items()}
    if exercise == 'dumbbell-biceps-curl':
        pose = {}
        for start in (12,15):
            # Keep upper arms close to the torso; elbow flexion is not shoulder swing.
            sign = 1 if start == 12 else -1
            rest = k.sub(bones[start+1][2],bones[start][2])
            pose[start] = (None,k.multiply(k.align(rest,(sign*.10,-.278,0)),k.axis_x(-.08)))
            pose[start+1] = (None,k.axis_x(-1.95*amount))
            pose[start+2] = (None,k.IDENTITY)
        return pose
    if exercise != 'push-up':
        return additional_pose(bones, t, exercise, amount, k)
    lean = 1.35+.16*amount
    ankle = (0,.10,-1.13)
    pelvis = k.add(ankle,k.rotate((0,.88,-.035),k.axis_x(lean)))
    pose = {1:(pelvis,k.axis_x(lean))}
    for foot in (8,11):
        pose[foot] = (None,k.axis_x(-lean))
    # Fixed ankle and wrist targets. Full-body pose is solved from the same rest rig.
    targets = [(12,(.39,.045,.29),(1,0,-.5)),
               (15,(-.39,.045,.29),(-1,0,-.5))]
    for start,target,pole in targets:
        world, rotations = k.forward(bones,pose)
        first,second = k.sub(bones[start+1][2],bones[start][2]),k.sub(bones[start+2][2],bones[start+1][2])
        elbow = k.solve_chain(world[start],target,math.sqrt(k.dot(first,first)),math.sqrt(k.dot(second,second)),pole)
        parent = bones[start][1]
        upper_world = k.align(first,k.sub(elbow,world[start]))
        pose[start] = (None,k.multiply(k.inverse(rotations[parent]),upper_world))
        lower_world = k.align(second,k.sub(target,elbow))
        pose[start+1] = (None,k.multiply(k.inverse(upper_world),lower_world))
        # Hands and soles stay in a fixed world orientation, not bent with the forearm/shin.
        pose[start+2] = (None,k.multiply(k.inverse(lower_world),k.axis_x(-math.pi/2)))
    return pose
