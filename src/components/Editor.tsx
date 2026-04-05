"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { markdownPreview } from "@/editor/markdown-preview";
import { wikiLinkDecorations } from "@/editor/wiki-links";
import SlashMenu from "@/components/SlashMenu";
import { type SlashCommand } from "@/editor/slash-commands";

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

interface SlashMenuState {
  open: boolean;
  query: string;
  position: { top: number; left: number };
  slashPos: number;
}

interface EditorProps {
  initialContent?: string;
  onChange?: (content: string) => void;
  onSlashCommand?: (command: SlashCommand, view: EditorView) => void;
  onWikiLinkClick?: (title: string) => void;
}

export default function Editor({ initialContent = "", onChange, onSlashCommand, onWikiLinkClick }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onSlashCommandRef = useRef(onSlashCommand);
  onSlashCommandRef.current = onSlashCommand;

  const onWikiLinkClickRef = useRef(onWikiLinkClick);
  onWikiLinkClickRef.current = onWikiLinkClick;

  const [slashMenu, setSlashMenu] = useState<SlashMenuState>({
    open: false,
    query: "",
    position: { top: 0, left: 0 },
    slashPos: -1,
  });

  const closeSlashMenu = useCallback(() => {
    setSlashMenu((prev) => ({ ...prev, open: false }));
  }, []);

  const handleSlashSelect = useCallback((command: SlashCommand) => {
    const view = viewRef.current;
    if (!view) return;

    setSlashMenu((prev) => {
      if (prev.slashPos >= 0) {
        const cursorPos = view.state.selection.main.head;
        view.dispatch({
          changes: { from: prev.slashPos, to: cursorPos, insert: "" },
        });
      }
      return { ...prev, open: false };
    });

    onSlashCommandRef.current?.(command, view);
  }, []);

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
        wikiLinkDecorations,
        theme,
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          click(event, view) {
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos === null) return false;
            const doc = view.state.doc.toString();
            const regex = /\[\[([^\]]+)\]\]/g;
            let match;
            while ((match = regex.exec(doc)) !== null) {
              if (pos >= match.index && pos <= match.index + match[0].length) {
                onWikiLinkClickRef.current?.(match[1]);
                return true;
              }
            }
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString());
          }

          // Detect slash command trigger on any update (doc change or selection change)
          const sel = update.state.selection.main;
          if (!sel.empty) {
            setSlashMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
            return;
          }

          const cursorPos = sel.head;
          const lineText = update.state.doc.lineAt(cursorPos).text;
          const lineStart = update.state.doc.lineAt(cursorPos).from;
          const textBeforeCursor = lineText.slice(0, cursorPos - lineStart);

          const match = textBeforeCursor.match(/\/([^\s]*)$/);

          if (match) {
            const query = match[1];
            const slashPos = cursorPos - match[0].length;
            const coords = update.view.coordsAtPos(slashPos);

            if (coords) {
              setSlashMenu({
                open: true,
                query,
                position: { top: coords.bottom + 4, left: coords.left },
                slashPos,
              });
            }
          } else {
            setSlashMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
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

  return (
    <>
      <div ref={containerRef} className="h-full w-full" />
      {slashMenu.open && (
        <SlashMenu
          query={slashMenu.query}
          position={slashMenu.position}
          onSelect={handleSlashSelect}
          onClose={closeSlashMenu}
        />
      )}
    </>
  );
}
