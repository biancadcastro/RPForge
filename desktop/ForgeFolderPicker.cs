using System;
using System.IO;
using System.Runtime.InteropServices;

namespace RPFForge {
    // Windows Common Item Dialog. Folder mode retains Explorer navigation,
    // typed paths and search without the legacy SHBrowseForFolder tree.
    static class ForgeFolderPicker {
        const uint PickFolders = 0x20, ForceFileSystem = 0x40, NoChangeDirectory = 0x8, PathMustExist = 0x800;
        const int Cancelled = unchecked((int)0x800704C7);

        static IFileDialog Create(string initialFolder) {
            var dialog = (IFileDialog)new FileOpenDialog();
            try {
                uint options; dialog.GetOptions(out options);
                dialog.SetOptions(options | PickFolders | ForceFileSystem | NoChangeDirectory | PathMustExist);
                dialog.SetTitle("RPForge — escolher pasta de origem");
                dialog.SetOkButtonLabel("Usar esta pasta");
                if (Directory.Exists(initialFolder)) {
                    IShellItem folder; Guid id = typeof(IShellItem).GUID;
                    Marshal.ThrowExceptionForHR(SHCreateItemFromParsingName(Path.GetFullPath(initialFolder), IntPtr.Zero, ref id, out folder));
                    try { dialog.SetFolder(folder); } finally { Marshal.ReleaseComObject(folder); }
                }
                return dialog;
            } catch { Marshal.ReleaseComObject(dialog); throw; }
        }

        public static string Choose(IntPtr owner, string initialFolder) {
            var dialog = Create(initialFolder);
            try {
                int result = dialog.Show(owner);
                if (result == Cancelled) return null;
                Marshal.ThrowExceptionForHR(result);
                IShellItem selection; dialog.GetResult(out selection);
                try {
                    IntPtr name; selection.GetDisplayName(0x80058000, out name); // SIGDN_FILESYSPATH
                    try {
                        string path = Marshal.PtrToStringUni(name);
                        if (!Directory.Exists(path)) throw new IOException("A pasta selecionada não está disponível. Escolha outra pasta.");
                        return path;
                    } finally { Marshal.FreeCoTaskMem(name); }
                } finally { Marshal.ReleaseComObject(selection); }
            } finally { Marshal.ReleaseComObject(dialog); }
        }

        public static void SelfTest() {
            string current = Environment.CurrentDirectory;
            var dialog = Create(Path.GetTempPath());
            try {
                uint options; dialog.GetOptions(out options);
                if ((options & (PickFolders | ForceFileSystem | NoChangeDirectory | PathMustExist)) != (PickFolders | ForceFileSystem | NoChangeDirectory | PathMustExist)) throw new Exception("Folder picker options are invalid.");
                IShellItem selectedFolder; dialog.GetFolder(out selectedFolder);
                try {
                    IntPtr name; selectedFolder.GetDisplayName(0x80058000, out name);
                    try { if (!String.Equals(Path.GetFullPath(Marshal.PtrToStringUni(name)).TrimEnd('\\'), Path.GetFullPath(Path.GetTempPath()).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) throw new Exception("Folder picker ignored initial directory."); }
                    finally { Marshal.FreeCoTaskMem(name); }
                } finally { Marshal.ReleaseComObject(selectedFolder); }
                if (Environment.CurrentDirectory != current) throw new Exception("Folder picker changed working directory.");
            } finally { Marshal.ReleaseComObject(dialog); }
        }

        [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
        static extern int SHCreateItemFromParsingName(string path, IntPtr context, ref Guid id, out IShellItem item);

        [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7"), ClassInterface(ClassInterfaceType.None)]
        class FileOpenDialog { }

        [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IShellItem {
            void BindToHandler(IntPtr context, ref Guid handler, ref Guid id, out IntPtr result);
            void GetParent(out IShellItem parent);
            void GetDisplayName(uint type, out IntPtr name);
            void GetAttributes(uint mask, out uint attributes);
            void Compare(IShellItem other, uint hint, out int order);
        }

        [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IFileDialog {
            [PreserveSig] int Show(IntPtr owner);
            void SetFileTypes(uint count, IntPtr types);
            void SetFileTypeIndex(uint index);
            void GetFileTypeIndex(out uint index);
            void Advise(IntPtr events, out uint cookie);
            void Unadvise(uint cookie);
            void SetOptions(uint options);
            void GetOptions(out uint options);
            void SetDefaultFolder(IShellItem folder);
            void SetFolder(IShellItem folder);
            void GetFolder(out IShellItem folder);
            void GetCurrentSelection(out IShellItem item);
            void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
            void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
            void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
            void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string text);
            void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
            void GetResult(out IShellItem result);
            void AddPlace(IShellItem folder, uint location);
            void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string extension);
            void Close(int result);
            void SetClientGuid(ref Guid id);
            void ClearClientData();
            void SetFilter(IntPtr filter);
        }
    }
}
