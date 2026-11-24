"""Local same-topology draft skin refinement; not anatomical weight painting."""
import math


def smoothstep(a, b, x):
    t = max(0., min(1., (x-a)/(b-a)))
    return t*t*(3-2*t)


def support(point):
    """Engineering blend collar, deliberately wider than the measured web patch."""
    x, y, z = point
    return (smoothstep(.13, .18, abs(x)) * (1-smoothstep(.37, .43, abs(x)))
            * smoothstep(1.17, 1.24, y) * (1-smoothstep(1.48, 1.56, y))
            * (1-smoothstep(.12, .18, abs(z))))


def refine(points, adjacency, original, iterations=16, step=.45):
    """Project local stationary influences into chest, then smooth four local fields.

    Projection preserves these seven engineering clips' stationary torso transform,
    not arbitrary future head/trunk animation equivalence. Remote dicts are exact.
    """
    if len(points) != len(original) or len(points) != len(adjacency):
        raise ValueError('Mismatched vertex domains')
    if iterations < 1 or not 0 < step < 1:
        raise ValueError('Invalid smoothing controls')
    masks = [support(p) for p in points]
    projected = []
    for p, weights in zip(points, original):
        side = 'left' if p[0] >= 0 else 'right'
        names = ('chest', side+'_clavicle', side+'_upper_arm', side+'_forearm')
        value = {name: weights.get(name, 0.) for name in names}
        value['chest'] += sum(w for name, w in weights.items() if name not in names)
        projected.append(value)
    current = [dict(w) for w in projected]
    for _ in range(iterations):
        updated = [dict(w) for w in current]
        for i, neighbors in enumerate(adjacency):
            if masks[i] <= 0 or not neighbors:
                continue
            for name in current[i]:
                average = sum(current[j].get(name, 0.) for j in neighbors)/len(neighbors)
                updated[i][name] = current[i][name] + step*masks[i]*(average-current[i][name])
        current = updated
    result = []
    for i, original_weights in enumerate(original):
        if masks[i] <= 0:
            result.append(dict(original_weights))
            continue
        value = {name: projected[i][name]*(1-masks[i])+current[i][name]*masks[i] for name in projected[i]}
        total = sum(value.values())
        if not math.isfinite(total) or total <= 0:
            raise ValueError('Invalid local weight sum')
        result.append({name: w/total for name, w in value.items() if w > 0})
    return result, masks
