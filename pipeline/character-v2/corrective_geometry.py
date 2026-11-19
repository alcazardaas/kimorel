"""Compact semantic masks and bounded posed-space relaxation, without bpy."""
import math

PARAMETERS = {
    'shoulder-elevation': {'joint': 'upper_arm', 'radiusMeters': .21, 'iterations': 32, 'step': .65, 'maxPosedDeltaMeters': .028, 'maxRestDeltaMeters': .055, 'activationDegrees': [0, 25, 65]},
    'hip-flexion': {'joint': 'thigh', 'radiusMeters': .20, 'iterations': 32, 'step': .65, 'maxPosedDeltaMeters': .028, 'maxRestDeltaMeters': .055, 'activationDegrees': [0, 20, 55]},
}


def mask(point, centers, radius):
    if radius <= 0:
        raise ValueError('Invalid support radius')
    d = min(math.dist(point, center) for center in centers)
    return max(0., 1 - (d / radius) ** 2) ** 2 if d < radius else 0.


def activation(angle, onset, peak):
    if not 0 <= onset < peak:
        raise ValueError('Invalid engineering activation interval')
    t = max(0., min(1., (abs(angle) - onset) / (peak - onset)))
    return t * t * (3 - 2 * t)


def bounded(vector, maximum):
    length = math.sqrt(sum(v * v for v in vector))
    if not math.isfinite(length) or maximum <= 0:
        raise ValueError('Invalid displacement')
    return tuple(v * min(1., maximum / length) for v in vector) if length else tuple(vector)


def relax(points, adjacency, masks, iterations, step, maximum):
    """Masked Jacobi relaxation; fixed remote vertices and bounded total travel."""
    if not 0 < step < 1 or iterations < 1 or len(points) != len(masks):
        raise ValueError('Invalid relaxation parameters')
    current = [tuple(p) for p in points]
    for _ in range(iterations):
        updated = list(current)
        for i, neighbors in enumerate(adjacency):
            if masks[i] <= 0 or not neighbors:
                continue
            average = [sum(current[j][axis] for j in neighbors) / len(neighbors) for axis in range(3)]
            candidate = [current[i][axis] + step * masks[i] * (average[axis] - current[i][axis]) for axis in range(3)]
            delta = bounded([candidate[axis] - points[i][axis] for axis in range(3)], maximum)
            updated[i] = tuple(points[i][axis] + delta[axis] for axis in range(3))
        current = updated
    return current
