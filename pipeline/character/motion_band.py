"""Original elastic-band motions with independent palm and grounded-anchor constraints."""
import math

EXERCISES = ('band-row', 'band-chest-press', 'band-pull-apart', 'band-face-pull',
             'band-external-rotation')
RADIUS = .009
RINGS = 8
SIDES = 8
PALM = {'left': (.02, -.055, .005), 'right': (-.02, -.055, .005)}


def geometry():
    """Unit-length closed tube; two endpoint joints stretch its centerline, not its radius."""
    vertices, normals, indices = [], [], []
    for ring in range(RINGS+1):
        for side in range(SIDES):
            angle = 2*math.pi*side/SIDES
            vertices.append((ring/RINGS, RADIUS*math.cos(angle), RADIUS*math.sin(angle)))
            normals.append((0, math.cos(angle), math.sin(angle)))
    for ring in range(RINGS):
        for side in range(SIDES):
            a, b = ring*SIDES+side, ring*SIDES+(side+1)%SIDES
            indices.extend((a,b,b+SIDES,a,b+SIDES,a+SIDES))
    for side in range(1,SIDES-1):
        indices.extend((0,side+1,side))
        end = RINGS*SIDES
        indices.extend((end,end+side,end+side+1))
    return vertices, normals, indices


def frame(bones, time, exercise, k):
    amount = (1-math.cos(2*math.pi*time/4))/2
    result = {18: (None,k.IDENTITY), 19: (None,k.IDENTITY)}
    k.hanging_arms(bones,result)
    rotation = k.axis_x(-math.pi/2)
    if exercise == 'band-pull-apart':
        for arm,sign,side in ((12,1,'left'),(15,-1,'right')):
            width = .24+.48*amount
            # Constant shoulder-to-wrist reach preserves the slight elbow bend.
            depth = .055+math.sqrt(.515**2-(width-.24)**2-.035**2)
            grip = (sign*width,1.40,depth)
            target = k.sub(grip,k.rotate(PALM[side],rotation))
            k.limb(bones,result,arm,target,(sign,0,0),rotation)
    elif exercise == 'band-external-rotation':
        # The upper arm rotates axially without moving its elbow; elbow stays bent.
        upper = k.align(k.sub(bones[16][2],bones[15][2]),(0,-1,0))
        upper = k.multiply((0,math.sin(.8*amount/2),0,math.cos(.8*amount/2)),upper)
        _, rotations = k.forward(bones,result)
        result[15] = (None,k.multiply(k.inverse(rotations[bones[15][1]]),upper))
        lower_direction = (-math.sin(.15+.8*amount),0,math.cos(.15+.8*amount))
        rest = k.sub(bones[17][2],bones[16][2])
        lower = k.multiply(k.align(k.rotate(rest,upper),lower_direction),upper)
        result[16] = (None,k.multiply(k.inverse(upper),lower))
        hand = k.align((0,-1,0),lower_direction)
        result[17] = (None,k.multiply(k.inverse(lower),hand))
    else:
        if exercise == 'band-row':
            grip, pole = (-.40,1.17,.48-.34*amount),(-1,-.5,-1)
        elif exercise == 'band-chest-press':
            grip, pole = (-.43,1.28,.18+.34*amount),(-1,-.5,-.3)
        elif exercise == 'band-face-pull':
            grip, pole = (-.44,1.45+.07*amount,.47-.30*amount),(-1,-.1,0)
        else:
            raise ValueError(f'Unknown band motion: {exercise}')
        k.limb(bones,result,15,k.sub(grip,k.rotate(PALM['right'],rotation)),pole,rotation)
    world, rotations = k.forward(bones,result)
    def palm(side):
        joint = 14 if side == 'left' else 17
        return k.add(world[joint],k.rotate(PALM[side],rotations[joint]))
    start = palm('left') if exercise == 'band-pull-apart' else tuple(k.profiles[exercise]['elasticBand']['anchor'])
    return result, {'start': start, 'end': palm('right')}


def pose(bones,time,exercise,k,squat_pose=None):
    return frame(bones,time,exercise,k)[0]


def equipment_pose(bones,time,exercise,k,squat_pose=None):
    return {'elasticBand': frame(bones,time,exercise,k)[1]}


def deformed_geometry(endpoints,k):
    vertices,normals,indices = geometry()
    a,b = endpoints['start'],endpoints['end']
    rotation = k.align((1,0,0),k.sub(b,a))
    positions = [k.add(k.add(k.scale(a,1-x),k.scale(b,x)),k.rotate((0,y,z),rotation)) for x,y,z in vertices]
    return positions,[k.rotate(n,rotation) for n in normals],indices
