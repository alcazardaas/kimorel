"""Eight distinct band actions with fixed joint goals and physical limb attachments."""
import math

EXERCISES = ('band-internal-rotation', 'band-pallof-press', 'band-triceps-pushdown',
             'seated-band-hamstring-curl', 'band-terminal-knee-extension',
             'band-hip-adduction', 'band-ankle-dorsiflexion', 'band-ankle-plantarflexion')


def frame(bones,time,exercise,k):
    a=(1-math.cos(2*math.pi*time/4))/2
    result={18:(None,k.IDENTITY),19:(None,k.IDENTITY)}
    k.hanging_arms(bones,result)
    if exercise=='band-internal-rotation':
        upper=k.align(k.sub(bones[16][2],bones[15][2]),(0,-1,0))
        upper=k.multiply((0,math.sin(.8*(1-a)/2),0,math.cos(.8*(1-a)/2)),upper)
        _,q=k.forward(bones,result)
        result[15]=(None,k.multiply(k.inverse(q[bones[15][1]]),upper))
        direction=(-math.sin(.95-.8*a),0,math.cos(.95-.8*a))
        rest=k.sub(bones[17][2],bones[16][2])
        lower=k.multiply(k.align(k.rotate(rest,upper),direction),upper)
        result[16]=(None,k.multiply(k.inverse(upper),lower))
        result[17]=(None,k.multiply(k.inverse(lower),k.align((0,-1,0),direction)))
    elif exercise=='band-pallof-press':
        for arm,sign in ((12,1),(15,-1)):
            hand=k.axis_x(-math.pi/2)
            target=k.sub((sign*.065,1.25,.22+.25*a),k.rotate((sign*.02,-.055,.005),hand))
            k.limb(bones,result,arm,target,(sign,-.5,-.5),hand)
    elif exercise=='band-triceps-pushdown':
        world,q=k.forward(bones,result)
        upper=k.align(k.sub(bones[16][2],bones[15][2]),(-.12,-1,.10))
        result[15]=(None,k.multiply(k.inverse(q[bones[15][1]]),upper))
        angle=.10+1.25*a
        direction=(0,-math.sin(angle),math.cos(angle))
        lower=k.multiply(k.align(k.rotate(k.sub(bones[17][2],bones[16][2]),upper),direction),upper)
        result[16]=(None,k.multiply(k.inverse(upper),lower))
        result[17]=(None,k.multiply(k.inverse(lower),k.align((0,-1,0),direction)))
    elif exercise in ('seated-band-hamstring-curl','band-ankle-dorsiflexion','band-ankle-plantarflexion'):
        result[1]=((0,.64,-.12),k.IDENTITY)
        k.limb(bones,result,6,(.145,.10,.50),(0,0,1))
        if exercise=='seated-band-hamstring-curl':
            world,q=k.forward(bones,result)
            upper=k.align(k.sub(bones[10][2],bones[9][2]),(0,-.12,.40))
            result[9]=(None,k.multiply(k.inverse(q[1]),upper))
            angle=.15+1.0*a
            direction=(0,-math.sin(angle),math.cos(angle))
            lower=k.multiply(k.align(k.rotate(k.sub(bones[11][2],bones[10][2]),upper),direction),upper)
            result[10]=(None,k.multiply(k.inverse(upper),lower))
            result[11]=(None,k.inverse(lower))
        else:
            angle=-.50*a if exercise=='band-ankle-dorsiflexion' else .50*a
            k.limb(bones,result,9,(-.145,.23,.58),(0,0,1),k.axis_x(angle))
        for arm,sign in ((12,1),(15,-1)):
            k.limb(bones,result,arm,(sign*.24,.66,.10),(sign,-1,0),k.axis_x(-math.pi/2))
    elif exercise=='band-terminal-knee-extension':
        result[1]=((0,.925+.055*a,-.035*(1-a)),k.IDENTITY)
        k.planted_legs(bones,result)
    elif exercise=='band-hip-adduction':
        x=-.36+.30*a
        # Constant hip-to-ankle reach prevents knee flexion from faking adduction.
        height=.94-math.sqrt(.82**2-(x+.145)**2-.16**2)
        k.limb(bones,result,9,(x,height,.16),(0,0,1))
    else:
        raise ValueError(f'Unknown lower-band motion: {exercise}')
    world,q=k.forward(bones,result)
    spec=k.profiles[exercise]['elasticBand']
    ends=[]
    for attachment in spec['attachments']:
        joint=next(i for i,bone in enumerate(bones) if bone[0]==attachment['bone'])
        ends.append(k.add(world[joint],k.rotate(tuple(attachment['local']),q[joint])))
    end=k.scale(k.add(ends[0],ends[1]),.5) if len(ends)==2 else ends[0]
    return result,{'start':tuple(spec['anchor']),'end':end}


def pose(bones,time,exercise,k,squat_pose=None):
    return frame(bones,time,exercise,k)[0]


def equipment_pose(bones,time,exercise,k,squat_pose=None):
    return {'elasticBand':frame(bones,time,exercise,k)[1]}
