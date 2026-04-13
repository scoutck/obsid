import {
  ViewPlugin,
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { Range } from "@codemirror/state";

class TaskCheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }

  eq(other: TaskCheckboxWidget) {
    return this.checked === other.checked;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = `cm-task-checkbox ${this.checked ? "cm-task-checked" : "cm-task-unchecked"}`;
    span.setAttribute("role", "checkbox");
    span.setAttribute("aria-checked", String(this.checked));

    if (this.checked) {
      span.innerHTML =
        '<svg width="12" height="12" viewBox="0 0 12 12" fill="none">' +
        '<path d="M2.5 6.5L5 9L9.5 3.5" stroke="currentColor" stroke-width="1.75" ' +
        'stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }

    return span;
  }

  ignoreEvent() {
    return false;
  }
}

const completedMark = Decoration.mark({ class: "cm-task-completed" });
const hideMarker = Decoration.replace({});

export const taskCheckboxExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: {
      docChanged: boolean;
      viewportChanged: boolean;
      selectionSet: boolean;
      view: EditorView;
    }) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = this.build(update.view);
      }
    }

    build(view: EditorView): DecorationSet {
      const widgets: Range<Decoration>[] = [];
      const tree = syntaxTree(view.state);
      const cursorLine = view.state.doc.lineAt(
        view.state.selection.main.head
      ).number;

      tree.iterate({
        enter(node) {
          if (node.name !== "TaskMarker") return;

          const line = view.state.doc.lineAt(node.from);
          // Show raw markdown on the active line for editing
          if (line.number === cursorLine) return;

          const markerText = view.state.sliceDoc(node.from, node.to);
          const checked =
            markerText.includes("x") || markerText.includes("X");

          // Hide the list bullet ("- ", "* ", "+ ") before the checkbox
          const indent = line.text.match(/^(\s*)/)?.[1]?.length ?? 0;
          const bulletStart = line.from + indent;
          if (bulletStart < node.from) {
            widgets.push(hideMarker.range(bulletStart, node.from));
          }

          // Replace [ ]/[x] with styled checkbox widget
          widgets.push(
            Decoration.replace({
              widget: new TaskCheckboxWidget(checked),
            }).range(node.from, node.to)
          );

          // Strikethrough + dim for completed task text
          if (checked) {
            const afterMarker = view.state.sliceDoc(node.to, node.to + 1);
            const contentStart = afterMarker === " " ? node.to + 1 : node.to;
            if (contentStart < line.to) {
              widgets.push(completedMark.range(contentStart, line.to));
            }
          }
        },
      });

      return Decoration.set(widgets, true);
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown(event: MouseEvent, view: EditorView) {
        const target = event.target as HTMLElement;
        const checkbox = target.closest(".cm-task-checkbox");
        if (!checkbox) return false;

        // Find the TaskMarker node near this widget's position
        const pos = view.posAtDOM(checkbox);
        const tree = syntaxTree(view.state);
        const markers: Array<{ from: number; to: number }> = [];

        tree.iterate({
          from: Math.max(0, pos - 10),
          to: Math.min(view.state.doc.length, pos + 10),
          enter(node) {
            if (node.name === "TaskMarker" && markers.length === 0) {
              markers.push({ from: node.from, to: node.to });
            }
          },
        });

        const marker = markers[0];
        if (marker) {
          const text = view.state.sliceDoc(marker.from, marker.to);
          const isChecked = text.includes("x") || text.includes("X");
          const newText = isChecked ? "[ ]" : "[x]";

          view.dispatch({
            changes: { from: marker.from, to: marker.to, insert: newText },
          });

          event.preventDefault();
          return true;
        }

        return false;
      },
    },
  }
);
