/** Browser scheduling intervals, not GPU completion or display presentation times. */
export function frameStats(intervals: number[]) {
  if (intervals.some((n) => !Number.isFinite(n) || n <= 0))
    throw new Error('Frame intervals must be finite positive milliseconds');
  if (!intervals.length)
    return { available: false as const, reason: 'No frame intervals' };
  const sorted = [...intervals].sort((a, b) => a - b);
  const total = intervals.reduce((sum, n) => sum + n, 0);
  if (!Number.isFinite(total)) throw new Error('Frame interval sum overflow');
  const mean = total / intervals.length;
  const percentile = (q: number) => sorted[Math.ceil(q * sorted.length) - 1]!;
  return {
    available: true as const,
    samples: intervals.length,
    meanMs: mean,
    medianMs: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    maxMs: sorted.at(-1)!,
    schedulingFps: 1000 / mean,
  };
}
export function heapMetric(value: unknown) {
  const memory = value as Record<string, unknown> | null | undefined;
  const names = [
    'usedJSHeapSize',
    'totalJSHeapSize',
    'jsHeapSizeLimit',
  ] as const;
  if (
    !memory ||
    !names.every(
      (key) =>
        typeof memory[key] === 'number' &&
        Number.isFinite(memory[key]) &&
        Number(memory[key]) >= 0,
    )
  )
    return {
      available: false as const,
      reason: 'Chromium performance.memory unavailable or invalid',
    };
  return {
    available: true as const,
    bytes: {
      used: Number(memory.usedJSHeapSize),
      allocated: Number(memory.totalJSHeapSize),
      limit: Number(memory.jsHeapSizeLimit),
    },
    limitation: 'Coarse Chromium JS heap only; not GPU or process memory',
  };
}

type ContextCount = {
  contextId: number;
  attached: boolean;
  contextLost: boolean;
  lossEvents: number;
  draws: number;
};
/** Counts only work submitted during the interval, never cumulative warmup draws. */
export function sampleDraws(before: ContextCount[], after: ContextCount[]) {
  for (const snapshot of [before, after]) {
    if (
      new Set(snapshot.map((entry) => entry.contextId)).size !==
        snapshot.length ||
      snapshot.some(
        (entry) =>
          !Number.isSafeInteger(entry.contextId) ||
          entry.contextId < 1 ||
          !Number.isSafeInteger(entry.draws) ||
          entry.draws < 0 ||
          !Number.isSafeInteger(entry.lossEvents) ||
          entry.lossEvents < 0,
      )
    )
      throw new Error('Invalid or duplicate context counters');
  }
  const start = before.filter((entry) => entry.attached && !entry.contextLost);
  const end = after.filter((entry) => entry.attached && !entry.contextLost);
  if (
    start.length !== 1 ||
    end.length !== 1 ||
    start[0]!.contextId !== end[0]!.contextId ||
    start[0]!.lossEvents !== end[0]!.lossEvents
  )
    throw new Error(
      'Sampling requires the same single attached context without loss',
    );
  const drawInvocations = end[0]!.draws - start[0]!.draws;
  if (drawInvocations <= 0)
    throw new Error('No draw invocations during sample');
  return { contextId: start[0]!.contextId, drawInvocations };
}
/** Verify only supported effective launch conditions; never persist the raw command line. */
export function profileProvenance(
  browserName: string,
  headless: boolean,
  args: string[],
) {
  if (browserName !== 'chromium' || typeof headless !== 'boolean')
    throw new Error('Only verified Chromium launch conditions are supported');
  if (!args.includes('--enable-automation'))
    throw new Error(
      'Profiling requires explicit command-line verification capability',
    );
  const headlessSwitches = args.filter((arg) => /^--headless(?:=|$)/.test(arg));
  if (
    headlessSwitches.some(
      (arg) => !['--headless', '--headless=new'].includes(arg),
    ) ||
    Boolean(headlessSwitches.length) !== headless
  )
    throw new Error('Effective headless fixture and browser launch disagree');
  const angle = args.filter((arg) => arg.startsWith('--use-angle'));
  const gl = args.filter((arg) => arg.startsWith('--use-gl'));
  if (
    angle.at(-1) !== '--use-angle=swiftshader' ||
    angle.some((arg) => !arg.startsWith('--use-angle=')) ||
    gl.some((arg) => arg !== '--use-gl=angle') ||
    !args.includes('--enable-unsafe-swiftshader') ||
    args.some((arg) =>
      /^--(?:disable-gpu|disable-webgl2?|disable-software-rasterizer)(?:=|$)/.test(
        arg,
      ),
    )
  )
    throw new Error('Unsupported or unverified rendering launch override');
  return {
    headless,
    renderingBackend:
      'Requested ANGLE SwiftShader (verified actual Chromium launch switches)',
    provenance:
      'Effective Playwright headless fixture matched actual Chromium command line; no raw argv retained',
    backendLimitation:
      'Launch request is verified; unmasked GPU identity and GPU completion are not queried',
  };
}

export type ProfileProbe = ReturnType<typeof installProfileProbe>;
/** Injected ONLY by the opt-in harness, never shipped in the application. */
export function installProfileProbe() {
  const contexts: {
    contextId: number;
    lossEvents: number;
    canvas: HTMLCanvasElement;
    gl: WebGLRenderingContext;
    draws: number;
    buffers: Set<object>;
    textures: Set<object>;
    programs: Set<object>;
  }[] = [];
  const original = HTMLCanvasElement.prototype.getContext;
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: function (this: HTMLCanvasElement, ...args: unknown[]) {
      const result = Reflect.apply(original, this, args);
      if (
        !['webgl', 'webgl2'].includes(String(args[0])) ||
        !result ||
        contexts.some((entry) => entry.gl === result)
      )
        return result;
      const gl = result as WebGLRenderingContext;
      const entry = {
        contextId: contexts.length + 1,
        lossEvents: 0,
        canvas: this,
        gl,
        draws: 0,
        buffers: new Set<object>(),
        textures: new Set<object>(),
        programs: new Set<object>(),
      };
      contexts.push(entry);
      this.addEventListener('webglcontextlost', () => {
        entry.lossEvents++;
      });
      for (const [create, remove, objects] of [
        ['createBuffer', 'deleteBuffer', entry.buffers],
        ['createTexture', 'deleteTexture', entry.textures],
        ['createProgram', 'deleteProgram', entry.programs],
      ] as const) {
        for (const name of [create, remove]) {
          const method = gl[name];
          Object.defineProperty(gl, name, {
            configurable: true,
            value: function (
              this: WebGLRenderingContext,
              ...parameters: unknown[]
            ) {
              const returned = Reflect.apply(method, this, parameters);
              if (name === create && returned) objects.add(returned);
              if (name === remove && parameters[0])
                objects.delete(parameters[0] as object);
              return returned;
            },
          });
        }
      }
      for (const name of [
        'drawArrays',
        'drawElements',
        'drawArraysInstanced',
        'drawElementsInstanced',
        'drawRangeElements',
      ]) {
        const method = Reflect.get(gl, name);
        if (typeof method !== 'function') continue;
        Object.defineProperty(gl, name, {
          configurable: true,
          value: function (
            this: WebGLRenderingContext,
            ...parameters: unknown[]
          ) {
            entry.draws++;
            return Reflect.apply(method, this, parameters);
          },
        });
      }
      return result;
    },
  });
  const snapshot = () =>
    contexts.map((entry) => ({
      contextId: entry.contextId,
      lossEvents: entry.lossEvents,
      attached: entry.canvas.isConnected,
      contextLost: entry.gl.isContextLost(),
      draws: entry.draws,
      liveBuffers: entry.buffers.size,
      liveTextures: entry.textures.size,
      livePrograms: entry.programs.size,
      renderer: String(entry.gl.getParameter(entry.gl.RENDERER)),
      vendor: String(entry.gl.getParameter(entry.gl.VENDOR)),
      version: String(entry.gl.getParameter(entry.gl.VERSION)),
    }));
  const probe = {
    snapshot,
    async sample(milliseconds: number) {
      if (!Number.isFinite(milliseconds) || milliseconds < 1000)
        throw new Error('Invalid sampling duration');
      const start = performance.now(),
        before = snapshot(),
        intervals: number[] = [],
        times = new Set<string>();
      const timer = document.querySelector('[aria-label="Animation time"]');
      const watch = new MutationObserver(() =>
        times.add(timer?.textContent ?? ''),
      );
      if (timer)
        watch.observe(timer, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      let previous: number | undefined;
      await new Promise<void>((resolve) => {
        const tick = (now: number) => {
          if (previous !== undefined) intervals.push(now - previous);
          previous = now;
          if (performance.now() - start >= milliseconds) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      watch.disconnect();
      const memory = (
        performance as Performance & {
          memory?: {
            usedJSHeapSize: number;
            totalJSHeapSize: number;
            jsHeapSizeLimit: number;
          };
        }
      ).memory;
      return {
        elapsedMs: performance.now() - start,
        intervals,
        timelineUpdates: times.size,
        before,
        after: snapshot(),
        heap: memory
          ? {
              usedJSHeapSize: memory.usedJSHeapSize,
              totalJSHeapSize: memory.totalJSHeapSize,
              jsHeapSizeLimit: memory.jsHeapSizeLimit,
            }
          : null,
        viewport: {
          width: innerWidth,
          height: innerHeight,
          dpr: devicePixelRatio,
        },
      };
    },
  };
  (
    globalThis as unknown as { __kimorelProfile: typeof probe }
  ).__kimorelProfile = probe;
  return probe;
}
