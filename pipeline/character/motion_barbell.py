"""Original shared-bar motions; every frame solves both hands against one rigid load."""
import math

EXERCISES = ('barbell-back-squat', 'barbell-front-squat', 'barbell-conventional-deadlift',
             'barbell-good-morning', 'barbell-bench-press', 'barbell-overhead-press',
             'barbell-bent-over-row', 'hip-thrust')


def frame(bones,t,exercise,k,squat_pose=None):
    amount=(1-math.cos(2*math.pi*t/4))/2
    result={18:(None,k.IDENTITY),19:(None,k.IDENTITY)}
    hand_angle=0
    poles=((1,0,-1),(-1,0,-1))
    if exercise in ('barbell-back-squat','barbell-front-squat','barbell-good-morning'):
        front=exercise=='barbell-front-squat'
        lean=(.75 if exercise=='barbell-good-morning' else .12 if front else .25)*amount
        depth=(.08 if exercise=='barbell-good-morning' else .40 if front else .36)*amount
        retreat=(.20 if exercise=='barbell-good-morning' else .12 if front else .16)*amount
        result[1]=((0,.98-depth,-retreat),k.axis_x(lean))
        k.planted_legs(bones,result)
        world,_=k.forward(bones,result)
        center=k.add(world[3],k.rotate((0,.15 if front else .07,.15 if front else -.14),k.axis_x(lean)))
        hand_angle=math.pi/2 if front else math.pi/2+lean
        if front:poles=((0,0,1),(0,0,1))
    elif exercise=='barbell-conventional-deadlift':
        lean=1.20*(1-amount)
        center=(0,.17+.698*amount,.16)
        hip_z=-.40*(1-amount)*(1+.60*amount)
        shoulder_z=hip_z+.45*math.sin(lean)
        reach=.534
        height=center[1]+.055+math.sqrt(reach*reach-.09*.09-(center[2]-.005-shoulder_z)**2)-.45*math.cos(lean)
        result[1]=((0,height,hip_z),k.axis_x(lean))
        for leg,sign in ((6,1),(9,-1)):
            toe=(0,math.sin(sign*.25/2),0,math.cos(sign*.25/2))
            k.limb(bones,result,leg,(sign*.20,.10,.035),(sign*.55,0,1),toe)
        poles=((1,-1,0),(-1,-1,0))
    elif exercise=='barbell-bench-press':
        result[1]=((0,.60,0),k.axis_x(-math.pi/2))
        for leg in (6,9):k.limb(bones,result,leg,(bones[leg][2][0],.10,.65),(0,1,0))
        center=(0,.76+.34*amount,-.40)
        hand_angle=math.pi/2
        poles=((1,-1,.4),(-1,-1,.4))
    elif exercise=='barbell-overhead-press':
        for clavicle in (18,19):
            rest=k.sub(bones[clavicle][2],bones[3][2])
            result[clavicle]=(k.add(rest,(0,.03*amount,0)),k.IDENTITY)
        progress=max(0,min(1,(amount-.6)/.4))
        center=(0,1.48+.50*amount,.26*(1-progress*progress*(3-2*progress)))
        hand_angle=-math.pi/2
        poles=((1,.2,.5),(-1,.2,.5))
    elif exercise=='barbell-bent-over-row':
        result[1]=((0,.90,-.20),k.axis_x(.80))
        k.planted_legs(bones,result)
        center=(0,.72+.32*amount,.30-.10*amount)
        poles=((1,0,-1),(-1,0,-1))
    elif exercise=='hip-thrust':
        q=k.axis_x(-math.pi/2+.55*(1-amount))
        result[1]=((0,0,0),q)
        result[3]=(None,k.multiply(k.inverse(q),k.axis_x(-math.pi/2)))
        world,_=k.forward(bones,result)
        pelvis=k.sub((0,.59,-.35),world[3])
        result[1]=(pelvis,q)
        for leg in (6,9):k.limb(bones,result,leg,(bones[leg][2][0],.10,.65),(0,1,0))
        center=k.add(pelvis,k.rotate((0,.015,.180),q))
        hand_angle=-math.pi/2
        poles=((1,-1,0),(-1,-1,0))
    else:raise ValueError(f'Unknown barbell motion: {exercise}')
    hand_rotation=k.axis_x(hand_angle)
    span=k.profiles[exercise].get('barGripSpan',.33)
    for arm,sign,pole in ((12,1,poles[0]),(15,-1,poles[1])):
        grip=(sign*span,center[1],center[2])
        target=k.sub(grip,k.rotate((sign*.02,-.055,.005),hand_rotation))
        k.limb(bones,result,arm,target,pole,hand_rotation)
    return result,{'translation':center,'rotation':k.IDENTITY}


def pose(bones,t,exercise,k,squat_pose=None):
    return frame(bones,t,exercise,k,squat_pose)[0]


def equipment_pose(bones,t,exercise,k,squat_pose=None):
    return {'barbell':frame(bones,t,exercise,k,squat_pose)[1]}
