"""Original hanging, rolling and mobility clips completing the canonical catalog."""
import math

WHEEL_SEGMENTS = ((-.035,.035,.18),(-.25,.25,.018))

EXERCISES = ('pull-up','inverted-row','dead-hang','hanging-knee-raise','bench-dip','pike-push-up',
             'ab-wheel-rollout','shoulder-pendulum','forearm-wall-slide','scapular-retraction',
             'chin-tuck','cervical-rotation','cervical-lateral-flexion','ankle-dorsiflexion-rock',
             'ninety-ninety-hip-rotation','half-kneeling-hip-flexor-stretch','childs-pose')


def axis_y(a):return (0,math.sin(a/2),0,math.cos(a/2))


def hands(bones,p,k,targets,rotation,poles=((1,0,-1),(-1,0,-1))):
    for arm,sign,target,pole in ((12,1,targets[0],poles[0]),(15,-1,targets[1],poles[1])):
        offset=(sign*.02,-.055,.005)
        k.limb(bones,p,arm,k.sub(target,k.rotate(offset,rotation)),pole,rotation)


def frame(bones,t,name,k):
    a=(1-math.cos(2*math.pi*t/4))/2
    wave=math.sin(2*math.pi*t/4) if t not in (0,2,4) else 0
    p={18:(None,k.IDENTITY),19:(None,k.IDENTITY)}
    if name in ('pull-up','dead-hang','hanging-knee-raise'):
        lift=.35*a if name=='pull-up' else 0
        p[1]=((0,1.315+lift,0),k.IDENTITY)
        if name=='hanging-knee-raise':
            for leg in (6,9):
                k.limb(bones,p,leg,(bones[leg][2][0],.48+.50*a,.035+.45*a),(0,0,1))
        hands(bones,p,k,[(s*.30,2.30,.22) for s in (1,-1)],k.axis_x(math.pi),((1,0,0),(-1,0,0)))
    elif name=='inverted-row':
        p[1]=((0,.40+.15*a,.10),k.axis_x(-1.10+.10*a))
        for leg in (6,9):k.limb(bones,p,leg,(bones[leg][2][0],.10,.70),(0,1,0))
        hands(bones,p,k,[(s*.30,1.05,.05) for s in (1,-1)],k.axis_x(math.pi),((1,0,0),(-1,0,0)))
    elif name=='bench-dip':
        p[1]=((0,.49-.15*a,.28),k.IDENTITY)
        for leg in (6,9):k.limb(bones,p,leg,(bones[leg][2][0],.10,.95),(0,1,0))
        hands(bones,p,k,[(s*.28,.49,.10) for s in (1,-1)],k.axis_x(-math.pi/2),((1,0,-1),(-1,0,-1)))
    elif name=='pike-push-up':
        p[1]=((0,.72-.12*a,-.10),k.axis_x(1.9+.18*a))
        for leg in (6,9):k.limb(bones,p,leg,(bones[leg][2][0],.10,-.50),(0,0,-1))
        hands(bones,p,k,[(s*.30,.07,.50) for s in (1,-1)],k.axis_x(-math.pi/2),((1,-1,0),(-1,-1,0)))
    elif name=='ab-wheel-rollout':
        z=.32+.44*a
        lean=1.30+.18*a
        pelvis_z=-.39+.28*a
        hip_z=pelvis_z-.04*math.sin(lean)
        upper=math.sqrt(.43*.43+.015*.015)
        pelvis_y=.08+math.sqrt(upper*upper-(-.35-hip_z)**2)+.04*math.cos(lean)
        p[1]=((0,pelvis_y,pelvis_z),k.axis_x(lean))
        for leg in (6,9):
            world,_=k.forward(bones,p)
            knee=(bones[leg][2][0],.08,-.35)
            foot=(bones[leg][2][0],.11,-.35-math.sqrt(.41*.41+.020*.020-.03*.03))
            k.limb(bones,p,leg,foot,k.sub(knee,world[leg]),k.axis_x(math.pi))
        hands(bones,p,k,[(s*.18,.18,z) for s in (1,-1)],k.axis_x(-math.pi/2),((1,0,-1),(-1,0,-1)))
        return p,{'wheel':{'translation':(0,.18,z),'rotation':k.axis_x((z-.32)/.18)}}
    elif name=='shoulder-pendulum':
        p[1]=((0,.86,-.20),k.axis_x(.80))
        k.planted_legs(bones,p);k.hanging_arms(bones,p)
        world,_=k.forward(bones,p)
        target=k.add(world[15],(-.07+.06*wave,-.49,.05+.045*math.sin(4*math.pi*t/4)))
        k.limb(bones,p,15,target,(-1,-1,0))
        hands_target=(.46,.98,.42)
        k.limb(bones,p,12,hands_target,(1,0,0),k.axis_x(-math.pi/2))
    elif name=='forearm-wall-slide':
        elbow_y=1.30+.20*a
        upper=math.sqrt(.14*.14+.26*.26)
        lower=math.sqrt(.07*.07+.23*.23)
        for arm,sign in ((12,1),(15,-1)):
            world,_=k.forward(bones,p)
            dx=math.sqrt(upper*upper-.245*.245-(elbow_y-world[arm][1])**2)
            elbow=(sign*(.22+dx),elbow_y,.245)
            wrist=k.add(elbow,(0,lower,0))
            k.limb(bones,p,arm,wrist,k.sub(elbow,world[arm]),k.axis_x(math.pi))
    elif name=='scapular-retraction':
        for clavicle in (18,19):
            rest=k.sub(bones[clavicle][2],bones[3][2])
            p[clavicle]=(k.add(rest,(0,0,-.045*a)),k.IDENTITY)
        k.hanging_arms(bones,p)
    elif name in ('chin-tuck','cervical-rotation','cervical-lateral-flexion'):
        k.hanging_arms(bones,p)
        if name=='chin-tuck':
            rest=k.sub(bones[4][2],bones[3][2]);p[4]=(k.add(rest,(0,0,-.040*a)),k.axis_x(.08*a))
            p[5]=(None,k.axis_x(-.08*a))
        elif name=='cervical-rotation':p[4]=(None,axis_y(.45*wave))
        else:p[4]=(None,k.axis_z(.25*wave))
    elif name=='ankle-dorsiflexion-rock':
        p[1]=((0,.82,-.08+.12*a),k.IDENTITY)
        k.limb(bones,p,6,(.145,.10,.32),(0,0,1))
        k.limb(bones,p,9,(-.145,.10,-.26),(0,0,1))
        k.hanging_arms(bones,p)
    elif name=='ninety-ninety-hip-rotation':
        p[1]=((0,.17,0),k.axis_x(-.20))
        # Rotating bent hips sweeps the knees while feet remain on the floor.
        for leg,sign in ((6,1),(9,-1)):
            target=(sign*.45,.10,.50)
            pole=(1.0*wave,.22,-.55*wave)
            k.limb(bones,p,leg,target,pole)
        hands(bones,p,k,[(s*.28,.10,-.12) for s in (1,-1)],k.axis_x(-math.pi/2),((1,-1,0),(-1,-1,0)))
    elif name=='half-kneeling-hip-flexor-stretch':
        upper=math.sqrt(.43*.43+.015*.015)
        p[1]=((0,.08+math.sqrt(upper*upper-.13*.13)+.04,.03),k.IDENTITY)
        k.limb(bones,p,6,(.145,.10,.48),(0,0,1))
        world,_=k.forward(bones,p)
        knee=(-.145,.08,-.10)
        foot=(-.145,.11,-.10-math.sqrt(.41*.41+.020*.020-.03*.03))
        k.limb(bones,p,9,foot,k.sub(knee,world[9]),k.axis_x(math.pi))
        k.hanging_arms(bones,p)
    elif name=='childs-pose':
        lean=1.45
        hip_z=-.42-.04*math.sin(lean)
        upper=math.sqrt(.43*.43+.015*.015)
        py=.08+math.sqrt(upper*upper-(-.15-hip_z)**2)+.04*math.cos(lean)
        p[1]=((0,py,-.42),k.axis_x(lean))
        p[2]=(None,k.axis_x(.35))
        p[3]=(None,k.axis_x(.25))
        for leg in (6,9):
            world,_=k.forward(bones,p)
            knee=(bones[leg][2][0],.08,-.15)
            foot=(bones[leg][2][0],.11,-.15-math.sqrt(.41*.41+.020*.020-.03*.03))
            k.limb(bones,p,leg,foot,k.sub(knee,world[leg]),k.axis_x(math.pi))
        hands(bones,p,k,[(s*.25,.07,.50) for s in (1,-1)],k.axis_x(-math.pi/2),((1,0,1),(-1,0,1)))
    else:raise ValueError(f'Unknown final motion: {name}')
    return p,{}


def pose(bones,t,exercise,k,squat_pose=None):return frame(bones,t,exercise,k)[0]


def equipment_pose(bones,t,exercise,k,squat_pose=None):return frame(bones,t,exercise,k)[1]
