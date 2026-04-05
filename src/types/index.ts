export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  type: string;
  links: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Collection {
  id: string;
  name: string;
  filter: CollectionFilter;
  createdAt: Date;
}

export interface CollectionFilter {
  tags?: string[];
  type?: string;
  dateRange?: "today" | "this-week" | "this-month" | "all";
  query?: string;
}

export function parseNote(raw: {
  id: string;
  title: string;
  content: string;
  tags: string;
  type: string;
  links: string;
  createdAt: Date;
  updatedAt: Date;
}): Note {
  return {
    ...raw,
    tags: JSON.parse(raw.tags),
    links: JSON.parse(raw.links),
  };
}

export function parseCollection(raw: {
  id: string;
  name: string;
  filter: string;
  createdAt: Date;
}): Collection {
  return {
    ...raw,
    filter: JSON.parse(raw.filter),
  };
}
