using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

class Overlay
{
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

    [DllImport("user32.dll")]
    static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")]
    static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "GetWindowLong")]
    static extern IntPtr GetWindowLong32(IntPtr hWnd, int nIndex);

    static IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex)
    {
        if (IntPtr.Size == 8)
            return GetWindowLongPtr64(hWnd, nIndex);
        return GetWindowLong32(hWnd, nIndex);
    }

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr")]
    static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("user32.dll", EntryPoint = "SetWindowLong")]
    static extern IntPtr SetWindowLong32(IntPtr hWnd, int nIndex, int dwNewLong);

    static IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong)
    {
        if (IntPtr.Size == 8)
            return SetWindowLongPtr64(hWnd, nIndex, dwNewLong);
        return SetWindowLong32(hWnd, nIndex, dwNewLong.ToInt32());
    }

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);

    [DllImport("user32.dll")]
    static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    static extern bool ScreenToClient(IntPtr hWnd, ref POINT lpPoint);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool IsIconic(IntPtr hWnd); // Check if minimized

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);

    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("gdi32.dll")]
    static extern IntPtr CreateRectRgn(int l, int t, int r, int b);

    [DllImport("gdi32.dll")]
    static extern bool DeleteObject(IntPtr hObject);

    [DllImport("user32.dll")]
    static extern int SetWindowRgn(IntPtr hWnd, IntPtr hRgn, bool bRedraw);

    public struct RECT { public int Left, Top, Right, Bottom; }
    public struct POINT { public int X, Y; }

    const int GWL_STYLE = -16;
    const int GWLP_HWNDPARENT = -8;
    const int WS_CAPTION = 0x00C00000;
    const int WS_THICKFRAME = 0x00040000;
    const int WS_MINIMIZEBOX = 0x00020000;
    const int WS_MAXIMIZEBOX = 0x00010000;
    const int WS_POPUP = unchecked((int)0x80000000);
    const int WS_SYSMENU = 0x00080000;
    const int WS_CHILD = 0x40000000;
    
    const uint SWP_NOSIZE = 0x0001;
    const uint SWP_NOMOVE = 0x0002;
    const uint SWP_NOZORDER = 0x0004;
    const uint SWP_NOACTIVATE = 0x0010;
    const uint SWP_FRAMECHANGED = 0x0020;
    
    const int SW_HIDE = 0;
    const int SW_SHOW = 5;
    const int SW_SHOWNA = 8;

    static int offsetX, offsetY, width, height;



    [DllImport("user32.dll")]
    static extern bool SetProcessDPIAware();

    static void Main(string[] args)
    {
        SetProcessDPIAware(); 
        
        if (args.Length < 6)
        {
            Console.WriteLine("Usage: overlay.exe <ElectronHWND_Hex> <BlueStacksTitle> <offsetX> <offsetY> <width> <height>");
            return;
        }

        IntPtr electronHwnd = (IntPtr)Convert.ToUInt64(args[0], 16);
        string bsTitle = args[1];
        offsetX = int.Parse(args[2]);
        offsetY = int.Parse(args[3]);
        width = int.Parse(args[4]);
        height = int.Parse(args[5]);

        Console.WriteLine(string.Format("Waiting for BlueStacks window: {0}...", bsTitle));
        IntPtr bsHwnd = IntPtr.Zero;
        
        for (int i = 0; i < 1200; i++)
        {
            bsHwnd = FindVisibleBlueStacksWindow(bsTitle);
            if (bsHwnd != IntPtr.Zero) break;
            Thread.Sleep(100);
        }

        if (bsHwnd == IntPtr.Zero)
        {
            Console.WriteLine("Could not find BlueStacks window.");
            return;
        }

        Console.WriteLine(string.Format("[Overlay-{0}] BlueStacks window found! Stripping borders...", bsTitle));

        // Strip basic borders but DO NOT strip WS_POPUP (BlueStacks needs it to render)
        long style = GetWindowLongPtr(bsHwnd, GWL_STYLE).ToInt64();
        style &= ~(WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU);
        SetWindowLongPtr(bsHwnd, GWL_STYLE, new IntPtr(style));

        // Force frame recalculation
        SetWindowPos(bsHwnd, IntPtr.Zero, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED | SWP_NOACTIVATE);

        Console.WriteLine(string.Format("[Overlay-{0}] Syncing position...", bsTitle));

        bool wasMinimized = false;
        
        // Constants to offset BlueStacks internal custom title bar and toolbar
        const int BS_TITLE_H = 35;
        const int BS_TOOLBAR_W = 26;
        
        IntPtr lastRgn = IntPtr.Zero;
        int lastClipW = -1, lastClipH = -1;

        // Thread to read layout updates from Electron
        Thread readerThread = new Thread(() =>
        {
            while (true)
            {
                string line = Console.ReadLine();
                if (line == null || line == "exit") Environment.Exit(0);

                string[] parts = line.Split(',');
                if (parts.Length == 4)
                {
                    int newX, newY, newWidth, newHeight;
                    if (int.TryParse(parts[0], out newX) &&
                        int.TryParse(parts[1], out newY) &&
                        int.TryParse(parts[2], out newWidth) &&
                        int.TryParse(parts[3], out newHeight))
                    {
                        offsetX = newX;
                        offsetY = newY;
                        width = newWidth;
                        height = newHeight;
                    }
                }
            }
        });
        readerThread.IsBackground = true;
        readerThread.Start();

        // Main thread loops at 60fps to forcefully anchor the window to Electron's absolute screen coordinates
        while (true)
        {
            // If the host window is closed, exit
            RECT hostRect;
            if (!GetWindowRect(electronHwnd, out hostRect))
            {
                Console.WriteLine("[Overlay] Electron closed. Exiting.");
                break;
            }

            // Check if minimized or if the tab is hidden (width=0)
            if (IsIconic(electronHwnd) || (width == 0 && height == 0))
            {
                if (!wasMinimized) {
                    ShowWindow(bsHwnd, SW_HIDE);
                    wasMinimized = true;
                }
                Thread.Sleep(50);
                continue;
            }
            else if (wasMinimized)
            {
                ShowWindow(bsHwnd, SW_SHOWNA);
                wasMinimized = false;
            }

            // Convert client coordinates (relative to Electron viewport) to absolute screen coordinates
            POINT pt = new POINT { X = offsetX, Y = offsetY };
            ClientToScreen(electronHwnd, ref pt);

            // Move the window exactly where the placeholder is on screen
            SetWindowPos(bsHwnd, IntPtr.Zero, 
                pt.X, 
                pt.Y - BS_TITLE_H, 
                width + BS_TOOLBAR_W, 
                height + BS_TITLE_H, 
                SWP_NOZORDER | SWP_NOACTIVATE);

            // Hard clip: Only render the actual Android screen content, throwing away everything else
            if (width != lastClipW || height != lastClipH)
            {
                IntPtr newRgn = CreateRectRgn(0, BS_TITLE_H, width, height + BS_TITLE_H);
                SetWindowRgn(bsHwnd, newRgn, true);
                lastRgn = newRgn;
                lastClipW = width;
                lastClipH = height;
            }

            Thread.Sleep(16); // Sync at roughly 60 FPS
        }
    }

    static IntPtr FindVisibleBlueStacksWindow(string expectedTitle)
    {
        IntPtr exactHwnd = IntPtr.Zero;
        IntPtr genericHwnd = IntPtr.Zero;
        EnumWindows((hWnd, lParam) =>
        {
            if (IsWindowVisible(hWnd))
            {
                long windowStyle = GetWindowLongPtr(hWnd, GWL_STYLE).ToInt64();
                if ((windowStyle & WS_MAXIMIZEBOX) == 0)
                {
                    return true; // Skip splash screens which lack the maximize box flag
                }

                System.Text.StringBuilder sb = new System.Text.StringBuilder(256);
                GetWindowText(hWnd, sb, 256);
                string title = sb.ToString();
                
                if (title == expectedTitle)
                {
                    exactHwnd = hWnd;
                    return false; 
                }
                else if (title == "BlueStacks App Player" || title.Contains("BlueStacks A"))
                {
                    if (genericHwnd == IntPtr.Zero) genericHwnd = hWnd;
                }
            }
            return true;
        }, IntPtr.Zero);
        
        return exactHwnd != IntPtr.Zero ? exactHwnd : genericHwnd;
    }
}
