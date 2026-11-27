"""One reference-bound analytic collar; no iterative global body smoothing."""
import importlib.util
import math
from pathlib import Path

spec = importlib.util.spec_from_file_location('groin_pilot_math', Path(__file__).with_name('pilot_motion.py'))
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)

# Measured cross-thigh edges span |X|<=.014, Y=.826.. .921, Z=-.124.. .100.
# Full coverage includes their endpoints; the wide zero-gradient collars join
# the untouched thigh/pelvis field rather than fixing a pair of vertices.
DOMAIN = {'xCore': .025, 'xOuter': .18, 'yLower': .65, 'yCoreLower': .80,
          'yCoreUpper': .95, 'yUpper': 1.10, 'zCore': .15, 'zOuter': .23,
          'pelvisShare': .80, 'thighTransition': .10}


def smooth(a, b, value):
    t = max(0., min(1., (value-a)/(b-a)))
    return t*t*(3-2*t)


def support(point):
    if len(point) != 3 or not all(math.isfinite(value) for value in point):
        raise ValueError('Expected finite neutral point')
    x, y, z = point
    d = DOMAIN
    return ((1-smooth(d['xCore'], d['xOuter'], abs(x))) *
            smooth(d['yLower'], d['yCoreLower'], y) *
            (1-smooth(d['yCoreUpper'], d['yUpper'], y)) *
            (1-smooth(d['zCore'], d['zOuter'], abs(z))))


def derive(point, reference, current=None):
    """Absolute application from immutable reference; reapplication is a no-op.

    The old field may have four slots. The proven continuous fifth-order
    subtraction sparsifier preserves <=4 normalized slots at the collar.
    A current field unrelated to the reference or this derivation is refused.
    """
    amount = support(point)
    left = smooth(-DOMAIN['thighTransition'], DOMAIN['thighTransition'], point[0])
    leg = 1-DOMAIN['pelvisShare']
    target = {name: value for name, value in {'pelvis': DOMAIN['pelvisShare'],
              'left_thigh': leg*left, 'right_thigh': leg*(1-left)}.items() if value > 0}
    result = p.sparse_blend(reference, target, amount) if amount > 0 else dict(reference)
    if current is not None and current != reference and current != result:
        raise ValueError('Current weights do not match pinned reference or derived collar')
    return result


def field(points, edges, reference):
    if len(points) != len(reference):
        raise ValueError('Reference/geometry length mismatch')
    result = [derive(point, old) for point, old in zip(points, reference)]
    active = {i for i, point in enumerate(points) if support(point) > 0}
    affected = [(a, b) for a, b in edges if a in active or b in active]
    boundary = [(a, b) for a, b in affected if (a in active) != (b in active)]
    def gradient(pair, values):
        a, b = pair
        distance = math.dist(points[a], points[b])
        if distance < .001:
            return None
        names = set(values[a]) | set(values[b])
        return sum(abs(values[a].get(name, 0)-values[b].get(name, 0)) for name in names)/distance
    def maximum(pairs, values):
        rows = [(gradient(pair, values), pair) for pair in pairs]
        rows = [(value, pair) for value, pair in rows if value is not None]
        return max(rows, default=(0., None))
    # Record every boundary edge, including tiny edges, so the field cannot hide
    # an edited/untouched discontinuity behind the deformation edge cutoff.
    report = {'domain': DOMAIN, 'changedVertices': len(active), 'affectedEdges': len(affected),
              'maximumGradientBefore': maximum(affected, reference),
              'maximumGradientAfter': maximum(affected, result),
              'boundaryEdges': [{'vertices': [a, b], 'lengthMeters': math.dist(points[a], points[b]),
                                 'gradientBefore': gradient((a, b), reference),
                                 'gradientAfter': gradient((a, b), result)} for a, b in boundary]}
    assert all(result[i] == reference[i] for i in range(len(points)) if i not in active)
    return result, report
