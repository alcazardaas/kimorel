"""Original reusable quaternion motion clips; meters, Y-up, +Z forward."""
import math

IDENTITY = (0, 0, 0, 1)
EXERCISES = ('bodyweight-squat', 'push-up', 'dumbbell-biceps-curl')


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
        raise ValueError(f'Unknown motion: {exercise}')
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
