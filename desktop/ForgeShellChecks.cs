using System;
using System.Drawing;
using System.Windows.Forms;

namespace RPFForge {
    // Regression checks for tool isolation, lifecycle and busy navigation.
    static class ForgeShellChecks {
        sealed class FakeTool : UserControl, IForgeTool {
            public bool Running;
            public int Activations;
            public readonly TextBox Draft = new TextBox();
            readonly Button action = new Button();
            public Control View { get { return this; } }
            public bool Busy { get { return Running; } }
            public IButtonControl DefaultAction { get { return action; } }
            public event EventHandler StateChanged;
            public FakeTool() { Controls.Add(Draft); }
            public void Activate() { Activations++; }
            public void SetBusy(bool value) { Running = value; if (StateChanged != null) StateChanged(this, EventArgs.Empty); }
        }
        public static void Run() {
            using (var shell = new ForgeShell()) {
                var first = new FakeTool(); var second = new FakeTool(); int factories = 0;
                shell.Register(new ForgeToolRegistration("a", "A", "First tool", "Test", delegate { factories++; return first; }));
                shell.Register(new ForgeToolRegistration("b", "B", "Second tool", "Test", delegate { factories++; return second; }));
                if (factories != 0 || shell.LoadedCount != 0 || shell.ActiveId != null) throw new Exception("Tools must load on demand; startup belongs to home.");
                if (shell.TryOpen("missing") || shell.ActiveId != null || factories != 0) throw new Exception("Unknown tool changed navigation.");
                bool duplicateRejected = false;
                try { shell.Register(new ForgeToolRegistration("a", "Duplicate", "", "", delegate { return first; })); } catch (ArgumentException) { duplicateRejected = true; }
                if (!duplicateRejected) throw new Exception("Duplicate tool ids must be rejected.");
                shell.TryOpen("a"); first.Draft.Text = "unsaved spawn"; first.SetBusy(true);
                if (shell.TryOpen("b") || shell.TryOpen(null) || shell.ShowHelp() || shell.ActiveId != "a" || factories != 1) throw new Exception("A running operation must block tool switching.");
                first.SetBusy(false); shell.TryOpen("b"); second.Draft.Text = "another tool"; shell.TryOpen("a");
                if (factories != 2 || first.Draft.Text != "unsaved spawn" || second.Draft.Text != "another tool" || first.Activations != 2) throw new Exception("Switching tools must preserve independent state and reuse views.");
                shell.TryOpen(null);
                if (shell.DefaultAction != null || first.Draft.Text != "unsaved spawn") throw new Exception("Returning home must clear Enter without clearing tool state.");
                shell.ShowHelp(); if (shell.DefaultAction != null) throw new Exception("Help kept a hidden primary action.");
                shell.TryOpen("a"); if (first.Draft.Text != "unsaved spawn" || factories != 2) throw new Exception("Help navigation replaced the tool state.");
            }
        }
    }
}
