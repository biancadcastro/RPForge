using System;
using System.Windows.Forms;

namespace RPFForge {
    // A tool owns its view, state and primary action. The shell only hosts it.
    interface IForgeTool {
        Control View { get; }
        bool Busy { get; }
        IButtonControl DefaultAction { get; }
        event EventHandler StateChanged;
        void Activate();
    }

    sealed class ForgeToolRegistration {
        public readonly string Id, Title, Description, Category, Badge;
        public readonly Func<IForgeTool> Create;
        public ForgeToolRegistration(string id, string title, string description, string category, Func<IForgeTool> create, string badge = "→") {
            if (String.IsNullOrWhiteSpace(id) || create == null) throw new ArgumentException("A tool needs a stable id and a view factory.");
            Id = id; Title = title; Description = description; Category = category; Create = create; Badge = badge;
        }
    }
}
