"""CPU preview of the actual generated skin and bones; no optional packages."""
import importlib.util
import math
import struct
import zlib
from pathlib import Path

spec = importlib.util.spec_from_file_location('character', Path(__file__).with_name('build.py'))
character = importlib.util.module_from_spec(spec)
spec.loader.exec_module(character)


def rotate(point, angle):
    x, y, z = point
    return (x, y*math.cos(angle)-z*math.sin(angle), y*math.sin(angle)+z*math.cos(angle))


_FRAMES = {}


def view_frame(exercise, positions, width, height):
    """One stable orthographic fit over the entire new clip, never per-frame zoom."""
    az = -1 if character.motions.PROFILES[exercise].get('previewBack') else 1
    key = (exercise, width, height)
    if key not in _FRAMES:
        projected = []
        for time in (0, 1, 2, 3, 4):
            pose = character.motion_pose(character.BONES, time, exercise, character.pose)
            world, rotations = character.motions.forward(character.BONES, pose)
            for point in positions:
                joints, weights = character.weights(point)
                p = [0, 0, 0]
                for joint, weight in zip(joints, weights):
                    relative = character.motions.rotate(character.sub(point, character.BONES[joint][2]), rotations[joint])
                    for k in range(3):
                        p[k] += (world[joint][k]+relative[k])*weight
                projected.append((.8*p[0]-.6*p[2]*az, p[1]))
            if character.motions.PROFILES[exercise].get('wheelSupport'):
                transform=character.motions.equipment_pose(character.BONES,time,exercise,character.pose)['wheel']
                for point in character.barbell.geometry(character.final.WHEEL_SEGMENTS)[0]:
                    x,y,z=character.motions.add(character.motions.rotate(point,transform['rotation']),transform['translation'])
                    projected.append((.8*x-.6*z*az,y))
            if character.motions.PROFILES[exercise].get('sharedBar'):
                transform=character.motions.equipment_pose(character.BONES,time,exercise,character.pose)['barbell']
                for point in character.barbell.geometry()[0]:
                    x,y,z=character.motions.add(character.motions.rotate(point,transform['rotation']),transform['translation'])
                    projected.append((.8*x-.6*z*az,y))
            if character.motions.PROFILES[exercise].get('landminePivot'):
                transform = character.motions.equipment_pose(character.BONES,time,exercise,character.pose)['landmine']
                for point in character.barbell.geometry(character.landmine.SEGMENTS)[0]:
                    x,y,z = character.motions.add(character.motions.rotate(point,transform['rotation']),transform['translation'])
                    projected.append((.8*x-.6*z*az,y))
            if character.motions.PROFILES[exercise].get('elasticBand'):
                endpoints = character.motions.equipment_pose(character.BONES,time,exercise,character.pose)['elasticBand']
                for x,y,z in character.band.deformed_geometry(endpoints,character.motions)[0]:
                    projected.append((.8*x-.6*z*az,y))
            if character.motions.PROFILES[exercise].get('equipment'):
                for joint in (14, 17):
                    if character.BONES[joint][0].split('_')[0] not in character.motions.PROFILES[exercise].get('equipmentHands', ['left','right']):
                        continue
                    x, y, z = world[joint]
                    projected.extend([(.8*x-.6*z*az-.2, y-.2), (.8*x-.6*z*az+.2, y+.2)])
        for instance in character.motions.PROFILES[exercise].get('props', []):
            for point in character.props.geometry(instance['id'])[0]:
                x,y,z = character.motions.add(point, instance['translation'])
                projected.append((.8*x-.6*z*az, y))
        lo = [min(p[i] for p in projected) for i in range(2)]
        hi = [max(p[i] for p in projected) for i in range(2)]
        scale = min((width-60)/(hi[0]-lo[0]), (height-70)/(hi[1]-lo[1]))
        _FRAMES[key] = ((hi[0]+lo[0])/2, (hi[1]+lo[1])/2, scale)
    return _FRAMES[key]


def render(time, width=400, height=480, exercise='bodyweight-squat', geometry=None, highlights=False):
    az = -1 if character.motions.PROFILES[exercise].get('previewBack') else 1
    positions, _normals, indices = geometry or character.mesh()
    frame = None if 'previewScale' in character.motions.PROFILES[exercise] else view_frame(exercise, positions, width, height)
    def project(x, y, z):
        if frame:
            cx, cy, scale = frame
            return (width/2+(.8*x-.6*z*az-cx)*scale, height/2-(y-cy)*scale, (.6*x+.8*z*az)*scale)
        return (width/2+(.8*x-.6*z*az)*character.motions.PROFILES[exercise]['previewScale'], height-70-y*220, (.6*x+.8*z*az)*220)
    pose = character.motion_pose(character.BONES,time,exercise,character.pose)
    forward,quaternion_rotate = character.motions.forward,character.motions.rotate
    world, rotations = forward(character.BONES,pose)
    vertices = []
    for point in positions:
        joints, weights = character.weights(point)
        transformed = [0, 0, 0]
        for joint, weight in zip(joints, weights):
            relative = quaternion_rotate(character.sub(point, character.BONES[joint][2]), rotations[joint])
            for k in range(3):
                transformed[k] += (world[joint][k]+relative[k])*weight
        x,y,z = transformed
        # View from +X,+Z toward the human's front, matching demo framing.
        vertices.append(project(x, y, z))
    human_index_count = len(indices)
    colors_by_region = {}
    if highlights:
        import json
        records = json.loads((Path(__file__).resolve().parents[2]/'packages/data/src/exercises.json').read_text())
        muscles = next(record['muscles'] for record in records if record['id'] == exercise)
        for region in character.region_definition(exercise)['regions'].values():
            if any(m in muscles['primary'] for m in region['muscles']):
                colors_by_region[region['code']] = [255,85,56]
            elif any(m in muscles['secondary'] for m in region['muscles']):
                colors_by_region[region['code']] = [242,183,123]
    if character.motions.PROFILES[exercise].get('equipment'):
        add = character.motions.add
        dv,_dn,di = character.dumbbell_geometry()
        indices = list(indices)
        for joint,sign in [(14,1),(17,-1)]:
            if character.BONES[joint][0].split('_')[0] not in character.motions.PROFILES[exercise].get('equipmentHands', ['left','right']):
                continue
            start = len(vertices)
            for point in dv:
                transformed = add(world[joint],quaternion_rotate(add(point,(sign*.02,-.055,.005)),rotations[joint]))
                x,y,z = transformed
                vertices.append(project(x, y, z))
            indices.extend(start+i for i in di)
    for instance in character.motions.PROFILES[exercise].get('props', []):
        pv,_pn,pi = character.props.geometry(instance['id'])
        start = len(vertices)
        indices = list(indices)
        for point in pv:
            vertices.append(project(*character.motions.add(point, instance['translation'])))
        indices.extend(start+i for i in pi)
    if character.motions.PROFILES[exercise].get('wheelSupport'):
        pv,_pn,pi=character.barbell.geometry(character.final.WHEEL_SEGMENTS)
        transform=character.motions.equipment_pose(character.BONES,time,exercise,character.pose)['wheel']
        start=len(vertices);indices=list(indices)
        for point in pv:
            vertices.append(project(*character.motions.add(quaternion_rotate(point,transform['rotation']),transform['translation'])))
        indices.extend(start+i for i in pi)
    if character.motions.PROFILES[exercise].get('sharedBar'):
        transform=character.motions.equipment_pose(character.BONES,time,exercise,character.pose)['barbell']
        groups=[character.barbell.SEGMENTS]
        if character.motions.PROFILES[exercise].get('barPad'):groups.append(character.barbell.PAD)
        for group in groups:
            pv,_pn,pi=character.barbell.geometry(group)
            start=len(vertices)
            indices=list(indices)
            for point in pv:
                vertices.append(project(*character.motions.add(character.motions.rotate(point,transform['rotation']),transform['translation'])))
            indices.extend(start+i for i in pi)
    if character.motions.PROFILES[exercise].get('landminePivot'):
        transform = character.motions.equipment_pose(character.BONES,time,exercise,character.pose)['landmine']
        pv,_pn,pi = character.barbell.geometry(character.landmine.SEGMENTS)
        start = len(vertices)
        indices = list(indices)
        for point in pv:
            vertices.append(project(*character.motions.add(character.motions.rotate(point,transform['rotation']),transform['translation'])))
        indices.extend(start+i for i in pi)
    if character.motions.PROFILES[exercise].get('elasticBand'):
        endpoints = character.motions.equipment_pose(character.BONES,time,exercise,character.pose)['elasticBand']
        pv,_pn,pi = character.band.deformed_geometry(endpoints,character.motions)
        start = len(vertices)
        indices = list(indices)
        vertices.extend(project(*p) for p in pv)
        indices.extend(start+i for i in pi)
    for attachment in character.motions.PROFILES[exercise].get('elasticBand',{}).get('attachments',[]):
        if attachment.get('strap'):
            joint = next(i for i,bone in enumerate(character.BONES) if bone[0] == attachment['bone'])
            pv,_pn,pi = character.props.geometry(attachment['strap']['id'])
            start = len(vertices)
            indices = list(indices)
            for p in pv:
                point = character.motions.add(world[joint],quaternion_rotate(character.motions.add(p,attachment['strap']['center']),rotations[joint]))
                vertices.append(project(*point))
            indices.extend(start+i for i in pi)
    if len(character.motions.PROFILES[exercise].get('elasticBand',{}).get('attachments',[])) == 2:
        end = character.motions.equipment_pose(character.BONES,time,exercise,character.pose)['elasticBand']['end']
        pv,_pn,pi = character.props.geometry('band-handle')
        start = len(vertices)
        indices = list(indices)
        vertices.extend(project(*character.motions.add(p,end)) for p in pv)
        indices.extend(start+i for i in pi)
    pixels = bytearray([232,237,232]*width*height)
    depths = [-float('inf')]*(width*height)
    for i in range(0,len(indices),3):
        a,b,c = [vertices[index] for index in indices[i:i+3]]
        denominator = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(denominator)<1e-8:
            continue
        # Flat Lambert lighting highlights the actual silhouette and deformation.
        u,v = character.sub(b,a),character.sub(c,a)
        n = (u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])
        light = .6+.35*abs(n[2])/max(character.length(n),1e-8)
        base_color = [50,60,70] if i >= human_index_count else [125,151,145]
        if i < human_index_count and highlights:
            base_color = colors_by_region.get(character.muscle_region(positions[indices[i]], character.region_definition(exercise)), base_color)
        color = [int(channel*light) for channel in base_color]
        for y in range(max(0,int(min(a[1],b[1],c[1]))),min(height,int(max(a[1],b[1],c[1]))+1)):
            for x in range(max(0,int(min(a[0],b[0],c[0]))),min(width,int(max(a[0],b[0],c[0]))+1)):
                wa = ((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/denominator
                wb = ((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/denominator
                wc = 1-wa-wb
                if min(wa,wb,wc)<0:
                    continue
                depth = wa*a[2]+wb*b[2]+wc*c[2]
                index = y*width+x
                if depth > depths[index]:
                    depths[index] = depth
                    pixels[index*3:index*3+3] = bytes(color)
    return pixels


def png(path, pixels, width, height):
    def chunk(kind, data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
    rows = b''.join(b'\0'+pixels[y*width*3:(y+1)*width*3] for y in range(height))
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b''))


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('exercises', nargs='*', help='Registered IDs; omit to render the full catalog.')
    selected = parser.parse_args().exercises or character.motions.EXERCISES
    if any(exercise not in character.motions.EXERCISES for exercise in selected):
        parser.error('Unknown exercise ID')
    root = Path(__file__).resolve().parents[2]
    geometry = character.mesh()
    for exercise in selected:
        height = character.motions.PROFILES[exercise].get('previewHeight', 480)
        frames = [render(time,height=height,exercise=exercise,geometry=geometry) for time in [0,1,2,3,4]]
        strip = bytearray()
        for row in range(height):
            for frame in frames:
                strip.extend(frame[row*400*3:(row+1)*400*3])
        png(root/f'docs/reviews/{exercise}-contact-sheet.png',strip,2000,height)
        png(root/f'assets/thumbnails/{exercise}.png',frames[2],400,height)
        highlighted = [render(time,height=height,exercise=exercise,geometry=geometry,highlights=True) for time in [0,1,2,3,4]]
        strip = bytearray()
        for row in range(height):
            for frame in highlighted:
                strip.extend(frame[row*400*3:(row+1)*400*3])
        png(root/f'docs/reviews/{exercise}-muscle-contact-sheet.png',strip,2000,height)
