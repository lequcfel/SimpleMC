# SimpleMC 1.0.3 — local development

Includes the performance work originally saved for 1.0.2.

## Native desktop controller

The desktop controller uses Rust with the existing Tauri host. GPUI would add a second rendering system without helping these platform services; the Vue interface remains in place.

- Tray creation and actions live in `apps/app/src/desktop.rs`. Open restores a hidden or minimized window; Quit uses the same close path as the title-bar button and Alt+F4.
- Minimize, maximize/restore and close buttons invoke the Rust controller. Window state is saved natively on a close request.
- Starting a second launcher process restores the existing window instead of merely attempting to focus a hidden window.
- Update checks use a Rust command that owns updater resources and reuses the resource for an already known version. Download requests are serialized. Removing a queued update also invalidates an in-flight download so it cannot enqueue itself afterward.
- Exit-time update scheduling runs in Rust and observes the existing enabled/timing preferences. Checks and automatic downloads on exit have a 15-second total budget, after which the client closes normally. Metered connections skip automatic exit downloads. The existing updater still verifies signatures before installation.
- Startup/manual update presentation and saved preference controls remain in Vue; preferences are synchronized to the native controller. Existing Minecraft hide-to-tray/restore behavior remains in the Rust game process manager.
- Release configuration reads the package version instead of overriding it with a stale version number.

## Validation

- Frontend production build passed.
- Rust checks with updates enabled and disabled, and the development executable build passed.
- Rust close-schedule unit test passed for disabled, startup-only, exit-only and both timings.
- Nine existing performance regression tests passed.
- Actual Windows WebView2 smoke test loaded Home as 1.0.3, verified minimize/maximize/restore, rejected an invalid window action, checked the real public update feed, and exited normally through the native close flow. No update was downloaded or installed: the published version was older than the development version.
- Smoke-test update check: approximately 304 ms. Exit after requesting close: approximately 310 ms. These are single-run functional checks, not before/after performance benchmarks.

Validation used isolated development data and did not modify the installed launcher. Tray menu callbacks share the tested native restore/close functions; the smoke test did not automate clicking the system tray menu or install a new release.
