import {
  ViewPlugin,
  Decoration,
  DecorationSet,
  EditorView,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;

const wikiLinkMark = Decoration.mark({ class: "cm-wiki-link" });

export const wikiLinkDecorations = ViewPlugin.fromClass(
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
      let match;
      wikiLinkRegex.lastIndex = 0;
      while ((match = wikiLinkRegex.exec(doc)) !== null) {
        builder.add(match.index, match.index + match[0].length, wikiLinkMark);
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations }
);

// Extract wiki-link titles from content for saving to links field
export function extractWikiLinks(content: string): string[] {
  const links: string[] = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1]);
  }
  return [...new Set(links)];
}
