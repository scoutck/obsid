"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { markdownPreview } from "@/editor/markdown-preview";
import { wikiLinkDecorations } from "@/editor/wiki-links";
import { tagSyntaxDecorations } from "@/editor/tag-syntax";
import {
  commandWidgetsExtension,
  addCommandEffect,
} from "@/editor/command-widgets";
import SlashMenu from "@/components/SlashMenu";
import TagMenu from "@/components/TagMenu";
import { type SlashCommand } from "@/editor/slash-commands";
import type { CommandData } from "@/types";

const theme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "var(--text-body)",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--text-primary)",
    borderLeftWidth: "2px",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--text-primary)",
  },
  ".cm-content": {
    caretColor: "var(--text-primary)",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(0, 0, 0, 0.02)",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "var(--accent-muted) !important",
  },
  ".cm-gutters": {
    display: "none",
  },
  // Heading hierarchy — per-level sizing
  ".cm-heading": {
    fontWeight: "700",
    color: "var(--text-primary)",
    letterSpacing: "-0.01em",
  },
  ".cm-heading-1": { fontSize: "1.5em" },
  ".cm-heading-2": { fontSize: "1.25em" },
  ".cm-heading-3": { fontWeight: "600", fontSize: "1.125em", color: "#27272a" },
  ".cm-heading-4": { fontWeight: "600", fontSize: "1em", color: "#27272a" },
  ".cm-heading-5": { fontWeight: "600", fontSize: "0.875em", color: "#3f3f46" },
  ".cm-heading-6": { fontWeight: "600", fontSize: "0.875em", color: "#3f3f46", fontStyle: "italic" },
  ".cm-bold": {
    fontWeight: "700",
  },
  ".cm-italic": {
    fontStyle: "italic",
  },
  ".cm-strikethrough": {
    textDecoration: "line-through",
    color: "var(--strikethrough)",
  },
  ".cm-highlight": {
    backgroundColor: "var(--highlight-bg)",
    borderRadius: "2px",
    padding: "0 2px",
  },
  ".cm-inline-code": {
    backgroundColor: "var(--code-bg)",
    borderRadius: "3px",
    padding: "1px 5px",
    fontFamily: "var(--font-mono)",
    fontSize: "0.9em",
    color: "var(--code-text)",
  },
  ".cm-tag": {
    color: "var(--tag-text)",
    fontWeight: "600",
  },
  ".cm-claude-line": {
    color: "var(--text-tertiary)",
    fontStyle: "italic",
  },
  ".cm-claude-confirm": {
    color: "var(--text-tertiary)",
    fontSize: "0.9em",
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
  initialCommands?: CommandData[];
  onChange?: (content: string) => void;
  onSlashCommand?: (command: SlashCommand, view: EditorView) => void;
  onWikiLinkClick?: (title: string) => void;
  onClaudeCommand?: (instruction: string, commandId: string, line: number) => void;
  editorViewRef?: React.MutableRefObject<EditorView | null>;
  mode?: "notes" | "chat";
}

export default function Editor({ initialContent = "", initialCommands, onChange, onSlashCommand, onWikiLinkClick, onClaudeCommand, editorViewRef, mode }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const initialContentRef = useRef(initialContent);
  const initialCommandsRef = useRef(initialCommands);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onSlashCommandRef = useRef(onSlashCommand);
  onSlashCommandRef.current = onSlashCommand;

  const onWikiLinkClickRef = useRef(onWikiLinkClick);
  onWikiLinkClickRef.current = onWikiLinkClick;

  const onClaudeCommandRef = useRef(onClaudeCommand);
  onClaudeCommandRef.current = onClaudeCommand;

  const [slashMenu, setSlashMenu] = useState<SlashMenuState>({
    open: false,
    query: "",
    position: { top: 0, left: 0 },
    slashPos: -1,
  });

  const [tagMenu, setTagMenu] = useState<{
    open: boolean;
    query: string;
    position: { top: number; left: number };
    hashPos: number;
  }>({ open: false, query: "", position: { top: 0, left: 0 }, hashPos: -1 });

  const closeSlashMenu = useCallback(() => {
    setSlashMenu((prev) => ({ ...prev, open: false }));
  }, []);

  const handleSlashSelect = useCallback((command: SlashCommand) => {
    const view = viewRef.current;
    if (!view) return;

    // Remove the /query text first
    const { slashPos } = slashMenu;
    if (slashPos >= 0) {
      const cursorPos = view.state.selection.main.head;
      view.dispatch({
        changes: { from: slashPos, to: cursorPos, insert: "" },
      });
    }

    setSlashMenu((prev) => ({ ...prev, open: false }));

    // Execute command after view state is settled
    requestAnimationFrame(() => {
      onSlashCommandRef.current?.(command, view);
      view.focus();
    });
  }, [slashMenu]);

  const closeTagMenu = useCallback(() => {
    setTagMenu((prev) => ({ ...prev, open: false }));
  }, []);

  const handleTagSelect = useCallback((tag: string) => {
    const view = viewRef.current;
    if (!view) return;

    const { hashPos } = tagMenu;
    if (hashPos >= 0) {
      const cursorPos = view.state.selection.main.head;
      view.dispatch({
        changes: { from: hashPos, to: cursorPos, insert: `#${tag} ` },
      });
    }
    setTagMenu((prev) => ({ ...prev, open: false }));
    requestAnimationFrame(() => view.focus());
  }, [tagMenu]);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: initialContentRef.current,
      extensions: [
        keymap.of([
          {
            key: "Enter",
            run(view) {
              const line = view.state.doc.lineAt(
                view.state.selection.main.head
              );
              const match = line.text.match(/^\/claude\s+(.+)$/);
              if (match) {
                const lineNumber = line.number;
                const tempId = `cmd-${Date.now()}`;

                // Remove the /claude line from content and add a command widget
                const deleteEnd = Math.min(
                  line.to + 1,
                  view.state.doc.length
                );
                view.dispatch({
                  changes: { from: line.from, to: deleteEnd },
                  selection: { anchor: line.from },
                  effects: addCommandEffect.of({
                    id: tempId,
                    pos: line.from,
                    instruction: match[1],
                    confirmation: "",
                    status: "pending",
                  }),
                });

                onClaudeCommandRef.current?.(match[1], tempId, lineNumber);
                return true;
              }
              return false;
            },
          },
        ]),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
        history(),
        closeBrackets(),
        markdown({ extensions: [GFM] }),
        syntaxHighlighting(defaultHighlightStyle),
        markdownPreview,
        wikiLinkDecorations,
        tagSyntaxDecorations,
        commandWidgetsExtension,
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
            setTagMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
            return;
          }

          const cursorPos = sel.head;
          const lineText = update.state.doc.lineAt(cursorPos).text;
          const lineStart = update.state.doc.lineAt(cursorPos).from;
          const textBeforeCursor = lineText.slice(0, cursorPos - lineStart);

          const match = textBeforeCursor.match(/\/([^\s]*)$/);

          if (match) {
            const query = match[1];
            // Auto-dismiss slash menu when typing /claude command
            if (query.startsWith("claude ")) {
              setSlashMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
            } else {
              const slashPos = cursorPos - match[0].length;
              const coords = update.view.coordsAtPos(slashPos);

              if (coords) {
                const menuHeight = 288; // max-h-72
                const spaceBelow = window.innerHeight - coords.bottom;
                const top = spaceBelow < menuHeight
                  ? coords.top - menuHeight - 4
                  : coords.bottom + 4;
                setSlashMenu({
                  open: true,
                  query,
                  position: { top, left: coords.left },
                  slashPos,
                });
              }
            }
          } else {
            setSlashMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
          }

          // Detect #tag autocomplete trigger (only when slash menu is not open)
          if (!match) {
            const hashMatch = textBeforeCursor.match(/#([a-zA-Z][a-zA-Z0-9_-]*)$/);
            if (hashMatch && !/^#{1,6}\s/.test(lineText)) {
              const tagQuery = hashMatch[1];
              const hashPos = cursorPos - hashMatch[0].length;
              const coords = update.view.coordsAtPos(hashPos);
              if (coords) {
                const menuHeight = 288;
                const spaceBelow = window.innerHeight - coords.bottom;
                const top = spaceBelow < menuHeight
                  ? coords.top - menuHeight - 4
                  : coords.bottom + 4;
                setTagMenu({
                  open: true,
                  query: tagQuery,
                  position: { top, left: coords.left },
                  hashPos,
                });
              }
            } else {
              setTagMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
            }
          } else {
            setTagMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    if (editorViewRef) editorViewRef.current = view;

    // Place cursor at end of content, on a new line
    const docLen = view.state.doc.length;
    const lastLine = view.state.doc.lineAt(docLen);
    const needsNewline = lastLine.text.length > 0;
    if (needsNewline) {
      view.dispatch({
        changes: { from: docLen, insert: "\n" },
        selection: { anchor: docLen + 1 },
      });
    } else {
      view.dispatch({ selection: { anchor: docLen } });
    }
    // Initialize command widgets from saved commands.
    // Place at end of document — stored line numbers drift across sessions
    // as the user edits content, so inline positioning would be unreliable.
    const cmds = initialCommandsRef.current;
    if (cmds && cmds.length > 0) {
      const endPos = view.state.doc.length;
      const effects = cmds.map((cmd) =>
        addCommandEffect.of({
          id: cmd.id,
          pos: endPos,
          instruction: cmd.instruction,
          confirmation: cmd.confirmation,
          status: cmd.status,
        })
      );
      view.dispatch({ effects });
    }

    view.focus();

    return () => {
      if (editorViewRef) editorViewRef.current = null;
      view.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div ref={containerRef} className="h-full w-full" />
      {slashMenu.open && (
        <SlashMenu
          query={slashMenu.query}
          position={slashMenu.position}
          mode={mode}
          onSelect={handleSlashSelect}
          onClose={closeSlashMenu}
        />
      )}
      {tagMenu.open && (
        <TagMenu
          query={tagMenu.query}
          position={tagMenu.position}
          onSelect={handleTagSelect}
          onClose={closeTagMenu}
        />
      )}
    </>
  );
}
