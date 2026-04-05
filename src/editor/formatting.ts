import { EditorView } from "@codemirror/view";

interface FormattingResult {
  text: string;
  cursorOffset: number;
}

const wrapFormats: Record<string, string> = {
  "format:bold": "**",
  "format:italic": "*",
  "format:strikethrough": "~~",
  "format:highlight": "==",
};

const lineFormats: Record<string, string> = {
  "format:h1": "# ",
  "format:h2": "## ",
  "format:bullet": "- ",
  "format:number": "1. ",
};

export function applyFormatting(
  action: string,
  selectedText: string,
  hasSelection: boolean
): FormattingResult {
  const wrap = wrapFormats[action];
  if (wrap) {
    if (hasSelection) {
      return { text: `${wrap}${selectedText}${wrap}`, cursorOffset: 0 };
    }
    return { text: `${wrap}${wrap}`, cursorOffset: -wrap.length };
  }

  const linePrefix = lineFormats[action];
  if (linePrefix) {
    return { text: linePrefix, cursorOffset: 0 };
  }

  if (action === "format:divider") {
    return { text: "\n---\n", cursorOffset: 0 };
  }

  return { text: "", cursorOffset: 0 };
}

export function executeFormatting(view: EditorView, action: string): void {
  const { from, to } = view.state.selection.main;
  const hasSelection = from !== to;
  const selectedText = hasSelection ? view.state.sliceDoc(from, to) : "";

  if (lineFormats[action]) {
    const line = view.state.doc.lineAt(from);
    const result = applyFormatting(action, selectedText, hasSelection);
    view.dispatch({
      changes: { from: line.from, to: line.from, insert: result.text },
      selection: { anchor: line.from + result.text.length + (to - line.from) },
    });
    return;
  }

  const result = applyFormatting(action, selectedText, hasSelection);
  const deleteRange = hasSelection ? { from, to } : { from, to: from };

  view.dispatch({
    changes: { ...deleteRange, insert: result.text },
    selection: { anchor: from + result.text.length + result.cursorOffset },
  });
}
