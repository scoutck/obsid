"use client";

import { useEffect, useRef } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { markdownPreview } from "@/editor/markdown-preview";

const theme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "#fafafa",
  },
  ".cm-cursor": {
    borderLeftColor: "#fafafa",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(99, 102, 241, 0.3) !important",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-heading": {
    fontWeight: "700",
    fontSize: "1.25em",
  },
  ".cm-bold": {
    fontWeight: "700",
  },
  ".cm-italic": {
    fontStyle: "italic",
  },
  ".cm-strikethrough": {
    textDecoration: "line-through",
  },
  ".cm-highlight": {
    backgroundColor: "rgba(250, 204, 21, 0.3)",
    borderRadius: "2px",
  },
  ".cm-inline-code": {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: "3px",
    padding: "0 4px",
    fontFamily: "monospace",
  },
});

interface EditorProps {
  initialContent?: string;
  onChange?: (content: string) => void;
}

export default function Editor({ initialContent = "", onChange }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        keymap.of([...defaultKeymap, ...historyKeymap]),
        history(),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),
        markdownPreview,
        theme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, [initialContent]);

  return <div ref={containerRef} className="h-full w-full" />;
}
