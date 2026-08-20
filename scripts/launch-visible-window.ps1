# PowerShell script to launch a guaranteed visible Chrome window on the active desktop
Add-Type -TypeDefinition @"
  using System;
  using System.Text;
  using System.Runtime.InteropServices;

  public class Win32Helper {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    public static IntPtr FoundHwnd = IntPtr.Zero;
    public static string FoundTitle = "";
    public static uint FoundPid = 0;

    public static bool FindStratxcelWindow() {
      FoundHwnd = IntPtr.Zero;
      FoundTitle = "";
      FoundPid = 0;
      EnumWindows((hWnd, lParam) => {
        if (IsWindowVisible(hWnd)) {
          StringBuilder sb = new StringBuilder(512);
          int len = GetWindowText(hWnd, sb, 512);
          if (len > 0) {
            uint pid = 0;
            GetWindowThreadProcessId(hWnd, out pid);
            string title = sb.ToString();
            if (title.Contains("Stratxcel") || title.Contains("Sign in") || title.Contains("Google Chrome")) {
              FoundHwnd = hWnd;
              FoundTitle = title;
              FoundPid = pid;
              return false;
            }
          }
        }
        return true;
      }, IntPtr.Zero);
      return FoundHwnd != IntPtr.Zero;
    }

    public static void FocusFoundWindow() {
      if (FoundHwnd != IntPtr.Zero) {
        ShowWindow(FoundHwnd, 9);
        ShowWindow(FoundHwnd, 3);
        BringWindowToTop(FoundHwnd);
        SetForegroundWindow(FoundHwnd);
      }
    }
  }
"@

$cleanProfile = "$env:TEMP\stratxcel-e2e-clean-browser"
if (Test-Path $cleanProfile) {
    Remove-Item -Path $cleanProfile -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $cleanProfile -Force | Out-Null

$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$port = 9222
$targetUrl = "https://www.stratxcel.in/login"

Write-Host "================================================================================"
Write-Host "LAUNCHING FRESH VISIBLE GOOGLE CHROME WINDOW"
Write-Host "Executable: $chromePath"
Write-Host "Profile:    $cleanProfile"
Write-Host "Port:       $port"
Write-Host "URL:        $targetUrl"
Write-Host "================================================================================`n"

# Launch Chrome
$proc = Start-Process -FilePath $chromePath -ArgumentList @(
    "--remote-debugging-port=$port",
    "--user-data-dir=$cleanProfile",
    "--new-window",
    "--start-maximized",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-position=50,50",
    "--window-size=1280,800",
    $targetUrl
) -PassThru

Write-Host "Spawned Process PID: $($proc.Id)"

for ($i = 1; $i -le 25; $i++) {
    Start-Sleep -Milliseconds 600
    if ([Win32Helper]::FindStratxcelWindow()) {
        $t = [Win32Helper]::FoundTitle
        $h = [Win32Helper]::FoundHwnd
        $p = [Win32Helper]::FoundPid
        Write-Host "Found Visible Desktop Window on attempt $i : '$t' [HWND: $h, PID: $p]"
        [Win32Helper]::FocusFoundWindow()
        Write-Host "Window Restored, Maximized, and Brought to Foreground!"
        break
    }
}

$result = @{
    PID = if ([Win32Helper]::FoundPid) { [Win32Helper]::FoundPid } else { $proc.Id }
    HWnd = "$([Win32Helper]::FoundHwnd)"
    MainWindowTitle = [Win32Helper]::FoundTitle
    Port = $port
    Profile = $cleanProfile
    TargetUrl = $targetUrl
}

Write-Host "`nWINDOW DIAGNOSTICS JSON:"
$result | ConvertTo-Json
