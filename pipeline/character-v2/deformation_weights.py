"""Pure, auditable regional draft weights; not artist-painted skinning."""
import math


def segment_distance(point, a, b):
    edge = tuple(y - x for x, y in zip(a, b))
    length2 = sum(v * v for v in edge)
    if length2 <= 0:
        raise ValueError('Zero-length segment')
    t = max(0., min(1., sum((p - x) * e for p, x, e in zip(point, a, edge)) / length2))
    return math.sqrt(sum((p - x - e * t) ** 2 for p, x, e in zip(point, a, edge)))


def smoothstep(a, b, value):
    if b <= a:
        raise ValueError('Invalid blend interval')
    t = max(0., min(1., (value - a) / (b - a)))
    return t * t * (3 - 2 * t)


def normalized_weights(point, segments, priors):
    """Smooth distance kernels with explicit regional priors and four influences."""
    if not all(math.isfinite(v) for v in point):
        raise ValueError('Non-finite point')
    scores = []
    for name, prior in priors.items():
        if prior > 0:
            a, b = segments[name]
            distance = segment_distance(point, a, b)
            # Softer than the preceding inverse-fifth-power kernel, especially at joints.
            scores.append((prior / (.018 ** 2 + distance ** 2) ** 1.5, name))
    scores = sorted(scores, reverse=True)[:4]
    total = sum(score for score, _ in scores)
    if not total or not math.isfinite(total):
        raise ValueError('No finite regional influence')
    return {name: score / total for score, name in scores}


def regional_priors(point, points):
    """Blend torso/limb/palm regions instead of hard coordinate cutovers."""
    x, y, _ = point
    side = 'left' if x >= 0 else 'right'
    medial = .16 + .18 * (1 - smoothstep(.98, 1.48, y))
    arm = smoothstep(medial, medial + .07, abs(x)) * (1 - smoothstep(1.48, 1.58, y))
    leg = 1 - smoothstep(.87, 1.04, y)
    # Hands lie beside the thigh in the retained neutral stance: axial position
    # plus lateral gating avoids assigning thigh vertices to nearby fingers.
    wrist = points[side + '_hand']
    elbow = points[side + '_forearm']
    axis = tuple(w - e for w, e in zip(wrist, elbow))
    length = math.sqrt(sum(v * v for v in axis))
    along = sum((p - w) * e / length for p, w, e in zip(point, wrist, axis))
    palm = smoothstep(-.035, .025, along) * arm
    torso = max(.001, (1 - arm) * (1 - leg))
    priors = {name: torso for name in ('pelvis', 'spine', 'chest', 'neck', 'head')}
    for part in ('clavicle', 'upper_arm', 'forearm', 'hand'):
        priors[side + '_' + part] = arm * (1 - palm) + (.35 * palm if part == 'hand' else 0)
    for part in ('thigh', 'shin', 'foot'):
        priors[side + '_' + part] = leg * (1 - arm)
    for digit in ('thumb', 'index', 'middle', 'ring', 'little'):
        for index in range(1, 4):
            priors[f'{side}_{digit}_{index}'] = palm
    return priors


def digit_radius_limit(chains, clearance=.004):
    """Half the narrowest adjacent mid-shaft spacing minus an explicit air gap.

    Engineering separation margin, not a population-based anatomical radius.
    The supplied chains and joint centers remain unchanged.
    """
    names = ('index', 'middle', 'ring', 'little')
    distances = []
    for a, b in zip(names, names[1:]):
        for station in (1, 2):
            distances.append(math.dist(chains[a][station], chains[b][station]))
    radius = (min(distances) - clearance) / 2
    if radius <= .002:
        raise ValueError('Insufficient digit clearance')
    return radius
