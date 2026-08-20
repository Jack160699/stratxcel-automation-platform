import { execSync } from "node:child_process";

const ps = `
Add-Type -TypeDefinition @"
  using System;
  using System.Text;
  using System.Runtime.InteropServices;
  public class WinEnum {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    public static void ListVisibleWindows() {
      EnumWindows((hWnd, lParam) => {
        if (IsWindowVisible(hWnd)) {
          StringBuilder sb = new StringBuilder(512);
          int len = GetWindowText(hWnd, sb, 512);
          if (len > 0) {
            uint pid = 0;
            GetWindowThreadProcessId(hWnd, out pid);
            string title = sb.ToString();
            if (!string.IsNullOrWhiteSpace(title) && title != "Program Manager") {
              Console.WriteLine($"[HWND: {hWnd}] [PID: {pid}] {title}");
            }
          }
        }
        return true;
      }, IntPtr.Zero);
    }
  }
"@

[WinEnum]::ListVisibleWindows()
`;

try {
  const out = execSync("powershell -ExecutionPolicy Bypass -Command -", {
    input: ps,
    encoding: "utf8",
  });
  console.log("=== VISIBLE WINDOWS ON CURRENT WINDOWS DESKTOP ===");
  console.log(out);
} catch (e) {
  console.error("Enum error:", e.message);
}
