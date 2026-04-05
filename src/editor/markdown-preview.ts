import {
  ViewPlugin,
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";

const headingStyle = Decoration.mark({ class: "cm-heading" });
const boldStyle = Decoration.mark({ class: "cm-bold" });
const italicStyle = Decoration.mark({ class: "cm-italic" });
const strikethroughStyle = Decoration.mark({ class: "cm-strikethrough" });
const highlightStyle = Decoration.mark({ class: "cm-highlight" });
const codeStyle = Decoration.mark({ class: "cm-inline-code" });

class HorizontalRuleWidget extends WidgetType {
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

    update(update: { docChanged: boolean; viewportChanged: boolean; view: EditorView }) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const tree = syntaxTree(view.state);

      tree.iterate({
        enter(node) {
          if (node.name === "ATXHeading1" || node.name === "ATXHeading2") {
            builder.add(node.from, node.to, headingStyle);
          }
          if (node.name === "StrongEmphasis") {
            builder.add(node.from, node.to, boldStyle);
          }
          if (node.name === "Emphasis") {
            builder.add(node.from, node.to, italicStyle);
          }
          if (node.name === "Strikethrough") {
            builder.add(node.from, node.to, strikethroughStyle);
          }
          if (node.name === "InlineCode") {
            builder.add(node.from, node.to, codeStyle);
          }
        },
      });

      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations }
);
