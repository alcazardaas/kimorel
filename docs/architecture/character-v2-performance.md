# Measure the pilot without claiming device acceptance

The opt-in harness observes the actual catalog viewer for all three pilot exercises, comparing v1 and v2. It changes no runtime code, assets or defaults. Results are local engineering observations, **not** performance approval or physical-device evidence.

## Collect a local software-renderer baseline

```sh
pnpm build
KIMOREL_PROFILE=1 pnpm exec playwright test tests/browser/pilot-profile.spec.ts --config playwright.config.ts
```

The explicit opt-in prevents profiling during ordinary browser tests. Budget roughly 100–130 seconds for both Chromium projects: twelve fresh contexts, each with a one-second real-time warmup and five-second real-time sample, plus loads. Do not use an artificial clock, CPU/network throttling or concurrent workloads for the baseline. The existing config runs **headless Chromium with forced ANGLE SwiftShader**, so these are software-renderer observations, not hardware-GPU measurements. Fresh contexts honor each project’s effective viewport, DPR, mobile/touch, screen and configured user-agent settings. Browser-observed dimensions/DPR/touch/screen are checked against those inputs. Mobile emulation does not turn Chromium into a physical-phone measurement.

Find raw JSON at `.cache/character-v2-profile/<project-name>.json` and in each Playwright attachment. It records browser version, rendering conditions, exact loaded asset SHA256/bytes, viewport/DPR and masked WebGL strings. It intentionally does not query unmasked hardware identifiers, hostnames, user identity or external telemetry.

| Metric                                       | What it means / limitation                                                                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selection-to-ready                           | UI action to enabled viewer control, including load/parse and polling; not shader completion or first presentation                                               |
| Resource timing / bytes                      | Local loopback fetch timing and browser resource counters; byte length/hash come from the actual response; OS caches may be warm                                 |
| Scheduling FPS / median/p95/p99/max interval | Independent requestAnimationFrame cadence over the sample; **not GPU duration, rendered frame throughput or display presentation**                               |
| WebGL draws / live resources                 | Instrumented core draw API calls and buffer/texture/program handle counts, before/after; not bytes or Three.js geometry counts; context attachment/loss retained |
| JS heap                                      | Coarse Chromium-only `performance.memory` when available; not total process or GPU memory                                                                        |
| GPU/process/Three.js memory                  | Explicitly unavailable/not sampled; never substituted with JS heap or inferred totals                                                                            |

Injection adds overhead. Common core draw calls are counted; extension multi-draw is not. Timeline updates must prove the actual animation advances during each sample. No performance pass thresholds are invented. Keep missing measurements distinct from genuine zero counts. A five-second scheduling sample cannot establish stability, battery, thermal behavior or adoption readiness.

## Physical-device handoff — still pending

1. The human tester names the physical device, OS/browser versions, viewport/DPR, power/thermal state and test date in a separate review record. Do not infer hardware from an emulated viewport or user-agent string.
2. After separately authorizing the destination/session and transfer, serve the same built revision and hash-bound three assets on the device. No device connection, network exposure or transfer is authorized by this document.
3. Use browser developer tools on that device to record load/parse/render responsiveness and memory where supported; label unsupported GPU/process metrics unavailable. Capture the same camera, normal-speed loop, warmup/sample conditions and v1/v2 order; repeat to assess variance and thermal drift.
4. Record exact asset hashes, measured distributions, visual/contact issues and any frame drops. Do not apply the headless software baseline as a phone pass/fail limit. Qualified human review defines acceptance and notes limitations before migration.

## Observed local baseline — 2026-11-26

One opt-in run completed in 49.0 seconds with six actual samples, using the unchanged viewer runtime from `e484c68` (checkout `34b0faa`). Chromium `159.0.8154.6`, headless forced ANGLE SwiftShader, 1280×900/DPR1, masked renderer `WebKit WebGL`, vendor `WebKit`, WebGL 2.0. This is **software-renderer local evidence, not phone or hardware-GPU acceptance**. No performance thresholds were applied.

[Raw observation JSON](./character-v2-local-profile.json) preserves exact values; its SHA256 is `324e899d969db22d1fc17601460352c090c8a240d538d99e36a9c3c1a40449d5`. The actual response bytes/hashes were independently matched against all six source GLBs. Tables round timing to one decimal; MB below are decimal JS-heap bytes, not GPU memory.

| Exercise                | Variant | Asset bytes | Ready ms | Fetch ms | RAF median / p95 / p99 / max ms | Scheduling FPS | Used JS heap MB |
| ----------------------- | ------- | ----------: | -------: | -------: | ------------------------------- | -------------: | --------------: |
| bodyweight-squat        | v1      |      637496 |    744.6 |      3.0 | 16.7 / 33.4 / 33.4 / 33.4       |           49.6 |            19.3 |
| bodyweight-squat        | v2      |     2136660 |    711.3 |      5.0 | 33.3 / 50.0 / 50.1 / 66.6       |           30.5 |            23.1 |
| push-up                 | v1      |      633252 |    868.5 |      2.7 | 16.7 / 33.3 / 33.4 / 66.7       |           52.4 |            20.5 |
| push-up                 | v2      |     2136116 |    490.3 |      4.7 | 33.3 / 50.0 / 83.3 / 100.1      |           30.1 |            24.5 |
| dumbbell-shoulder-press | v1      |      637396 |    554.2 |      2.5 | 16.7 / 33.4 / 33.4 / 50.0       |           50.8 |            19.3 |
| dumbbell-shoulder-press | v2      |     2149004 |    550.0 |      5.3 | 33.3 / 50.0 / 66.8 / 150.0      |           29.8 |            27.6 |

| Exact loaded asset         | SHA256                                                             |
| -------------------------- | ------------------------------------------------------------------ |
| bodyweight-squat v1        | `b225d7512d484f1e5234dcaed1c45dbfcd59d2ea3a8a8397b6550dbf63ccccd7` |
| bodyweight-squat v2        | `aa4d75481e1681078b6ba0122d2962937dc1b8515653091f4650c3f58f3b89c4` |
| push-up v1                 | `1d4b39035b6866d7818a4f97e4bddf6880b55ed71ef028b8f115f3d45bb1ad2f` |
| push-up v2                 | `96b075f4a9868b8ea6e1d74cd2db347138f1363363d4953f98107d6f48170484` |
| dumbbell-shoulder-press v1 | `ff961bce175308c17eea4e30e152623db5abeaefd1378926073eaffc094471f1` |
| dumbbell-shoulder-press v2 | `1013c7f16017c34e50df2288291b4458f9d91f171d62cd6649f4434dcc614c42` |

| Exercise / variant         | Active buffers / textures / programs | Draw invocations during sample | Timeline updates | Sample ms |
| -------------------------- | ------------------------------------ | -----------------------------: | ---------------: | --------: |
| bodyweight-squat v1        | 9 / 6 / 2                            |                            498 |               45 |    5016.5 |
| bodyweight-squat v2        | 8 / 7 / 2                            |                            306 |               40 |    5030.5 |
| push-up v1                 | 9 / 6 / 2                            |                            526 |               45 |    5009.0 |
| push-up v2                 | 8 / 7 / 2                            |                            302 |               41 |    5022.8 |
| dumbbell-shoulder-press v1 | 12 / 6 / 3                           |                           1020 |               44 |    5002.2 |
| dumbbell-shoulder-press v2 | 11 / 7 / 3                           |                            596 |               39 |    5020.2 |

Only the attached, non-lost context is summarized. Raw `live*` counters mean outstanding create/delete API handles; context loss can invalidate handles without explicit delete calls. Detached/lost contexts retain residual counters in the raw trace and are **not live GPU allocations or evidence of a leak**. Active counts were stable over this short sample; that is not long-run leak proof.

JS heap was available in all six samples: allocated 29.4–37.3 MB, coarse limit 3760 MB. V2 setup first loads v1 before opting in, so different load/GC histories and the injected probe’s retained references preclude interpreting heap differences as retained model-memory costs. GPU memory, process memory and Three.js geometry memory remain explicitly unavailable. Ready timing includes different UI/setup paths, polling, and warm OS caches; do not infer that the larger v2 file loads faster from this one run.

V2 showed lower browser scheduling cadence in this software run (about 30 versus 50 events/s), but these numbers do not identify a bottleneck or establish rendered/presented FPS. Repeated controlled observations and real named-device measurements are required before an optimization or migration decision. Physical-device performance, anatomy, clinical acceptance and v2 muscle overlays remain pending.

## Hardened collection checks

New collection runs assign page-local context IDs and require positive **during-sample** draw invocations on the same attached, non-lost context. Warmup-only draws, replacement, lost/restored contexts and invalid counters fail collection. These are CPU-side WebGL API invocations, not GPU-completion or presentation measurements.

The opt-in test alone supplies `--enable-automation` so Chromium can expose its command-line verification capability; ordinary browser tests and app settings are unchanged. If that capability is unavailable, collection stops before sampling. The harness checks the effective Playwright headless fixture against the actual Chromium launch switches via CDP. It verifies the supported ANGLE SwiftShader **launch request**, rejecting unknown/conflicting graphics overrides; it does not query unmasked GPU identity or claim the requested backend proves hardware identity. Headed overrides are reported as headed when their effective fixture and actual launch agree. Only the verified condition summary is retained, never raw command-line arguments or profile paths. An unavailable verification fails collection rather than emitting an assumed label.

The dated baseline and raw JSON above remain unchanged historical observations from the known headless software configuration. New checks strengthen subsequent collection; they do not retrospectively relabel that baseline or grant device acceptance.

## Desktop and mobile-sized Chromium coverage

The default command above now runs both existing Chromium projects. Report `emulationInput` records the effective project options, while each sample records actual inner dimensions, DPR, touch points, pointer mode and configured user agent. Drawing-buffer and canvas CSS sizes are captured separately: window DPR is not assumed to equal the viewer’s rendering scale. Actual same-context interval draws and launch provenance remain required.

This responsive/emulated coverage is not a physical Pixel device, mobile GPU, thermal/battery test or deployment authorization. The dated baseline above retains its original 1280×900/DPR1 conditions; it is not silently relabeled as this expanded coverage.

## Observed desktop/mobile-emulated pair — 2026-11-26

Both Chromium projects completed: two collection tests, twelve actual samples, about 1.7 minutes (desktop 50.8s, mobile 49.6s). This pair uses the same current harness and unchanged shipping viewer; compare these two runs with each other, **not the older 900px-high baseline**. Chromium 159.0.8154.6, effective headless=true, actual launch request verified as ANGLE SwiftShader; masked renderer remains WebKit WebGL. No raw argv or unmasked hardware identity is recorded. All twelve response SHA256/byte counts independently match the six source GLBs and exact asset identities above.

| Project emulation | Requested / observed viewport | Window DPR | Screen    | Mobile / touch | Actual touch points / coarse pointer | Canvas CSS / drawing buffer |
| ----------------- | ----------------------------- | ---------: | --------- | -------------- | ------------------------------------ | --------------------------- |
| desktop           | 1280×720                      |          1 | 1920×1080 | false / false  | 0 / false                            | 828×440 / 828×440           |
| mobile            | 412×839                       |      2.625 | 412×915   | true / true    | 1 / true                             | 366×440 / 549×660           |

The mobile user-agent string is a **configured Pixel 7 browser-emulation descriptor**, not a detected physical Pixel. Actual viewport/DPR/screen/touch/UA matched project inputs for every sample. The mobile drawing buffer is 1.5× its CSS size despite window DPR 2.625; these are different metrics.

| Project | Exercise / variant         | Ready ms | Scheduling events/s | p95 / max RAF ms | During-sample draws | Used JS heap MB |
| ------- | -------------------------- | -------: | ------------------: | ---------------- | ------------------: | --------------: |
| desktop | bodyweight-squat v1        |    779.6 |                47.6 | 33.4 / 83.4      |                 478 |            21.7 |
| desktop | bodyweight-squat v2        |    570.3 |                30.5 | 33.4 / 66.7      |                 308 |            26.0 |
| desktop | push-up v1                 |    823.6 |                50.4 | 33.4 / 66.8      |                 506 |            21.7 |
| desktop | push-up v2                 |    646.7 |                30.4 | 33.4 / 83.4      |                 306 |            27.6 |
| desktop | dumbbell-shoulder-press v1 |   1126.2 |                49.2 | 33.4 / 33.4      |                 984 |            19.3 |
| desktop | dumbbell-shoulder-press v2 |    560.6 |                30.7 | 33.4 / 66.6      |                 612 |            26.0 |
| mobile  | bodyweight-squat v1        |    462.9 |                59.6 | 16.7 / 33.3      |                 598 |            21.7 |
| mobile  | bodyweight-squat v2        |    590.7 |                35.0 | 33.4 / 50.1      |                 350 |            26.0 |
| mobile  | push-up v1                 |    429.8 |                60.0 | 16.8 / 16.8      |                 602 |            21.7 |
| mobile  | push-up v2                 |    587.2 |                33.7 | 33.4 / 116.7     |                 338 |            23.1 |
| mobile  | dumbbell-shoulder-press v1 |    451.8 |                57.0 | 16.8 / 50.0      |                1144 |            19.3 |
| mobile  | dumbbell-shoulder-press v2 |    798.3 |                24.9 | 66.7 / 133.3     |                 500 |            24.5 |

Every sample retained one attached, non-lost context with matching IDs and positive draw delta; context loss counters remained zero and actual timeline updates 40–46 proved animation progression. These are CPU API submissions and scheduling cadence, not GPU duration, rendered/presented FPS or performance acceptance. JS heap was available but remains coarse and affected by setup/GC/probe references. GPU/process memory remain unavailable.

| Exact raw report                                                      | SHA256                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [desktop observation](./character-v2-profile-desktop-2026-11-26.json) | `40840b9b3736841b420328c7ef0ffac691990de286c149c7ed975af0bc9bed39` |
| [mobile observation](./character-v2-profile-mobile-2026-11-26.json)   | `c9643648c39fc16ea0cc416c5c2ba4016699a354ac23eb683f3757514a299317` |

Mobile-emulated v2 shoulder press showed 24.9 scheduling events/s with 66.7ms p95 in this single software run. That is a useful follow-up observation, not an identified bottleneck, hardware-phone result or pass/fail threshold. Different viewport, raster scale, emulation and run noise prevent attributing differences to a device GPU. Repeated measurements and separately authorized named physical-device testing remain necessary; no phone, anatomical, clinical or v2-overlay acceptance is granted.
