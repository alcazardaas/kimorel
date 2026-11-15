"""Original reusable quaternion motion clips; meters, Y-up, +Z forward."""
import math
import json
from pathlib import Path
from types import SimpleNamespace

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



def _load_family(name):
    """Load sibling authoring modules without mutating import search paths."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name+'.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_API = SimpleNamespace(
    IDENTITY=IDENTITY,
    add=add,
    sub=sub,
    scale=scale,
    dot=dot,
    unit=unit,
    cross=cross,
    multiply=multiply,
    inverse=inverse,
    rotate=rotate,
    axis_x=axis_x,
    align=align,
    solve_chain=solve_chain,
    forward=forward,
    axis_z=axis_z,
    limb=limb,
    planted_legs=planted_legs,
    hanging_arms=hanging_arms,
)
_FAMILIES = [_load_family(name) for name in (
    'motion_legacy', 'motion_standing', 'motion_holds', 'motion_quadruped', 'motion_floor'
)]
_REGISTRY = {}
for family in _FAMILIES:
    for exercise in family.EXERCISES:
        if exercise in _REGISTRY:
            raise ValueError(f'Duplicate authored motion: {exercise}')
        _REGISTRY[exercise] = family.pose
if set(_REGISTRY) != set(PROFILES):
    raise ValueError('Authored motion families and QA profiles must match exactly')


def motion_pose(bones, t, exercise, squat_pose):
    try:
        author = _REGISTRY[exercise]
    except KeyError as error:
        raise ValueError(f'Unknown motion: {exercise}') from error
    return author(bones, t, exercise, _API, squat_pose)
