import { useEffect, useRef } from 'react';
import type { Document, Block } from '../../models/document';
import styles from './index.module.css';

interface EditorProps {
  document: Document | null;
  onDocumentChange: (document: Document) => void;
}

interface PageRef {
  element: HTMLDivElement;
  contentElement: HTMLDivElement;
  blockRefs: Map<string, HTMLElement>;
}

export function Editor({ document, onDocumentChange }: EditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const isInitializedRef = useRef(false);
  const pageRefsRef = useRef<PageRef[]>([]);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper function to get the appropriate tag for a block
  const getBlockTag = (block: Block): 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'li' => {
    switch (block.type) {
      case 'heading':
        const level = block.metadata?.level || 1;
        return `h${Math.min(Math.max(level, 1), 6)}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      case 'list':
        return 'li';
      case 'paragraph':
      default:
        return 'p';
    }
  };

  // Helper function to create a block element
  const createBlockElement = (block: Block): HTMLElement => {
    const tag = getBlockTag(block);
    const element = window.document.createElement(tag);
    element.className = `block ${block.type}`;
    element.setAttribute('data-block-id', block.id);
    element.setAttribute('contenteditable', 'true');
    element.textContent = block.content;

    // Apply alignment if specified
    if (block.metadata?.alignment) {
      element.style.textAlign = block.metadata.alignment;
    }

    // Apply heading level as data attribute
    if (block.type === 'heading' && block.metadata?.level) {
      element.setAttribute('data-level', String(block.metadata.level));
    }

    return element;
  };

  // Initialize editor with pages and blocks using direct DOM manipulation
  useEffect(() => {
    if (document && !isInitializedRef.current && editorRef.current) {
      const editor = editorRef.current;
      editor.innerHTML = ''; // Clear any existing content

      const pageRefs: PageRef[] = [];

      // Create pages and blocks
      document.pages.forEach((page) => {
        // Create page container
        const pageElement = window.document.createElement('div');
        pageElement.className = styles.page;

        // Create page content container
        const pageContentElement = window.document.createElement('div');
        pageContentElement.className = styles.pageContent;

        // Create blocks for this page
        const blockRefs = new Map<string, HTMLElement>();
        page.blocks.forEach((block) => {
          const blockElement = createBlockElement(block);
          pageContentElement.appendChild(blockElement);
          blockRefs.set(block.id, blockElement);
        });

        pageElement.appendChild(pageContentElement);
        editor.appendChild(pageElement);

        pageRefs.push({
          element: pageElement,
          contentElement: pageContentElement,
          blockRefs,
        });
      });

      pageRefsRef.current = pageRefs;
      isInitializedRef.current = true;
    }
  }, [document]);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Helper function to extract block type from DOM element
  const getBlockTypeFromElement = (element: HTMLElement): Block['type'] => {
    const className = element.className || '';
    if (className.includes('heading')) return 'heading';
    if (className.includes('list')) return 'list';
    return 'paragraph';
  };

  // Helper function to extract block metadata from DOM element
  const getBlockMetadataFromElement = (element: HTMLElement): Block['metadata'] => {
    const metadata: Block['metadata'] = {};

    // Extract alignment from style
    const textAlign = element.style.textAlign;
    if (textAlign && ['left', 'center', 'right', 'justify'].includes(textAlign)) {
      metadata.alignment = textAlign as 'left' | 'center' | 'right' | 'justify';
    }

    // Extract heading level from data attribute or tag name
    if (element.className.includes('heading')) {
      const levelAttr = element.getAttribute('data-level');
      if (levelAttr) {
        metadata.level = parseInt(levelAttr, 10);
      } else {
        // Extract from tag name (h1, h2, etc.)
        const tagMatch = element.tagName.match(/^h([1-6])$/i);
        if (tagMatch) {
          metadata.level = parseInt(tagMatch[1], 10);
        }
      }
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  };

  // Calculate total height of all blocks in a page
  const calculatePageBlocksHeight = (pageRef: PageRef): number => {
    const blockElements = Array.from(pageRef.contentElement.children) as HTMLElement[];
    return blockElements.reduce((total, blockElement) => {
      const rect = blockElement.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(blockElement);
      const marginTop = parseFloat(computedStyle.marginTop) || 0;
      const marginBottom = parseFloat(computedStyle.marginBottom) || 0;

      // getBoundingClientRect includes padding and border, but not margin
      // So we add marginTop and marginBottom
      return total + rect.height + marginTop + marginBottom;
    }, 0);
  };

  // Get the maximum allowed height for page content
  const getPageContentMaxHeight = (): number => {
    // From CSS: height: 931px (1123px - 192px padding)
    return 931;
  };

  // Get or create the next page
  const getOrCreateNextPage = (currentPageIndex: number): PageRef => {
    const nextPageIndex = currentPageIndex + 1;

    // If next page exists, return it
    if (pageRefsRef.current[nextPageIndex]) {
      return pageRefsRef.current[nextPageIndex];
    }

    // Create new page
    if (!editorRef.current) {
      throw new Error('Editor ref is not available');
    }

    const editor = editorRef.current;
    const pageElement = window.document.createElement('div');
    pageElement.className = styles.page;

    const pageContentElement = window.document.createElement('div');
    pageContentElement.className = styles.pageContent;

    pageElement.appendChild(pageContentElement);
    editor.appendChild(pageElement);

    const newPageRef: PageRef = {
      element: pageElement,
      contentElement: pageContentElement,
      blockRefs: new Map<string, HTMLElement>(),
    };

    // Insert at the correct position in the array
    pageRefsRef.current.splice(nextPageIndex, 0, newPageRef);

    // Update page numbers for all subsequent pages
    for (let i = nextPageIndex; i < pageRefsRef.current.length; i++) {
      // The page number is just the index + 1, so no need to update DOM
    }

    return newPageRef;
  };

  // Helper function to set cursor to the start of an element
  const setCursorToStart = (element: HTMLElement): void => {
    try {
      const selection = window.getSelection();
      if (!selection) return;

      const range = window.document.createRange();

      // Find the first text node in the element
      const walker = window.document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);

      const firstTextNode = walker.nextNode();
      if (firstTextNode) {
        range.setStart(firstTextNode, 0);
        range.setEnd(firstTextNode, 0);
      } else {
        // If no text node, set at the start of the element
        range.setStart(element, 0);
        range.setEnd(element, 0);
      }

      selection.removeAllRanges();
      selection.addRange(range);

      // Focus the element
      element.focus();
    } catch (e) {
      // Ignore errors
    }
  };

  // Check if the active element is within the given block
  const isCursorInBlock = (blockElement: HTMLElement): boolean => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      // Fallback to activeElement check
      const activeElement = window.document.activeElement as HTMLElement | null;
      if (!activeElement) return false;
      return blockElement === activeElement || blockElement.contains(activeElement);
    }

    // Check if the selection's range is within the block
    const range = selection.getRangeAt(0);
    const rangeContainer = range.commonAncestorContainer;

    // Check if the range container is within the block
    return blockElement.contains(rangeContainer) || blockElement === rangeContainer;
  };

  // Move the last block from one page to the top of the next page
  const moveLastBlockToNextPage = (fromPageIndex: number, toPageIndex: number): void => {
    const fromPageRef = pageRefsRef.current[fromPageIndex];
    const toPageRef = pageRefsRef.current[toPageIndex];

    if (!fromPageRef || !toPageRef) return;

    const blockElements = Array.from(fromPageRef.contentElement.children) as HTMLElement[];
    if (blockElements.length === 0) return;

    const lastBlock = blockElements[blockElements.length - 1];
    const blockId = lastBlock.getAttribute('data-block-id');

    if (!blockId) return;

    // Check if cursor is in this block before moving
    const cursorWasInBlock = isCursorInBlock(lastBlock);

    // Remove from source page
    fromPageRef.contentElement.removeChild(lastBlock);
    fromPageRef.blockRefs.delete(blockId);

    // Add to destination page at the top
    toPageRef.contentElement.insertBefore(lastBlock, toPageRef.contentElement.firstChild);
    toPageRef.blockRefs.set(blockId, lastBlock);

    // If cursor was in this block, move it to the start of the block in its new location
    if (cursorWasInBlock) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        setCursorToStart(lastBlock);
      }, 0);
    }
  };

  // Move the first block from one page to the end of the previous page
  const moveFirstBlockToPreviousPage = (fromPageIndex: number, toPageIndex: number): void => {
    const fromPageRef = pageRefsRef.current[fromPageIndex];
    const toPageRef = pageRefsRef.current[toPageIndex];

    if (!fromPageRef || !toPageRef) return;

    const blockElements = Array.from(fromPageRef.contentElement.children) as HTMLElement[];
    if (blockElements.length === 0) return;

    const firstBlock = blockElements[0];
    const blockId = firstBlock.getAttribute('data-block-id');

    if (!blockId) return;

    // Check if cursor is in this block before moving
    const cursorWasInBlock = isCursorInBlock(firstBlock);

    // Remove from source page
    fromPageRef.contentElement.removeChild(firstBlock);
    fromPageRef.blockRefs.delete(blockId);

    // Add to destination page at the end
    toPageRef.contentElement.appendChild(firstBlock);
    toPageRef.blockRefs.set(blockId, firstBlock);

    // If cursor was in this block, move it to the start of the block in its new location
    if (cursorWasInBlock) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        setCursorToStart(firstBlock);
      }, 0);
    }
  };

  // Find the page index that contains the active/focused element
  const findCurrentPageIndex = (): number | null => {
    const activeElement = window.document.activeElement as HTMLElement | null;
    if (!activeElement) return null;

    // Check if active element is a block or is within a block
    let blockElement: HTMLElement | null = null;
    let current: HTMLElement | null = activeElement;

    while (current) {
      const blockId = current.getAttribute('data-block-id');
      if (blockId) {
        blockElement = current;
        break;
      }
      current = current.parentElement;
    }

    if (!blockElement) return null;

    // Find which page contains this block
    for (let i = 0; i < pageRefsRef.current.length; i++) {
      const pageRef = pageRefsRef.current[i];
      if (pageRef.contentElement.contains(blockElement)) {
        return i;
      }
    }

    return null;
  };

  // Calculate height if a block were added to a page
  const calculatePageHeightWithBlock = (pageRef: PageRef, blockElement: HTMLElement): number => {
    const currentHeight = calculatePageBlocksHeight(pageRef);
    const rect = blockElement.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(blockElement);
    const marginTop = parseFloat(computedStyle.marginTop) || 0;
    const marginBottom = parseFloat(computedStyle.marginBottom) || 0;

    // getBoundingClientRect includes padding and border, but not margin
    // So we add marginTop and marginBottom
    const blockHeight = rect.height + marginTop + marginBottom;
    return currentHeight + blockHeight;
  };

  // Handle page overflow - move overflowing blocks to next pages (forward flow)
  const handleForwardOverflow = (): void => {
    if (!isInitializedRef.current || pageRefsRef.current.length === 0) {
      return;
    }

    const maxHeight = getPageContentMaxHeight();
    let hasChanges = true;

    // Keep processing until no more changes are needed
    while (hasChanges) {
      hasChanges = false;

      // Process each page
      for (let pageIndex = 0; pageIndex < pageRefsRef.current.length; pageIndex++) {
        const pageRef = pageRefsRef.current[pageIndex];
        const totalHeight = calculatePageBlocksHeight(pageRef);

        // If page exceeds max height, move last block to next page
        if (totalHeight > maxHeight) {
          const blockElements = Array.from(pageRef.contentElement.children) as HTMLElement[];

          // Only move if there's more than one block (keep at least one block per page)
          if (blockElements.length > 1) {
            getOrCreateNextPage(pageIndex);
            moveLastBlockToNextPage(pageIndex, pageIndex + 1);
            hasChanges = true;
            break; // Restart from beginning to re-check all pages
          }
        }
      }
    }
  };

  // Handle reverse compaction - pull blocks from next pages to current page (reverse flow)
  const handleReverseCompaction = (startPageIndex: number): void => {
    if (!isInitializedRef.current || pageRefsRef.current.length === 0) {
      return;
    }

    const maxHeight = getPageContentMaxHeight();

    // Start from the current page and work forward
    for (let pageIndex = startPageIndex; pageIndex < pageRefsRef.current.length - 1; pageIndex++) {
      const currentPageRef = pageRefsRef.current[pageIndex];
      const nextPageRef = pageRefsRef.current[pageIndex + 1];

      if (!currentPageRef || !nextPageRef) continue;

      let hasChanges = true;

      // Keep pulling blocks from next page while they fit
      while (hasChanges) {
        hasChanges = false;
        const nextPageBlocks = Array.from(nextPageRef.contentElement.children) as HTMLElement[];

        // If next page has no blocks, move to next iteration
        if (nextPageBlocks.length === 0) break;

        const firstBlockFromNext = nextPageBlocks[0];
        const heightWithBlock = calculatePageHeightWithBlock(currentPageRef, firstBlockFromNext);

        // If the block fits, move it to current page
        if (heightWithBlock <= maxHeight) {
          moveFirstBlockToPreviousPage(pageIndex + 1, pageIndex);
          hasChanges = true;
        }
      }
    }
  };

  // Remove empty pages (except the last one, which should always exist)
  const removeEmptyPages = (): void => {
    if (!isInitializedRef.current || pageRefsRef.current.length === 0) {
      return;
    }

    // Work backwards to avoid index issues when removing
    for (let i = pageRefsRef.current.length - 1; i >= 0; i--) {
      const pageRef = pageRefsRef.current[i];
      const blockElements = Array.from(pageRef.contentElement.children) as HTMLElement[];

      // Remove empty pages, but keep at least one page (the last one)
      if (blockElements.length === 0 && pageRefsRef.current.length > 1) {
        // Remove from DOM
        if (pageRef.element.parentElement) {
          pageRef.element.parentElement.removeChild(pageRef.element);
        }

        // Remove from array
        pageRefsRef.current.splice(i, 1);
      }
    }
  };

  // Handle page overflow - does both forward and reverse flow
  const handlePageOverflow = (): void => {
    if (!isInitializedRef.current || pageRefsRef.current.length === 0) {
      return;
    }

    // First, find the current page where input occurred
    const currentPageIndex = findCurrentPageIndex() ?? 0;

    // Step 1: Handle forward overflow (push overflowed content to next pages)
    handleForwardOverflow();

    // Step 2: Handle reverse compaction (pull blocks from next pages to current page)
    handleReverseCompaction(currentPageIndex);

    // Step 3: Remove empty pages (except the last one)
    removeEmptyPages();
  };

  // Recreate document from current DOM state
  const recreateDocumentFromDOM = (): Document | null => {
    if (!editorRef.current || !document || !isInitializedRef.current) {
      return null;
    }

    const pages = pageRefsRef.current
      .map((pageRef, pageIndex) => {
        const blocks: Block[] = [];

        // Get all block elements from the page content
        const blockElements = Array.from(pageRef.contentElement.children) as HTMLElement[];

        blockElements.forEach((blockElement) => {
          const blockId = blockElement.getAttribute('data-block-id');
          if (!blockId) return;

          const type = getBlockTypeFromElement(blockElement);
          const content = blockElement.textContent || '';
          const metadata = getBlockMetadataFromElement(blockElement);

          blocks.push({
            id: blockId,
            type,
            content,
            metadata,
          });
        });

        return {
          number: pageIndex + 1,
          blocks,
        };
      })
      // Filter out empty pages, but ensure at least one page exists
      .filter((page, index, array) => {
        // Keep page if it has blocks, or if it's the last page (to ensure at least one page)
        return page.blocks.length > 0 || index === array.length - 1;
      })
      // Re-number pages after filtering
      .map((page, index) => ({
        ...page,
        number: index + 1,
      }));

    // Ensure at least one page exists (with at least one empty block if needed)
    if (pages.length === 0) {
      pages.push({
        number: 1,
        blocks: [],
      });
    }

    return {
      ...document,
      pages,
      updatedAt: Date.now(),
    };
  };

  const handleInput = (_e: React.FormEvent<HTMLDivElement>) => {
    // Handle page overflow immediately (before debounce)
    handlePageOverflow();

    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set new timeout
    debounceTimeoutRef.current = setTimeout(() => {
      const updatedDocument = recreateDocumentFromDOM();
      if (updatedDocument) {
        onDocumentChange(updatedDocument);
      }
    }, 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Handle Enter key to ensure page overflow is checked after new block creation
    if (e.key === 'Enter') {
      // Use setTimeout to allow the browser to create the new block first
      setTimeout(() => {
        handlePageOverflow();
      }, 0);
    }
  };

  return (
    <div
      className={styles.editor}
      tabIndex={0}
      role="textbox"
      aria-label="Document editor"
      ref={editorRef}
      contentEditable={true}
      suppressContentEditableWarning={true}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
    ></div>
  );
}
