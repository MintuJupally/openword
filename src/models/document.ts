import { v4 as uuidv4 } from 'uuid';

export type BlockType = 'paragraph' | 'heading' | 'list';

export interface Block {
  id: string;
  type: BlockType;
  content: string;
  metadata?: {
    alignment?: 'left' | 'center' | 'right' | 'justify';
    level?: number; // for headings (1-6) or list indentation
    styles?: string[]; // for inline styles like bold, italic
  };
}

/**
 * Represents a cursor position within a document.
 */
export interface CursorPosition {
  blockId: string;
  offset: number; // character offset within the block's content
}

/**
 * Represents a text selection within a document.
 */
export interface Selection {
  start: CursorPosition;
  end: CursorPosition;
}

/**
 * Editor state that tracks cursor and selection.
 */
export interface EditorState {
  cursor: CursorPosition | null;
  selection: Selection | null;
  focusedBlockId: string | null;
}

export interface DocumentPage {
  number: number;
  blocks: Block[];
}

export interface Document {
  id: string;
  title: string;
  pages: DocumentPage[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Creates an empty document with UTC timestamps.
 * Timestamps are stored as UTC milliseconds since epoch.
 */
export function createEmptyDocument(id: string, title: string = 'Untitled Document'): Document {
  // Date.now() returns UTC milliseconds since epoch
  const now = Date.now();
  return {
    id,
    title,
    pages: [
      {
        number: 1,
        blocks: [
          {
            id: uuidv4(),
            type: 'paragraph',
            content: '',
          },
        ],
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

