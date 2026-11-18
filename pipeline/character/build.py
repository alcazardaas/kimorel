"""Original Kimorel neutral human mesh and squat, standard-library-only GLB authoring.

Generated geometry and motion are dedicated to CC0-1.0. Generator code is MIT.
Uses a continuous implicit surface, skin weights and a reusable glTF skeleton.
"""
from functools import lru_cache
import importlib.util
import json
import math
import struct
from pathlib import Path

_motion_spec = importlib.util.spec_from_file_location('kimorel_motions', Path(__file__).with_name('motions.py'))
motions = importlib.util.module_from_spec(_motion_spec)
_motion_spec.loader.exec_module(motions)
motion_pose = motions.motion_pose
_props_spec = importlib.util.spec_from_file_location('kimorel_props', Path(__file__).with_name('props.py'))
props = importlib.util.module_from_spec(_props_spec)
_props_spec.loader.exec_module(props)
_bar_spec = importlib.util.spec_from_file_location('kimorel_barbell', Path(__file__).with_name('barbell.py'))
barbell = importlib.util.module_from_spec(_bar_spec)
_bar_spec.loader.exec_module(barbell)
landmine = motions._load_family('motion_landmine')
band = motions._load_family('motion_band')
final = motions._load_family('motion_final')

ROOT = Path(__file__).resolve().parents[2]
REGION_DEFINITION = json.loads((ROOT/'packages/schemas/src/muscle-regions.json').read_text())

UPPER_REGION_DEFINITION = json.loads((ROOT/'packages/schemas/src/muscle-regions-upper-quarter.json').read_text())

DUMBBELL_REGION_DEFINITION = json.loads((ROOT/'packages/schemas/src/muscle-regions-dumbbell.json').read_text())

BAND_REGION_DEFINITION = json.loads((ROOT/'packages/schemas/src/muscle-regions-band.json').read_text())

FINAL_REGION_DEFINITION = json.loads((ROOT/'packages/schemas/src/muscle-regions-final.json').read_text())

def region_definition(exercise):
    if motions.PROFILES.get(exercise, {}).get('regionVersion') == '1.6.0':
        return FINAL_REGION_DEFINITION
    if motions.PROFILES.get(exercise, {}).get('regionVersion') == '1.5.0':
        return BAND_REGION_DEFINITION
    if motions.PROFILES.get(exercise, {}).get('regionVersion') == '1.4.0':
        return DUMBBELL_REGION_DEFINITION
    return UPPER_REGION_DEFINITION if motions.PROFILES.get(exercise, {}).get('rig') == 'upper-quarter-v2' else REGION_DEFINITION

def muscle_region(point, definition=None):
    """First matching broad rest-space surface label; zero deliberately unassigned."""
    x,y,z = abs(point[0]),point[1],point[2]
    for region in (definition or REGION_DEFINITION)['regions'].values():
        a,b,c,d,e,f = region['bounds']
        if a <= x < b and c <= y < d and e <= z < f:
            return region['code']
    return 0

# Meter-based Y-up, forward +Z; bone rest orientations are identity.
BONES = [
    ('root', None, (0, 0, 0)), ('pelvis', 0, (0, .98, 0)),
    ('spine', 1, (0, 1.15, 0)), ('chest', 2, (0, 1.38, 0)),
    ('neck', 3, (0, 1.53, 0)), ('head', 4, (0, 1.65, 0)),
]
for side, x in [('left', .145), ('right', -.145)]:
    i = len(BONES)
    BONES += [(f'{side}_thigh', 1, (x, .94, 0)),
              (f'{side}_shin', i, (x, .51, .015)),
              (f'{side}_foot', i+1, (x, .10, .035))]
for side, sign in [('left', 1), ('right', -1)]:
    i = len(BONES)
    BONES += [(f'{side}_upper_arm', 3, (sign*.22, 1.43, 0)),
              (f'{side}_forearm', i, (sign*.36, 1.17, 0)),
              (f'{side}_hand', i+1, (sign*.43, .94, 0))]


def sub(a, b):
    return tuple(x-y for x, y in zip(a, b))


def length(v):
    return math.sqrt(sum(x*x for x in v))


def ellipsoid(p, center, radius):
    q = [(p[i]-center[i])/radius[i] for i in range(3)]
    return (length(q)-1)*min(radius)


def tapered(p, a, b, ra, rb):
    v, w = sub(b, a), sub(p, a)
    t = max(0, min(1, sum(x*y for x, y in zip(v, w))/sum(x*x for x in v)))
    return length(tuple(w[i]-v[i]*t for i in range(3)))-(ra+(rb-ra)*t)


def smooth_min(a, b, k=.045):
    h = max(k-abs(a-b), 0)/k
    return min(a, b)-h*h*k*.25


def field(p):
    # Anatomically shaped torso, pelvis, neck/head and tapered limbs fused into one surface.
    shapes = [ellipsoid(p, (0, 1.00, -.015), (.215, .18, .135)),
              ellipsoid(p, (0, 1.19, 0), (.165, .24, .105)),
              ellipsoid(p, (0, 1.38, 0), (.235, .18, .125)),
              ellipsoid(p, (0, 1.55, 0), (.065, .12, .065)),
              ellipsoid(p, (0, 1.71, .005), (.10, .145, .105))]
    for s in [-1, 1]:
        shapes += [tapered(p, (s*.145, .95, 0), (s*.145, .51, .015), .112, .075),
                   tapered(p, (s*.145, .51, .015), (s*.145, .10, .035), .072, .045),
                   ellipsoid(p, (s*.145, .065, .105), (.064, .06, .16)),
                   tapered(p, (s*.22, 1.43, 0), (s*.36, 1.17, 0), .078, .055),
                   tapered(p, (s*.36, 1.17, 0), (s*.43, .94, 0), .06, .036),
                   ellipsoid(p, (s*.45, .88, .005), (.045, .085, .032))]
    d = shapes[0]
    for shape in shapes[1:]:
        d = smooth_min(d, shape)
    return d


def mesh(step=.035):
    """Marching tetrahedra creates a single indexed, smooth closed implicit surface."""
    bounds = [(-.56, .56), (0, 1.90), (-.22, .32)]
    axes = [[lo+i*step for i in range(math.ceil((hi-lo)/step)+1)] for lo, hi in bounds]
    cache = {}
    def sample(index):
        if index not in cache:
            point = tuple(axes[k][index[k]] for k in range(3))
            cache[index] = (point, field(point))
        return cache[index]
    vertices, normals, triangles, edges = [], [], [], {}
    corners = [(0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1)]
    tetrahedra = [(0,5,1,6),(0,1,2,6),(0,2,3,6),(0,3,7,6),(0,7,4,6),(0,4,5,6)]
    def vertex(a, b):
        key = tuple(sorted((a, b)))
        if key in edges:
            return edges[key]
        pa, da = sample(a)
        pb, db = sample(b)
        t = da/(da-db)
        point = tuple(pa[k]+(pb[k]-pa[k])*t for k in range(3))
        eps = .0001
        gradient = tuple(field(tuple(point[j]+(eps if k==j else 0) for j in range(3))) - field(tuple(point[j]-(eps if k==j else 0) for j in range(3))) for k in range(3))
        n = length(gradient)
        edges[key] = len(vertices)
        vertices.append(point)
        normals.append(tuple(v/n for v in gradient))
        return len(vertices)-1
    for x in range(len(axes[0])-1):
        for y in range(len(axes[1])-1):
            for z in range(len(axes[2])-1):
                cube = [tuple((x,y,z)[k]+c[k] for k in range(3)) for c in corners]
                if all(sample(i)[1]>0 for i in cube) or all(sample(i)[1]<0 for i in cube):
                    continue
                for tet in tetrahedra:
                    inside = [cube[i] for i in tet if sample(cube[i])[1]<0]
                    outside = [cube[i] for i in tet if sample(cube[i])[1]>=0]
                    if not inside or not outside:
                        continue
                    if len(inside)==2:
                        a,b = inside
                        c,d = outside
                        ids = [vertex(a,c),vertex(a,d),vertex(b,d),vertex(b,c)]
                        faces = [(ids[0],ids[1],ids[2]),(ids[0],ids[2],ids[3])]
                    else:
                        one, others = (inside[0],outside) if len(inside)==1 else (outside[0],inside)
                        faces = [tuple(vertex(one,other) for other in others)]
                    for face in faces:
                        a,b,c = [vertices[i] for i in face]
                        u,v = sub(b,a),sub(c,a)
                        cross = (u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])
                        if sum(cross[k]*normals[face[0]][k] for k in range(3))<0:
                            face = (face[0],face[2],face[1])
                        triangles.extend(face)
    return vertices,normals,triangles


@lru_cache(maxsize=None)
def weights(point):
    # Region selection prevents hand/hip proximity from binding unrelated anatomy.
    x,y,_ = point
    if abs(x)>.38 and .78<y<.99:
        return [14 if x>0 else 17,0,0,0], [1,0,0,0]
    if y<.30:
        first = 6 if x>0 else 9
        foot_weight = max(0,min(1,(.30-y)/.12))
        return [first+1,first+2,0,0], [1-foot_weight,foot_weight,0,0]
    if abs(x)>.27 and .78<y<1.50:
        first = 12 if x>0 else 15
        candidates = [first,first+1,first+2] + ([3] if y > 1.30 else [])
    elif y<.99:
        first = 6 if x>0 else 9
        candidates = [1,first,first+1,first+2]
    else:
        candidates = [1,2,3,4,5]
    distances = []
    for i in candidates:
        a = BONES[i][2]
        children = [bone[2] for bone in BONES if bone[1]==i]
        b = children[0] if children else (tuple(a[k]+(a[k]-BONES[BONES[i][1]][2][k])*.4 for k in range(3)) if BONES[i][1] is not None else (0,.1,0))
        v,w = sub(b,a),sub(point,a)
        t = max(0,min(1,sum(q*r for q,r in zip(v,w))/max(sum(q*q for q in v),1e-8)))
        distance = length(tuple(w[k]-v[k]*t for k in range(3)))
        distances.append((distance,i))
    closest = sorted(distances)[:2]
    influence = [1/max(.015,d)**5 for d,_ in closest]
    total = sum(influence)
    return [i for _,i in closest]+[0,0], [w/total for w in influence]+[0,0]


def pose(t):
    amount = (1-math.cos(2*math.pi*t/4))/2
    hip_y,hip_z = .98-.40*amount,-.22*amount
    lean = .32*amount
    values = {1:((0,hip_y,hip_z),lean)}
    for start in [6,9]:
        # Two-bone sagittal IK with fixed ankle contact and measured rest lengths.
        hip = (BONES[start][2][0],hip_y-.04*math.cos(lean),hip_z-.04*math.sin(lean))
        foot = BONES[start+2][2]
        dy,dz = foot[1]-hip[1],foot[2]-hip[2]
        distance = math.hypot(dy,dz)
        upper = length(sub(BONES[start+1][2],BONES[start][2]))
        lower = length(sub(foot,BONES[start+1][2]))
        a = (upper*upper-lower*lower+distance*distance)/(2*distance)
        h = math.sqrt(max(0,upper*upper-a*a))
        knee_y,knee_z = hip[1]+a*dy/distance+h*dz/distance,hip[2]+a*dz/distance-h*dy/distance
        thigh = math.atan2(-(knee_z-hip[2]),-(knee_y-hip[1]))
        shin = math.atan2(-(foot[2]-knee_z),-(foot[1]-knee_y))
        rest_thigh = math.atan2(-.015,.43)
        rest_shin = math.atan2(-.020,.41)
        values[start] = (None,thigh-rest_thigh-lean)
        values[start+1] = (None,shin-rest_shin-(thigh-rest_thigh))
        values[start+2] = (None,-(shin-rest_shin))
    for start in [12,15]:
        values[start] = (None,-1.0*amount-lean)
        values[start+1] = (None,-.20*amount)
    return values


def dumbbell_geometry():
    """Reusable low-poly dumbbell, handle axis X, grip origin at zero."""
    vertices, normals, indices = [], [], []
    for x0,x1,radius in [(-.115,-.065,.07),(-.065,.065,.016),(.065,.115,.07)]:
        start = len(vertices)
        for x in (x0,x1):
            for j in range(12):
                a = 2*math.pi*j/12
                vertices.append((x,radius*math.cos(a),radius*math.sin(a)))
                normals.append((0,math.cos(a),math.sin(a)))
        for j in range(12):
            a,b = start+j,start+(j+1)%12
            indices.extend((a,b,b+12,a,b+12,a+12))
        for offset,reverse in [(0,True),(12,False)]:
            for j in range(1,11):
                face = (start+offset,start+offset+j,start+offset+j+1)
                indices.extend(face[::-1] if reverse else face)
    return vertices,normals,indices


def build(output, animated=True, exercise="bodyweight-squat", geometry=None, equipment_only=False):
    bones = motions.enhanced_bones(BONES) if motions.PROFILES.get(exercise, {}).get('rig') == 'upper-quarter-v2' else BONES
    definition = region_definition(exercise)
    positions,normals,indices = geometry or mesh()
    joints,skin_weights = zip(*(weights(p) for p in positions))
    binary = bytearray()
    document = {'asset':{'version':'2.0','generator':'Kimorel original human v1','copyright':'Kimorel contributors; geometry and motion CC0-1.0'},'scene':0,'scenes':[{'nodes':[0,len(bones)]}],'nodes':[],'bufferViews':[],'accessors':[]}
    def accessor(values,component,kind):
        flat = [n for row in values for n in row] if isinstance(values[0],(list,tuple)) else values
        while len(binary)%4:
            binary.append(0)
        offset = len(binary)
        code = {5126:'f',5123:'H',5125:'I'}[component]
        binary.extend(struct.pack('<'+code*len(flat),*flat))
        view = len(document['bufferViews'])
        document['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(binary)-offset})
        entry = {'bufferView':view,'componentType':component,'count':len(values),'type':kind}
        if kind=='VEC3' and component==5126:
            entry.update(min=[min(row[k] for row in values) for k in range(3)],max=[max(row[k] for row in values) for k in range(3)])
        if kind=='SCALAR':
            entry.update(min=[min(flat)],max=[max(flat)])
        document['accessors'].append(entry)
        return len(document['accessors'])-1
    for i,(name,parent,world) in enumerate(bones):
        local = sub(world,bones[parent][2]) if parent is not None else world
        node = {'name':name,'translation':local}
        children = [j for j,bone in enumerate(bones) if bone[1]==i]
        if children:
            node['children'] = children
        document['nodes'].append(node)
    attributes = {'POSITION':accessor(positions,5126,'VEC3'),'NORMAL':accessor(normals,5126,'VEC3'),'JOINTS_0':accessor(joints,5123,'VEC4'),'WEIGHTS_0':accessor(skin_weights,5126,'VEC4')}
    attributes['_MUSCLE_REGION'] = accessor([muscle_region(p, definition) for p in positions],5123,'SCALAR')
    document['meshes'] = [{'extras':{'kimorelMuscleRegions':{'version':definition['version'],'codes':{key:value['code'] for key,value in definition['regions'].items()}}},'name':'neutral-human-skin','primitives':[{'attributes':attributes,'indices':accessor(indices,5125,'SCALAR'),'material':0}]}]
    document['materials'] = [{'name':'neutral-skin','pbrMetallicRoughness':{'baseColorFactor':[.48,.58,.56,1],'metallicFactor':0,'roughnessFactor':.78}}]
    document['nodes'].append({'name':'human','mesh':0,'skin':0})
    if motions.PROFILES.get(exercise, {}).get('pivots'):
        for foot in (8,11):
            marker = len(document['nodes'])
            document['nodes'].append({'name':bones[foot][0].replace('foot','forefoot'),'translation':[0,-.095,.125]})
            document['nodes'][foot].setdefault('children',[]).append(marker)
    inverse = []
    for _,_,position in bones:
        inverse.append([1,0,0,0,0,1,0,0,0,0,1,0,-position[0],-position[1],-position[2],1])
    document['skins'] = [{'name':motions.PROFILES.get(exercise, {}).get('rig', 'kimorel-v1'),'joints':list(range(len(bones))),'skeleton':0,'inverseBindMatrices':accessor(inverse,5126,'MAT4')}]
    if animated:
        times = [i/30 for i in range(121)]
        time_index = accessor(times,5126,'SCALAR')
        animation = {'name':motions.PROFILES[exercise].get('clip','rep'),'samplers':[],'channels':[]}
        if motions.PROFILES[exercise].get('kind') == 'hold':
            animation['extras'] = {'kimorelMotionKind':'hold'}
        def track(bone,path,values,kind):
            sampler = len(animation['samplers'])
            animation['samplers'].append({'input':time_index,'output':accessor(values,5126,kind),'interpolation':'LINEAR'})
            animation['channels'].append({'sampler':sampler,'target':{'node':bone,'path':path}})
        poses = [motion_pose(bones,t,exercise,pose) for t in times]
        for bone in poses[0]:
            if poses[0][bone][0] is not None:
                track(bone,'translation',[p[bone][0] for p in poses],'VEC3')
        for bone in poses[0]:
            track(bone,'rotation',[p[bone][1] for p in poses],'VEC4')
        document['animations'] = [animation]
    if motions.PROFILES.get(exercise, {}).get('equipment') or equipment_only:
        dv,dn,di = dumbbell_geometry()
        document['materials'].append({'name':'dumbbell-metal','pbrMetallicRoughness':{'baseColorFactor':[.12,.15,.18,1],'metallicFactor':.6,'roughnessFactor':.45}})
        document['meshes'].append({'name':'dumbbell','primitives':[{'attributes':{'POSITION':accessor(dv,5126,'VEC3'),'NORMAL':accessor(dn,5126,'VEC3')},'indices':accessor(di,5125,'SCALAR'),'material':1}]})
        for hand,sign in [(14,1),(17,-1)]:
            if not equipment_only and BONES[hand][0].split('_')[0] not in motions.PROFILES[exercise].get('equipmentHands', ['left','right']):
                continue
            node = len(document['nodes'])
            document['nodes'].append({'name':f'{bones[hand][0]}_grip','translation':[sign*.02,-.055,.005],'children':[node+1]})
            document['nodes'].append({'name':f'{bones[hand][0]}_dumbbell','mesh':1})
            document['nodes'][hand]['children'] = [node]
        if equipment_only:
            # Compact standalone export: no unreachable human mesh, rig or binary data.
            primitive = document['meshes'][1]['primitives'][0]
            used = [primitive['attributes']['POSITION'],primitive['attributes']['NORMAL'],primitive['indices']]
            compact = bytearray()
            accessors,views = [],[]
            for old in used:
                item = dict(document['accessors'][old])
                view = document['bufferViews'][item['bufferView']]
                offset = len(compact)
                compact.extend(binary[view['byteOffset']:view['byteOffset']+view['byteLength']])
                views.append({'buffer':0,'byteOffset':offset,'byteLength':view['byteLength']})
                item['bufferView'] = len(views)-1
                accessors.append(item)
            binary = compact
            document['accessors'],document['bufferViews'] = accessors,views
            document['meshes'] = [{'name':'dumbbell','primitives':[{'attributes':{'POSITION':0,'NORMAL':1},'indices':2,'material':0}]}]
            document['materials'] = [document['materials'][1]]
            document['nodes'] = [{'name':'dumbbell','mesh':0}]
            document['scenes'] = [{'nodes':[0]}]
            document.pop('skins',None)
            document.pop('animations',None)
    if not equipment_only:
        for instance in motions.PROFILES.get(exercise, {}).get('props', []):
            kind = instance['id']
            pv, pn, pi = props.geometry(kind)
            material = len(document['materials'])
            document['materials'].append({'name':kind+'-surface','pbrMetallicRoughness':{'baseColorFactor':[.22,.27,.30,1],'metallicFactor':0,'roughnessFactor':.85}})
            mesh_index = len(document['meshes'])
            document['meshes'].append({'name':kind,'primitives':[{'attributes':{'POSITION':accessor(pv,5126,'VEC3'),'NORMAL':accessor(pn,5126,'VEC3')},'indices':accessor(pi,5125,'SCALAR'),'material':material}]})
            node_index = len(document['nodes'])
            document['nodes'].append({'name':'equipment_'+kind,'mesh':mesh_index,'translation':instance['translation'],'extras':{'kimorelRigidEquipment':kind}})
            document['scenes'][0]['nodes'].append(node_index)
    if motions.PROFILES.get(exercise,{}).get('hangingSupport'):
        for hand,sign in ((14,1),(17,-1)):
            marker=len(document['nodes'])
            document['nodes'].append({'name':bones[hand][0]+'_support_grip','translation':[sign*.02,-.055,.005]})
            document['nodes'][hand].setdefault('children',[]).append(marker)
    if motions.PROFILES.get(exercise,{}).get('wheelSupport'):
        wv,wn,wi=barbell.geometry(final.WHEEL_SEGMENTS)
        material=len(document['materials'])
        document['materials'].append({'name':'wheel-rubber','pbrMetallicRoughness':{'baseColorFactor':[.12,.20,.24,1],'metallicFactor':0,'roughnessFactor':.9}})
        mesh_index=len(document['meshes'])
        document['meshes'].append({'name':'ab-wheel','primitives':[{'attributes':{'POSITION':accessor(wv,5126,'VEC3'),'NORMAL':accessor(wn,5126,'VEC3')},'indices':accessor(wi,5125,'SCALAR'),'material':material}]})
        wheel_node=len(document['nodes'])
        transform=motions.equipment_pose(bones,0,exercise,pose)['wheel']
        document['nodes'].append({'name':'ab_wheel','mesh':mesh_index,**transform,'children':[]})
        document['scenes'][0]['nodes'].append(wheel_node)
        for hand,sign in ((14,1),(17,-1)):
            marker=len(document['nodes'])
            document['nodes'].append({'name':bones[hand][0]+'_support_grip','translation':[sign*.02,-.055,.005]})
            document['nodes'][hand].setdefault('children',[]).append(marker)
            marker=len(document['nodes'])
            document['nodes'].append({'name':('left' if sign==1 else 'right')+'_wheel_grip','translation':[sign*.18,0,0]})
            document['nodes'][wheel_node]['children'].append(marker)
        if animated:
            transforms=[motions.equipment_pose(bones,t,exercise,pose)['wheel'] for t in times]
            track(wheel_node,'translation',[p['translation'] for p in transforms],'VEC3')
            track(wheel_node,'rotation',[p['rotation'] for p in transforms],'VEC4')
    if motions.PROFILES.get(exercise,{}).get('sharedBar'):
        bv,bn,bi=barbell.geometry()
        material=len(document['materials'])
        document['materials'].append({'name':'barbell-metal','pbrMetallicRoughness':{'baseColorFactor':[.12,.15,.18,1],'metallicFactor':.6,'roughnessFactor':.45}})
        mesh_index=len(document['meshes'])
        document['meshes'].append({'name':'barbell','primitives':[{'attributes':{'POSITION':accessor(bv,5126,'VEC3'),'NORMAL':accessor(bn,5126,'VEC3')},'indices':accessor(bi,5125,'SCALAR'),'material':material}]})
        bar_node=len(document['nodes'])
        initial=motions.equipment_pose(bones,0,exercise,pose)['barbell']
        document['nodes'].append({'name':'barbell','mesh':mesh_index,**initial,'children':[]})
        document['scenes'][0]['nodes'].append(bar_node)
        for hand,sign in ((14,1),(17,-1)):
            hand_marker=len(document['nodes'])
            document['nodes'].append({'name':bones[hand][0]+'_bar_grip','translation':[sign*.02,-.055,.005]})
            document['nodes'][hand].setdefault('children',[]).append(hand_marker)
            marker=len(document['nodes'])
            document['nodes'].append({'name':('left' if sign==1 else 'right')+'_bar_grip','translation':[sign*motions.PROFILES[exercise].get('barGripSpan',barbell.GRIP_SPAN),0,0]})
            document['nodes'][bar_node]['children'].append(marker)
        if motions.PROFILES[exercise].get('barPad'):
            pv,pn,pi=barbell.geometry(barbell.PAD)
            pad_material=len(document['materials'])
            document['materials'].append({'name':'hip-pad','pbrMetallicRoughness':{'baseColorFactor':[.25,.28,.27,1],'metallicFactor':0,'roughnessFactor':.95}})
            mesh_index=len(document['meshes'])
            document['meshes'].append({'name':'barbell-pad','primitives':[{'attributes':{'POSITION':accessor(pv,5126,'VEC3'),'NORMAL':accessor(pn,5126,'VEC3')},'indices':accessor(pi,5125,'SCALAR'),'material':pad_material}]})
            pad_node=len(document['nodes'])
            document['nodes'].append({'name':'barbell_pad','mesh':mesh_index})
            document['nodes'][bar_node]['children'].append(pad_node)
        if animated:
            bar_poses=[motions.equipment_pose(bones,t,exercise,pose)['barbell'] for t in times]
            track(bar_node,'translation',[p['translation'] for p in bar_poses],'VEC3')
            track(bar_node,'rotation',[p['rotation'] for p in bar_poses],'VEC4')
    if motions.PROFILES.get(exercise, {}).get('landminePivot'):
        lv, ln, li = barbell.geometry(landmine.SEGMENTS)
        material = len(document['materials'])
        document['materials'].append({'name':'landmine-metal','pbrMetallicRoughness':{'baseColorFactor':[.12,.15,.18,1],'metallicFactor':.6,'roughnessFactor':.45}})
        mesh_index = len(document['meshes'])
        document['meshes'].append({'name':'landmine','primitives':[{'attributes':{'POSITION':accessor(lv,5126,'VEC3'),'NORMAL':accessor(ln,5126,'VEC3')},'indices':accessor(li,5125,'SCALAR'),'material':material}]})
        bar_node = len(document['nodes'])
        initial = motions.equipment_pose(bones,0,exercise,pose)['landmine']
        document['nodes'].append({'name':'landmine','mesh':mesh_index,**initial,'children':[bar_node+1]})
        document['scenes'][0]['nodes'].append(bar_node)
        document['nodes'].append({'name':'landmine_distal_grip','translation':landmine.GRIP})
        hand_marker = len(document['nodes'])
        document['nodes'].append({'name':'right_hand_landmine_grip','translation':[-.02,-.055,.005]})
        document['nodes'][17].setdefault('children',[]).append(hand_marker)
        if animated:
            load_poses = [motions.equipment_pose(bones,t,exercise,pose)['landmine'] for t in times]
            track(bar_node,'translation',[p['translation'] for p in load_poses],'VEC3')
            track(bar_node,'rotation',[p['rotation'] for p in load_poses],'VEC4')
    if motions.PROFILES.get(exercise,{}).get('elasticBand'):
        bv,bn,bi = band.geometry()
        material = len(document['materials'])
        document['materials'].append({'name':'elastic-band','pbrMetallicRoughness':{'baseColorFactor':[.12,.30,.56,1],'metallicFactor':0,'roughnessFactor':.85}})
        endpoint_nodes = [len(document['nodes']),len(document['nodes'])+1]
        for index in (0,1):
            document['nodes'].append({'name':f'band_endpoint_{index}','translation':[index,0,0]})
            document['scenes'][0]['nodes'].append(endpoint_nodes[index])
        bind = [[1,0,0,0,0,1,0,0,0,0,1,0,-x,0,0,1] for x in (0,1)]
        skin_index = len(document['skins'])
        document['skins'].append({'name':'elastic-endpoints-v1','joints':endpoint_nodes,'inverseBindMatrices':accessor(bind,5126,'MAT4')})
        attributes = {'POSITION':accessor(bv,5126,'VEC3'),'NORMAL':accessor(bn,5126,'VEC3'),
                      'JOINTS_0':accessor([(0,1,0,0) for _ in bv],5123,'VEC4'),
                      'WEIGHTS_0':accessor([(1-v[0],v[0],0,0) for v in bv],5126,'VEC4')}
        mesh_index = len(document['meshes'])
        document['meshes'].append({'name':'elastic-band','primitives':[{'attributes':attributes,'indices':accessor(bi,5125,'SCALAR'),'material':material}]})
        document['scenes'][0]['nodes'].append(len(document['nodes']))
        document['nodes'].append({'name':'elastic_band','mesh':mesh_index,'skin':skin_index,'extras':{'kimorelElasticBand':1}})
        attachment_spec = motions.PROFILES[exercise]['elasticBand'].get('attachments')
        if attachment_spec:
            for index,attachment in enumerate(attachment_spec):
                joint = next(i for i,bone in enumerate(bones) if bone[0] == attachment['bone'])
                marker = len(document['nodes'])
                document['nodes'].append({'name':f'band_distal_{index}','translation':attachment['local']})
                document['nodes'][joint].setdefault('children',[]).append(marker)
                if attachment.get('strap'):
                    sv,sn,si = props.geometry(attachment['strap']['id'])
                    mesh = len(document['meshes'])
                    document['meshes'].append({'name':'band-strap','primitives':[{'attributes':{'POSITION':accessor(sv,5126,'VEC3'),'NORMAL':accessor(sn,5126,'VEC3')},'indices':accessor(si,5125,'SCALAR'),'material':material}]})
                    node = len(document['nodes'])
                    document['nodes'].append({'name':f'band_strap_{index}','mesh':mesh,'translation':attachment['strap']['center']})
                    document['nodes'][joint]['children'].append(node)
            if len(attachment_spec) == 2:
                hv,hn,hi = props.geometry('band-handle')
                mesh = len(document['meshes'])
                document['meshes'].append({'name':'band-handle','primitives':[{'attributes':{'POSITION':accessor(hv,5126,'VEC3'),'NORMAL':accessor(hn,5126,'VEC3')},'indices':accessor(hi,5125,'SCALAR'),'material':material}]})
                node = len(document['nodes'])
                document['nodes'].append({'name':'band_handle','mesh':mesh})
                document['scenes'][0]['nodes'].append(node)
                if animated:track(node,'translation',[motions.equipment_pose(bones,t,exercise,pose)['elasticBand']['end'] for t in times],'VEC3')
        else:
            for side,joint in (('left',14),('right',17)):
                if side == 'left' and 'anchor' in motions.PROFILES[exercise]['elasticBand']:continue
                marker = len(document['nodes'])
                document['nodes'].append({'name':side+'_hand_band_grip','translation':band.PALM[side]})
                document['nodes'][joint].setdefault('children',[]).append(marker)
        if animated:
            endpoints = [motions.equipment_pose(bones,t,exercise,pose)['elasticBand'] for t in times]
            rotations = [motions.align((1,0,0),motions.sub(p['end'],p['start'])) for p in endpoints]
            for index,key in enumerate(('start','end')):
                track(endpoint_nodes[index],'translation',[p[key] for p in endpoints],'VEC3')
                track(endpoint_nodes[index],'rotation',rotations,'VEC4')
    document['buffers'] = [{'byteLength':len(binary)}]
    encoded = json.dumps(document,separators=(',',':')).encode()
    encoded += b' '*((-len(encoded))%4)
    binary += b'\0'*((-len(binary))%4)
    glb = struct.pack('<III',0x46546C67,2,12+8+len(encoded)+8+len(binary))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+struct.pack('<II',len(binary),0x004E4942)+binary
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_bytes(glb)
    print(f'{output.name}: {len(dv) if equipment_only else len(positions)} vertices, {len(di)//3 if equipment_only else len(indices)//3} triangles, {len(glb)} bytes')



def build_prop(output, kind, geometry=None):
    positions, normals, indices = geometry or props.geometry(kind)
    binary = bytearray()
    views, accessors = [], []
    def add(values, component, width, shape):
        while len(binary) % 4:
            binary.append(0)
        start = len(binary)
        flat = [v for row in values for v in row] if width > 1 else values
        binary.extend(struct.pack('<'+('f' if component == 5126 else 'I')*len(flat), *flat))
        views.append({'buffer':0,'byteOffset':start,'byteLength':len(binary)-start})
        entry = {'bufferView':len(views)-1,'componentType':component,'count':len(values),'type':shape}
        if shape == 'VEC3':
            entry.update(min=[min(v[i] for v in values) for i in range(3)], max=[max(v[i] for v in values) for i in range(3)])
        accessors.append(entry)
        return len(accessors)-1
    attributes = {'POSITION':add(positions,5126,3,'VEC3'),'NORMAL':add(normals,5126,3,'VEC3')}
    index = add(indices,5125,1,'SCALAR')
    document = {'asset':{'version':'2.0','generator':'Kimorel original rigid equipment v1','copyright':'Kimorel contributors; CC0-1.0'},'scene':0,'scenes':[{'nodes':[0]}], 'nodes':[{'name':kind,'mesh':0}], 'meshes':[{'name':kind,'primitives':[{'attributes':attributes,'indices':index,'material':0}]}], 'materials':[{'name':kind+'-surface','pbrMetallicRoughness':{'baseColorFactor':[.22,.27,.30,1],'metallicFactor':0,'roughnessFactor':.85}}], 'accessors':accessors,'bufferViews':views,'buffers':[{'byteLength':len(binary)}]}
    encoded = json.dumps(document,separators=(',',':')).encode()
    encoded += b' '*((-len(encoded))%4)
    binary += b'\0'*((-len(binary))%4)
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_bytes(struct.pack('<III',0x46546C67,2,12+8+len(encoded)+8+len(binary))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+struct.pack('<II',len(binary),0x004E4942)+binary)

if __name__=='__main__':
    geometry = mesh()
    build(ROOT/'assets/characters/neutral-human.glb',False,geometry=geometry)
    build(ROOT/'assets/equipment/dumbbell.glb',False,geometry=geometry,equipment_only=True)
    for kind in props.DEFINITIONS:
        build_prop(ROOT/f'assets/equipment/{kind}.glb', kind)
    build_prop(ROOT/'assets/equipment/barbell.glb','barbell',barbell.geometry())
    build_prop(ROOT/'assets/equipment/barbell-pad.glb','barbell-pad',barbell.geometry(barbell.PAD))
    build_prop(ROOT/'assets/equipment/landmine-bar.glb','landmine-bar',barbell.geometry(landmine.SEGMENTS))
    build_prop(ROOT/'assets/equipment/resistance-band.glb','resistance-band',band.geometry())
    build_prop(ROOT/'assets/equipment/ab-wheel.glb','ab-wheel',barbell.geometry(final.WHEEL_SEGMENTS))
    for exercise in motions.EXERCISES:
        build(ROOT/f'assets/exercises/{exercise}.glb',exercise=exercise,geometry=geometry)
