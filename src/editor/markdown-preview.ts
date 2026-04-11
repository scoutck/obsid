import {
  ViewPlugin,
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { Range } from "@codemirror/state";

const headingStyles: Record<string, Decoration> = {
  ATXHeading1: Decoration.mark({ class: "cm-heading cm-heading-1" }),
  ATXHeading2: Decoration.mark({ class: "cm-heading cm-heading-2" }),
  ATXHeading3: Decoration.mark({ class: "cm-heading cm-heading-3" }),
  ATXHeading4: Decoration.mark({ class: "cm-heading cm-heading-4" }),
  ATXHeading5: Decoration.mark({ class: "cm-heading cm-heading-5" }),
  ATXHeading6: Decoration.mark({ class: "cm-heading cm-heading-6" }),
};
const boldStyle = Decoration.mark({ class: "cm-bold" });
const italicStyle = Decoration.mark({ class: "cm-italic" });
const strikethroughStyle = Decoration.mark({ class: "cm-strikethrough" });
const codeStyle = Decoration.mark({ class: "cm-inline-code" });
const hideMarker = Decoration.replace({});

class HrWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement("hr");
    hr.className = "cm-hr";
    return hr;
  }
}

export const markdownPreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: {
      docChanged: boolean;
      viewportChanged: boolean;
      selectionSet: boolean;
      view: EditorView;
    }) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const decorations: Range<Decoration>[] = [];
      const tree = syntaxTree(view.state);
      const cursorLine = view.state.doc.lineAt(
        view.state.selection.main.head
      ).number;

      tree.iterate({
        enter(node) {
          const nodeLine = view.state.doc.lineAt(node.from).number;
          const active = nodeLine === cursorLine;

          // Bold: **text**
          if (node.name === "StrongEmphasis") {
            const len = node.to - node.from;
            if (active || len <= 4) {
              decorations.push(boldStyle.range(node.from, node.to));
            } else {
              decorations.push(hideMarker.range(node.from, node.from + 2));
              decorations.push(boldStyle.range(node.from + 2, node.to - 2));
              decorations.push(hideMarker.range(node.to - 2, node.to));
            }
          }

          // Italic: *text*
          if (node.name === "Emphasis") {
            const len = node.to - node.from;
            if (active || len <= 2) {
              decorations.push(italicStyle.range(node.from, node.to));
            } else {
              decorations.push(hideMarker.range(node.from, node.from + 1));
              decorations.push(italicStyle.range(node.from + 1, node.to - 1));
              decorations.push(hideMarker.range(node.to - 1, node.to));
            }
          }

          // Strikethrough: ~~text~~
          if (node.name === "Strikethrough") {
            const len = node.to - node.from;
            if (active || len <= 4) {
              decorations.push(
                strikethroughStyle.range(node.from, node.to)
              );
            } else {
              decorations.push(hideMarker.range(node.from, node.from + 2));
              decorations.push(
                strikethroughStyle.range(node.from + 2, node.to - 2)
              );
              decorations.push(hideMarker.range(node.to - 2, node.to));
            }
          }

          // Inline code: `text`
          if (node.name === "InlineCode") {
            const len = node.to - node.from;
            if (active || len <= 2) {
              decorations.push(codeStyle.range(node.from, node.to));
            } else {
              decorations.push(hideMarker.range(node.from, node.from + 1));
              decorations.push(codeStyle.range(node.from + 1, node.to - 1));
              decorations.push(hideMarker.range(node.to - 1, node.to));
            }
          }

          // Headings: # through ######
          if (node.name.startsWith("ATXHeading")) {
            const style = headingStyles[node.name];
            if (!style) return;
            if (active) {
              decorations.push(style.range(node.from, node.to));
            } else {
              const line = view.state.doc.lineAt(node.from);
              const hashMatch = line.text.match(/^(#{1,6})\s/);
              if (hashMatch) {
                const markerEnd = node.from + hashMatch[0].length;
                decorations.push(hideMarker.range(node.from, markerEnd));
                if (markerEnd < node.to) {
                  decorations.push(style.range(markerEnd, node.to));
                }
              } else {
                decorations.push(style.range(node.from, node.to));
              }
            }
          }

          // Horizontal rule: ---
          if (node.name === "HorizontalRule") {
            if (!active) {
              decorations.push(
                Decoration.replace({
                  widget: new HrWidget(),
                }).range(node.from, node.to)
              );
            }
          }
        },
      });

      return Decoration.set(decorations, true);
    }
  },
  { decorations: (v) => v.decorations }
);
