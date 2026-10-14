# SimpleMC performance results — 14 October 2026

The main measured gaps were a fixed splash delay, unnecessary startup editor code, duplicate metadata and process-status requests, and reloading screenshot metadata/thumbnails when returning to the archive.

## Final before / after comparison

Medians of three runs per version, using the same prepared data and desktop renderer.

| Measurement | Original | Optimized |
| --- | ---: | ---: |
| Process launch to visible Home | 1147 ms | 590 ms |
| Frontend navigation to visible Home | 960 ms | 414 ms |
| Discover first opening | 90 ms | 62 ms |
| Discover repeat opening | 74 ms | 33 ms |
| Older Discover results (page 8) opening | 71 ms | 20 ms |
| Library first opening | 32 ms | 34 ms |
| Library repeat data settling | 58 ms | 44 ms |
| Skin selector first opening | 105 ms | 105 ms |
| Skin selector repeat data settling | 163 ms | 80 ms |
| Screenshots first data settling | 723 ms | 563 ms |
| Screenshots repeat data settling | 633 ms | 175 ms |
| Process-status requests during the navigation/scroll workload | 645 | 11 |

“Opening” is the route's Suspense resolution; “data settling” is the IPC quiet period after rendering, with a 150 ms observation window removed and the result clamped to opening time. Data settling can include background work and network variation; it is not a precise last-image-painted measurement.

The normal Library and first Skin selector opening showed no material improvement. These were already quick in the existing-install workload. First screenshot loading improved, while returning to an existing archive showed the larger gain.

## Each fix was measured separately

| Change | Before | After | Decision |
| --- | --- | --- | --- |
| Remove the 500 ms minimum splash hold; reduce fade from 300 to 150 ms | 945 ms frontend startup | 448 ms | Keep; initialization still has to finish before dismissal |
| Load Settings and the creation icon editor when requested | 448 ms startup; 2,355,623 entry JS bytes / 60 modules | 418 ms; 2,000,317 bytes / 55 modules | Keep; ~15% less initial JavaScript; modal functionality verified |
| Share metadata requests and reuse the existing instance query | Repeat Discover opening 78 ms | 33 ms | Keep; metadata failures retry and values expire after five minutes |
| Bound thumbnail requests to four; reuse recent URLs and screenshot metadata | Repeat screenshot settling 515 ms | 320 ms | Keep; short, bounded caches and update/focus invalidation retained |
| Share running-process status across visible profile cards | 644 process requests in the workload | 11 requests | Keep; launch/finish events invalidate the cache and stale in-flight answers are discarded |
| Parallel startup/skin reads | Startup 413 ms; first Skin opening 63 ms | 410 ms; 61 ms | Reverted; no reliable benefit |
| Calculate only the visible library range, preserving pinned focus/drag cards | ~1,008 ms per 1,000 updates of a 10,000-profile list | ~2.57 ms | Keep; isolated production calculation benchmark, not a whole-app speed claim |
| Reuse successful skin-server health checks for their existing five-minute check interval | Repeat Skin data settling 322 ms; two health probes per workload | 163 ms; zero additional screen-entry health probes | Keep; reconnection still forces a fresh health check |

These rows compare adjacent experimental stages. They should not be added together; network activity and scheduling vary between runs. The final control/optimized table above is the end-to-end confirmation.

## Scrolling

The desktop test was already close to the display refresh limit. Library scroll frame p95 improved from about 11.0 to 10.2 ms, but this small change is not strong evidence of an FPS gain. The clearer improvement is reducing native requests by about 98% and making grid range calculation independent of total profile count during ordinary scrolling.

The range calculation was compared against the original production function in 1,000 cases covering scrolling, focused cards and dragged cards. All results matched. Its large-list CPU benchmark excludes DOM rendering and the index-map construction that happens when data changes.

## Validation

- Production frontend builds passed throughout the comparisons.
- Ten regression tests passed: metadata sharing/expiry/retry, process sharing/filtering/expiry, stale process-answer rejection, failure recovery, bounded/cancelled thumbnail work, thumbnail revision/expiry handling, lazy-modal import retry, and range/pinning equivalence.
- Settings opened and the creation icon editor generated an icon successfully in the desktop renderer.
- A synthetic screenshot added while the page was closed invalidated the cached list and appeared on returning, within the cache's 15-second lifetime.
- The normal build is checked with benchmark mode disabled; no synthetic setup or update-preference changes run in normal builds.

## Method and limits

- Windows x64, Intel Core i9-14900K; other desktop applications remained running.
- 180 synthetic draft profiles and 600 synthetic 1280×720 screenshots. No Minecraft installations were downloaded or launched for these tests.
- A production-built/minified frontend served locally in the actual Tauri WebView2 desktop renderer, using the existing native debug shell. Both versions used the same shell, so native-shell optimization was not part of this work. These absolute times are not measurements of an installed release binary.
- Existing-install startup with first-run migration/setup already completed, prepared backend caches, and repeated frontend launches. Fresh-install setup, first-time mod downloads and real signed-in Microsoft-account services were not benchmarked.
- Three runs per stage are enough to expose large changes, but small timing differences are uncertain. This PC is not representative of older hardware.
- The installed client and public 1.0.1 release were not modified. These changes are in development source.

## Repeat the benchmark

From the source root, using the Windows prerequisites in README:

```powershell
pnpm install --frozen-lockfile
Copy-Item packages/app-lib/.env.example packages/app-lib/.env
$env:TAURI_CONFIG = '{"identifier":"com.simplemc.performance-benchmark","build":{"devUrl":"http://localhost:1420"}}'
cargo build --manifest-path apps/app/Cargo.toml --no-default-features
$env:VITE_SIMPLEMC_BENCHMARK = 'true'
pnpm --filter @modrinth/app-frontend exec vite build
python scripts/benchmark-simplemc.py baseline --seed --runs 3
```

The runner uses an isolated config/WebView directory under `.simplemc-performance`, creates synthetic profiles/screenshots, and closes only the process it started. It only accepts binaries from this repository's `target` directory. The output and fixture directory are ignored by Git and excluded from source packages. Do not use an installed release binary as the benchmark binary.

Apply a change, rebuild with the same benchmark flag, and run:

```powershell
python scripts/benchmark-simplemc.py optimized --runs 3 --validate-modals --validate-screenshots
node --test scripts/simplemc-performance-regression.test.mjs
```

For the original-vs-new grid calculation comparison, additionally set `SIMPLEMC_BEFORE_SOURCE` to a saved original source root, and optionally `SIMPLEMC_PERFORMANCE_RESULTS` to a results directory before the Node test command.

Before a normal build, remove the benchmark flag:

```powershell
Remove-Item Env:VITE_SIMPLEMC_BENCHMARK -ErrorAction SilentlyContinue
```
