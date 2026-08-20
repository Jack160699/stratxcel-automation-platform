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

    public static IntPtr TargetHwnd = IntPtr.Zero;
    public static string TargetTitle = "";

    public static bool FindWindow() {
      TargetHwnd = IntPtr.Zero;
      EnumWindows((hWnd, lParam) => {
        if (IsWindowVisible(hWnd)) {
          StringBuilder sb = new StringBuilder(512);
          int len = GetWindowText(hWnd, sb, 512);
          if (len > 0) {
            string t = sb.ToString();
            if (t.Contains("Stratxcel") || t.Contains("Sign in") || t.Contains("Google Chrome")) {
              TargetHwnd = hWnd;
              TargetTitle = t;
              return false;
            }
          }
        }
        return true;
      }, IntPtr.Zero);
      return TargetHwnd != IntPtr.Zero;
    }

    public static void Focus() {
      if (TargetHwnd != IntPtr.Zero) {
        ShowWindow(TargetHwnd, 9); // SW_RESTORE
        ShowWindow(TargetHwnd, 3); // SW_MAXIMIZE
        BringWindowToTop(TargetHwnd);
        SetForegroundWindow(TargetHwnd);
      }
    }
  }
"@

if ([Win32Helper]::FindWindow()) {
    [Win32Helper]::Focus()
    Write-Host "Focused window: $([Win32Helper]::TargetTitle)"
}
