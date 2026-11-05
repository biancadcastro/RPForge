using System;
using System.Drawing;
using System.Runtime.InteropServices;

namespace RPFForge {
    static class ForgeChrome {
        [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr handle, int attribute, ref int value, int size);
        public static void Apply(IntPtr handle) {
            int dark = 1, background = ColorTranslator.ToWin32(ForgeTheme.Background), text = ColorTranslator.ToWin32(ForgeTheme.Text);
            try {
                DwmSetWindowAttribute(handle, 20, ref dark, 4);
                DwmSetWindowAttribute(handle, 35, ref background, 4);
                DwmSetWindowAttribute(handle, 36, ref text, 4);
            } catch (DllNotFoundException) { } catch (EntryPointNotFoundException) { }
        }
    }
}
