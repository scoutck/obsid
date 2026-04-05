import {
  ViewPlugin,
  Decoration,
  DecorationSet,
  EditorView,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

const tagMark = Decoration.mark({ class: "cm-tag" });

export const tagSyntaxDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: { docChanged: boolean; view: EditorView }) {
      if (update.docChanged) {
        this.decorations = this.build(update.view);
      }
    }

    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const doc = view.state.doc.toString();
      const lines = doc.split("\n");
      let inCodeBlock = false;
      let offset = 0;

      for (const line of lines) {
        if (line.trimStart().startsWith("```")) {
          inCodeBlock = !inCodeBlock;
          offset += line.length + 1;
          continue;
        }

        if (inCodeBlock || /^#{1,6}\s/.test(line)) {
          offset += line.length + 1;
          continue;
        }

        // Skip /claude and confirmation lines
        const trimmed = line.trimStart();
        if (
          trimmed.startsWith("/claude ") ||
          trimmed.startsWith("\u2713 ") ||
          trimmed.startsWith("\u2717 ")
        ) {
          offset += line.length + 1;
          continue;
        }

        // Remove inline code before matching
        const cleaned = line.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));

        // Match #tag at start of line or after whitespace
        const TAG_REGEX = /(?:^|\s)#([a-zA-Z][a-zA-Z0-9_-]*)/g;
        let match;
        while ((match = TAG_REGEX.exec(cleaned)) !== null) {
          const hashIndex = match.index + match[0].indexOf("#");
          const tagStart = offset + hashIndex;
          const tagEnd = offset + hashIndex + 1 + match[1].length;
          builder.add(tagStart, tagEnd, tagMark);
        }

        offset += line.length + 1;
      }

      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations }
);
