# SimpleMC installer

The WPF window embeds the signed NSIS installer, the default client background, and the SimpleMC logo. Windows supplies the .NET Framework runtime; no extra UI package is downloaded. Build on Windows with the .NET Framework compiler.

1. Build the app with `pnpm exec tauri build --config tauri-release.conf.json` from `apps/app` using the existing release signing configuration.
2. Run `installer/Build.ps1` from PowerShell. It reads the client version and creates `target/release/bundle/nsis/SimpleMC_VERSION_x64-installer.exe`.
3. Sign this final installer with `pnpm exec tauri signer sign --private-key-path KEY_PATH INSTALLER_PATH`. Publish its signature and set the updater feed URL and signature to this final file.

The rounded installer window detects the current user's existing installation. New installations offer a folder picker. Repair reinstalls the bundled version in the existing location. Uninstall requires confirmation and preserves profiles/settings unless the user checks the complete-removal option. Complete removal reads the custom data folder from the client database and deletes only client-owned folders there, leaving unrelated files intact. Both operations require the installed client to be closed. Installation uses a real indeterminate progress indicator while the embedded installer runs.

`/S` and `/P` forward their complete arguments to NSIS and return its exit code, retaining automatic-update support. The installer UI never installs anything on opening.

For layout verification without changing an installation, run the installer with `--preview OUTPUT.png`. Add `--fresh` to render the fresh-install view. Preview mode renders the layout to a file without displaying a window or running installation operations.
