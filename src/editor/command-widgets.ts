import { StateField, StateEffect } from "@codemirror/state";
import { EditorView, WidgetType, Decoration } from "@codemirror/view";

export interface CommandEntry {
  id: string;
  pos: number;
  instruction: string;
  confirmation: string;
  status: string;
}

export const addCommandEffect = StateEffect.define<CommandEntry>();
export const updateCommandEffect = StateEffect.define<{
  id: string;
  confirmation: string;
  status: string;
}>();

class CommandWidget extends WidgetType {
  constructor(readonly entry: CommandEntry) {
    super();
  }

  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.style.padding = "2px 0";

    const cmdLine = document.createElement("div");
    cmdLine.className = "cm-claude-line";
    cmdLine.textContent = `/claude ${this.entry.instruction}`;
    wrapper.appendChild(cmdLine);

    if (this.entry.status === "done" && this.entry.confirmation) {
      const confirm = document.createElement("div");
      confirm.className = "cm-claude-confirm";
      confirm.textContent = `\u2713 ${this.entry.confirmation}`;
      wrapper.appendChild(confirm);
    } else if (this.entry.status === "pending") {
      const pending = document.createElement("div");
      pending.className = "cm-claude-confirm";
      pending.textContent = "\u22ef running\u2026";
      wrapper.appendChild(pending);
    } else if (this.entry.status === "error") {
      const err = document.createElement("div");
      err.className = "cm-claude-confirm";
      err.textContent = `\u2717 ${this.entry.confirmation || "command failed"}`;
      wrapper.appendChild(err);
    }

    return wrapper;
  }

  eq(other: CommandWidget) {
    return (
      this.entry.id === other.entry.id &&
      this.entry.status === other.entry.status &&
      this.entry.confirmation === other.entry.confirmation
    );
  }
}

export const commandsField = StateField.define<CommandEntry[]>({
  create() {
    return [];
  },
  update(commands, tr) {
    let updated = commands;

    if (tr.docChanged) {
      updated = updated.map((cmd) => ({
        ...cmd,
        pos: tr.changes.mapPos(cmd.pos, 1),
      }));
    }

    for (const e of tr.effects) {
      if (e.is(addCommandEffect)) {
        updated = [...updated, e.value];
      } else if (e.is(updateCommandEffect)) {
        updated = updated.map((cmd) =>
          cmd.id === e.value.id
            ? {
                ...cmd,
                confirmation: e.value.confirmation,
                status: e.value.status,
              }
            : cmd
        );
      }
    }

    return updated;
  },
});

const commandDecorations = EditorView.decorations.compute(
  [commandsField],
  (state) => {
    const commands = state.field(commandsField);
    if (commands.length === 0) return Decoration.none;

    const widgets = commands
      .map((cmd) => {
        const pos = Math.min(cmd.pos, state.doc.length);
        return Decoration.widget({
          widget: new CommandWidget(cmd),
          block: true,
          side: 1,
        }).range(pos);
      })
      .sort((a, b) => a.from - b.from);

    return Decoration.set(widgets);
  }
);

export const commandWidgetsExtension = [commandsField, commandDecorations];
