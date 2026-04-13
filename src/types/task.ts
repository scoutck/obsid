export interface Task {
  id: string;
  title: string;
  completed: boolean;
  dueDate: Date | null;
  noteId: string | null;
  personNoteId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskWithNote extends Task {
  noteTitle: string | null;
}

export function parseTask(raw: {
  id: string;
  title: string;
  completed: boolean;
  dueDate: Date | null;
  noteId: string | null;
  personNoteId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Task {
  return {
    id: raw.id,
    title: raw.title,
    completed: raw.completed,
    dueDate: raw.dueDate,
    noteId: raw.noteId,
    personNoteId: raw.personNoteId,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
