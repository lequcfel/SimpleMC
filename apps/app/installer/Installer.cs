using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Win32;

[assembly: AssemblyVersion("__VERSION__.0")]
[assembly: AssemblyFileVersion("__VERSION__.0")]
[assembly: AssemblyProduct("SimpleMC")]
[assembly: AssemblyTitle("SimpleMC Installer")]

internal static class Installer
{
	private static Window window;
	private static string installDirectory;
	private static bool installed, busy, ready;
	private static readonly bool PreviewOnly = __PREVIEW_ONLY__;
	private const string MaintenanceName = "SimpleMC-maintenance.exe";
	private const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\SimpleMC";

	[STAThread]
	private static int Main(string[] args)
	{
		try
		{
			if (Array.Exists(args, arg => arg.Equals("/S", StringComparison.OrdinalIgnoreCase) || arg.Equals("/P", StringComparison.OrdinalIgnoreCase)))
			{
				if (PreviewOnly) return 1;
				string forwarded = GetForwardedArguments();
				if (Array.IndexOf(args, "--uninstall") >= 0)
				{
					if (!forwarded.StartsWith("--uninstall", StringComparison.Ordinal)) return 1;
					DetectInstallation();
					if (!installed) return 0;
					return RunProcess(Path.Combine(installDirectory, "uninstall.exe"), forwarded.Substring("--uninstall".Length).Trim());
				}
				int result = RunBackend(forwarded);
				if (result == 0) { DetectInstallation(); if (installed) RegisterMaintenance(installDirectory); }
				return result;
			}
			if (!PreviewOnly && (Array.IndexOf(args, "--uninstall") >= 0 || Array.IndexOf(args, "--repair") >= 0)
				&& Array.IndexOf(args, "--maintenance-session") < 0
				&& String.Equals(Path.GetFileName(Assembly.GetExecutingAssembly().Location), MaintenanceName, StringComparison.OrdinalIgnoreCase))
			{
				string temporary = Path.Combine(Path.GetTempPath(), "SimpleMC-maintenance-" + Guid.NewGuid().ToString("N"));
				Directory.CreateDirectory(temporary);
				string executable = Path.Combine(temporary, "SimpleMC-setup.exe");
				File.Copy(Assembly.GetExecutingAssembly().Location, executable);
				Process.Start(new ProcessStartInfo(executable, GetForwardedArguments() + " --maintenance-session") { UseShellExecute = false });
				return 0;
			}
			var app = new Application();
			using (var stream = Resource("Layout")) window = (Window)XamlReader.Load(stream);
			Control<Image>("Landscape").Source = LoadImage("Landscape");
			Control<Image>("Logo").Source = LoadImage("Logo");
			window.Icon = LoadImage("Logo");
			DetectInstallation();
			Refresh();
			if (installed && Array.IndexOf(args, "--uninstall") >= 0) ShowConfirmation(true);
			Control<Button>("Primary").Click += async (sender, eventArgs) => await InstallOrLaunch();
			Control<Button>("Uninstall").Click += (sender, eventArgs) => ShowConfirmation(true);
			Control<Button>("Browse").Click += (sender, eventArgs) => BrowseFolder();
			Control<Button>("Licenses").Click += (sender, eventArgs) => ShowLicenses();
			Control<CheckBox>("RemoveData").Checked += (sender, eventArgs) => ShowRemovalDetails(true);
			Control<CheckBox>("RemoveData").Unchecked += (sender, eventArgs) => ShowRemovalDetails(false);
			Control<Button>("CancelUninstall").Click += (sender, eventArgs) => ShowConfirmation(false);
			Control<Button>("ConfirmUninstall").Click += async (sender, eventArgs) => await Uninstall();
			Control<Button>("Close").Click += (sender, eventArgs) => window.Close();
			Control<Button>("Minimize").Click += (sender, eventArgs) => window.WindowState = WindowState.Minimized;
			Control<Grid>("TitleBar").MouseLeftButtonDown += (sender, eventArgs) => { if (eventArgs.Source is Grid || eventArgs.Source is TextBlock || eventArgs.Source is Image) window.DragMove(); };
			window.Closing += (sender, eventArgs) => { if (busy) { eventArgs.Cancel = true; SetStatus("Please wait for the current operation to finish."); } };
			if (args.Length >= 2 && args[0] == "--preview")
			{
				if (Array.IndexOf(args, "--fresh") >= 0) { installed = false; Refresh(); }
				if (Array.IndexOf(args, "--uninstall") >= 0) ShowConfirmation(true);
				if (Array.IndexOf(args, "--remove-data") >= 0) Control<CheckBox>("RemoveData").IsChecked = true;
				var root = Control<Grid>("Root");
				root.Measure(new Size(900, 560)); root.Arrange(new Rect(0, 0, 900, 560)); root.UpdateLayout();
				var image = new RenderTargetBitmap(900, 560, 96, 96, PixelFormats.Pbgra32);
				image.Render(root);
				var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(image));
				using (var stream = File.Create(args[1])) encoder.Save(stream);
				return 0;
			}
			app.Run(window);
			return 0;
		}
		catch (Exception error)
		{
			if (!Array.Exists(args, arg => arg.Equals("/S", StringComparison.OrdinalIgnoreCase)))
				MessageBox.Show(error.Message, "SimpleMC Setup", MessageBoxButton.OK, MessageBoxImage.Error);
			return 1;
		}
	}

	private static T Control<T>(string name) where T : FrameworkElement { return (T)window.FindName(name); }
	private static Stream Resource(string name) { return Assembly.GetExecutingAssembly().GetManifestResourceStream(name); }
	private static BitmapImage LoadImage(string name)
	{
		using (var stream = Resource(name))
		{
			var image = new BitmapImage(); image.BeginInit(); image.CacheOption = BitmapCacheOption.OnLoad; image.StreamSource = stream; image.EndInit(); image.Freeze(); return image;
		}
	}

	private static void DetectInstallation()
	{
		installed = false;
		installDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SimpleMC");
		foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
		{
			using (var registry = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, view))
			using (var key = registry.OpenSubKey(UninstallKey))
			{
				if (key == null) continue;
				string directory = (key.GetValue("InstallLocation") as string ?? "").Trim('"');
				if (String.IsNullOrWhiteSpace(directory)) continue;
				installDirectory = Path.GetFullPath(directory); installed = true; return;
			}
		}
		installed = File.Exists(Path.Combine(installDirectory, "SimpleMC.exe"));
	}

	private static void Refresh()
	{
		Control<TextBlock>("Heading").Text = installed ? "SimpleMC is installed" : "Install SimpleMC";
		Control<TextBlock>("Description").Text = installed ? "Repair your client or remove it from this PC." : "Your Minecraft client, ready in a few clicks.";
		Control<TextBox>("Location").Text = installDirectory;
		Control<TextBox>("Location").IsReadOnly = installed;
		Control<Button>("Browse").IsEnabled = !installed;
		Control<Button>("Browse").Visibility = installed ? Visibility.Collapsed : Visibility.Visible;
		Control<TextBox>("Location").ToolTip = installed ? "Repair uses the existing installation folder." : "Choose where SimpleMC will be installed.";
		Control<Button>("Primary").Content = ready ? "Launch SimpleMC" : installed ? "Repair" : "Install";
		Control<Button>("Uninstall").Visibility = installed ? Visibility.Visible : Visibility.Collapsed;
		Control<CheckBox>("DesktopShortcut").IsChecked = !installed || File.Exists(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "SimpleMC.lnk"));
		if (PreviewOnly) {
			Control<Button>("Primary").IsEnabled = false;
			Control<Button>("ConfirmUninstall").IsEnabled = false;
			SetStatus("Layout preview only. Installation and removal are disabled.");
		}
	}
	private static void SetStatus(string message) { Control<TextBlock>("Status").Text = message; }
	private static void ShowLicenses()
	{
		string text;
		using (var notice = new StreamReader(Resource("Notice"))) text = notice.ReadToEnd();
		using (var license = new StreamReader(Resource("License"))) text += "\n\n" + license.ReadToEnd();
		var content = new TextBox { Text = text, IsReadOnly = true, TextWrapping = TextWrapping.Wrap, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Background = new SolidColorBrush(Color.FromRgb(16,17,22)), Foreground = Brushes.White, Padding = new Thickness(20), BorderThickness = new Thickness(0) };
		new Window { Title = "SimpleMC - About and Licenses", Width = 720, Height = 520, Owner = window, WindowStartupLocation = WindowStartupLocation.CenterOwner, Content = content }.ShowDialog();
	}
	private static void ShowConfirmation(bool show)
	{
		if (show) Control<CheckBox>("RemoveData").IsChecked = false;
		Control<Border>("Confirmation").Visibility = show ? Visibility.Visible : Visibility.Collapsed;
		Control<StackPanel>("Actions").Visibility = show ? Visibility.Collapsed : Visibility.Visible;
		Control<CheckBox>("DesktopShortcut").Visibility = show ? Visibility.Collapsed : Visibility.Visible;
	}
	private static void SetBusy(bool value)
	{
		busy = value;
		Control<ProgressBar>("Progress").Visibility = value ? Visibility.Visible : Visibility.Collapsed;
		Control<StackPanel>("Actions").IsEnabled = !value;
		Control<TextBox>("Location").IsEnabled = !value;
		Control<Button>("Browse").IsEnabled = !value && !installed;
		Control<Button>("Close").IsEnabled = !value;
		Control<CheckBox>("DesktopShortcut").IsEnabled = !value && !ready;
	}
	private static void EnsureClientClosed()
	{
		foreach (var process in Process.GetProcessesByName("SimpleMC"))
		{
			using (process)
			{
				string executable;
				try { executable = process.MainModule.FileName; } catch { continue; }
				if (String.Equals(executable, Path.Combine(installDirectory, "SimpleMC.exe"), StringComparison.OrdinalIgnoreCase))
					throw new InvalidOperationException("Close SimpleMC first, then try again.");
			}
		}
	}
	private static async Task InstallOrLaunch()
	{
		if (PreviewOnly) return;
		if (busy) return;
		if (ready)
		{
			try { Process.Start(Path.Combine(installDirectory, "SimpleMC.exe")); window.Close(); }
			catch (Exception error) { SetStatus("Could not launch SimpleMC: " + error.Message); }
			return;
		}
		try
		{
			installDirectory = Path.GetFullPath(Control<TextBox>("Location").Text.Trim());
			EnsureClientClosed();
			SetBusy(true); SetStatus(installed ? "Repairing SimpleMC…" : "Installing SimpleMC…");
			bool desktopShortcut = Control<CheckBox>("DesktopShortcut").IsChecked == true;
			int result = await Task.Run(() => RunBackend("/S" + (desktopShortcut ? "" : " /ND") + " /D=" + installDirectory));
			if (result != 0 || !File.Exists(Path.Combine(installDirectory, "SimpleMC.exe")))
				throw new InvalidOperationException("Installation could not finish. Please try again. (Code " + result + ")");
			RegisterMaintenance(installDirectory);
			installed = true; ready = true; Refresh();
			Control<TextBlock>("Heading").Text = "Ready to play";
			Control<TextBlock>("Description").Text = "SimpleMC __VERSION__ is ready.";
			SetStatus("Installation complete.");
		}
		catch (Exception error) { SetStatus(error.Message); }
		finally { SetBusy(false); }
	}
	private static async Task Uninstall()
	{
		if (PreviewOnly) return;
		if (busy) return;
		bool removeData = Control<CheckBox>("RemoveData").IsChecked == true;
		ShowConfirmation(false);
		try
		{
			EnsureClientClosed();
			List<string> dataDirectories = removeData ? DataDirectories() : new List<string>();
			string uninstaller = Path.Combine(installDirectory, "uninstall.exe");
			if (!File.Exists(uninstaller)) throw new InvalidOperationException("The uninstaller is missing. Repair SimpleMC first, then uninstall.");
			SetBusy(true); SetStatus("Uninstalling SimpleMC…");
			string directoryToRemove = installDirectory;
			int result = await Task.Run(() => WithTemporaryDirectory(directory => {
				string copy = Path.Combine(directory, "SimpleMC-uninstall.exe");
				File.Copy(uninstaller, copy);
				return RunProcess(copy, "/S _?=" + directoryToRemove);
			}));
			if (result != 0) throw new InvalidOperationException("Uninstall could not finish. Please try again. (Code " + result + ")");
			if (File.Exists(Path.Combine(directoryToRemove, "SimpleMC.exe")))
				throw new InvalidOperationException("SimpleMC could not be removed. Close the client and try again.");
			DetectInstallation();
			if (installed) throw new InvalidOperationException("SimpleMC could not be removed. Close the client and try again.");
			ready = false; Refresh();
			foreach (string directory in dataDirectories) DeleteClientDirectory(directory);
			SetStatus(removeData ? "SimpleMC and its saved data were removed." : "SimpleMC was removed. Your profiles and settings were kept.");
		}
		catch (Exception error) { SetStatus(error.Message); }
		finally { SetBusy(false); }
	}
	private static void BrowseFolder()
	{
		if (installed || busy) return;
		try
		{
			using (var picker = new System.Windows.Forms.FolderBrowserDialog())
			{
				picker.Description = "Choose where to install SimpleMC";
				picker.ShowNewFolderButton = true;
				picker.SelectedPath = Control<TextBox>("Location").Text;
				var owner = new FolderPickerOwner(new WindowInteropHelper(window).Handle);
				if (picker.ShowDialog(owner) == System.Windows.Forms.DialogResult.OK)
					Control<TextBox>("Location").Text = picker.SelectedPath;
			}
		}
		catch (Exception error) { SetStatus("Could not open the folder picker: " + error.Message); }
	}
	private sealed class FolderPickerOwner : System.Windows.Forms.IWin32Window
	{
		public IntPtr Handle { get; private set; }
		public FolderPickerOwner(IntPtr handle) { Handle = handle; }
	}
	private static void ShowRemovalDetails(bool show)
	{
		Control<TextBlock>("RemovalDetails").Visibility = show ? Visibility.Visible : Visibility.Collapsed;
		Control<TextBlock>("RemovalDetails").Text = "This permanently deletes your SimpleMC profiles, worlds, mods, screenshots, accounts and preferences, including data stored in a custom client data folder.";
	}
	[DllImport("winsqlite3", CallingConvention = CallingConvention.Cdecl)]
	private static extern int sqlite3_open_v2(byte[] filename, out IntPtr db, int flags, IntPtr vfs);
	[DllImport("winsqlite3", CallingConvention = CallingConvention.Cdecl)]
	private static extern int sqlite3_prepare_v2(IntPtr db, byte[] sql, int length, out IntPtr statement, IntPtr tail);
	[DllImport("winsqlite3", CallingConvention = CallingConvention.Cdecl)]
	private static extern int sqlite3_step(IntPtr statement);
	[DllImport("winsqlite3", CallingConvention = CallingConvention.Cdecl)]
	private static extern IntPtr sqlite3_column_text(IntPtr statement, int column);
	[DllImport("winsqlite3", CallingConvention = CallingConvention.Cdecl)]
	private static extern int sqlite3_finalize(IntPtr statement);
	[DllImport("winsqlite3", CallingConvention = CallingConvention.Cdecl)]
	private static extern int sqlite3_close(IntPtr db);
	private static List<string> DataDirectories(string roamingDirectory = null, string localDirectory = null)
	{
		string roaming = Path.GetFullPath(roamingDirectory ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "com.simplemc.launcher"));
		string local = Path.GetFullPath(localDirectory ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "com.simplemc.launcher"));
		var paths = new List<string> { roaming, local };
		string database = Path.Combine(roaming, "app.db");
		if (!File.Exists(database)) return paths;
		IntPtr db = IntPtr.Zero, statement = IntPtr.Zero;
		try
		{
			if (sqlite3_open_v2(Encoding.UTF8.GetBytes(database + "\0"), out db, 1, IntPtr.Zero) != 0 ||
				sqlite3_prepare_v2(db, Encoding.UTF8.GetBytes("SELECT custom_dir FROM settings LIMIT 1\0"), -1, out statement, IntPtr.Zero) != 0)
				throw new IOException("Could not read the client data folder. Repair SimpleMC before trying a complete removal.");
			int result = sqlite3_step(statement);
			if (result != 100 && result != 101) throw new IOException("Could not read the client data folder.");
			IntPtr value = result == 100 ? sqlite3_column_text(statement, 0) : IntPtr.Zero;
			if (value != IntPtr.Zero)
			{
				int length = 0; while (Marshal.ReadByte(value, length) != 0) length++;
				var bytes = new byte[length]; Marshal.Copy(value, bytes, 0, length);
				string custom = Encoding.UTF8.GetString(bytes);
				if (!String.IsNullOrWhiteSpace(custom))
				{
					string root = Path.GetFullPath(custom).TrimEnd(Path.DirectorySeparatorChar);
					foreach (string name in new[] { "profiles", "meta", "store", "caches", "icons", "synced-options", "launcher_logs" })
					{
						string target = Path.GetFullPath(Path.Combine(root, name));
						if (!String.Equals(Path.GetDirectoryName(target), root, StringComparison.OrdinalIgnoreCase)) throw new IOException("Invalid client data folder.");
						paths.Add(target);
					}
				}
			}
			return paths;
		}
		finally { if (statement != IntPtr.Zero) sqlite3_finalize(statement); if (db != IntPtr.Zero) sqlite3_close(db); }
	}
	private static void DeleteClientDirectory(string directory)
	{
		string root = Path.GetFullPath(directory);
		if (!Directory.Exists(root)) return;
		if ((File.GetAttributes(root) & FileAttributes.ReparsePoint) != 0) { Directory.Delete(root); return; }
		foreach (string entry in Directory.GetFileSystemEntries(root))
		{
			if (!Path.GetFullPath(entry).StartsWith(root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
				throw new IOException("Invalid client data path.");
			if ((File.GetAttributes(entry) & FileAttributes.Directory) != 0) DeleteClientDirectory(entry);
			else { if ((File.GetAttributes(entry) & FileAttributes.ReparsePoint) == 0) File.SetAttributes(entry, FileAttributes.Normal); File.Delete(entry); }
		}
		Directory.Delete(root);
	}
	private static string GetForwardedArguments()
	{
		string command = Environment.CommandLine;
		if (command.StartsWith("\"")) { int end = command.IndexOf('"', 1); return command.Substring(end + 1).Trim(); }
		int space = command.IndexOf(' '); return space < 0 ? "" : command.Substring(space + 1);
	}
	private static int RunBackend(string arguments)
	{
		if (PreviewOnly) throw new InvalidOperationException("This installer is a layout preview only.");
		return WithTemporaryDirectory(directory => {
			string backend = Path.Combine(directory, "SimpleMC-setup.exe");
			using (var input = Resource("Backend")) using (var output = File.Create(backend)) input.CopyTo(output);
			return RunProcess(backend, arguments);
		});
	}
	private static void RegisterMaintenance(string directory, string registryPath = UninstallKey)
	{
		string maintenance = Path.Combine(directory, MaintenanceName);
		string source = Assembly.GetExecutingAssembly().Location;
		if (!String.Equals(Path.GetFullPath(source), Path.GetFullPath(maintenance), StringComparison.OrdinalIgnoreCase))
			File.Copy(source, maintenance, true);
		using (var registry = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, RegistryView.Registry64))
		using (var key = registry.CreateSubKey(registryPath))
		{
			key.SetValue("DisplayName", "SimpleMC");
			key.SetValue("DisplayVersion", "__VERSION__");
			key.SetValue("InstallLocation", directory);
			key.SetValue("DisplayIcon", "\"" + Path.Combine(directory, "SimpleMC.exe") + "\"");
			key.SetValue("UninstallString", "\"" + maintenance + "\" --uninstall");
			key.SetValue("QuietUninstallString", "\"" + Path.Combine(directory, "uninstall.exe") + "\" /S");
			key.SetValue("ModifyPath", "\"" + maintenance + "\" --repair");
			key.SetValue("NoModify", 0, RegistryValueKind.DWord);
			key.SetValue("NoRepair", 0, RegistryValueKind.DWord);
			key.SetValue("WindowsInstaller", 0, RegistryValueKind.DWord);
		}
	}
	private static int WithTemporaryDirectory(Func<string, int> operation)
	{
		string tempRoot = Path.GetFullPath(Path.GetTempPath());
		string directory = Path.Combine(tempRoot, "SimpleMC-setup-" + Guid.NewGuid().ToString("N"));
		Directory.CreateDirectory(directory);
		try
		{
			return operation(directory);
		}
		finally
		{
			if (String.Equals(Path.GetDirectoryName(Path.GetFullPath(directory)), tempRoot.TrimEnd(Path.DirectorySeparatorChar), StringComparison.OrdinalIgnoreCase))
				try { Directory.Delete(directory, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
		}
	}
	private static int RunProcess(string executable, string arguments)
	{
		using (var process = Process.Start(new ProcessStartInfo(executable, arguments) { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = Path.GetDirectoryName(executable) }))
		{
			process.WaitForExit(); return process.ExitCode;
		}
	}
}
