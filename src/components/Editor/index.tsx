import { useEffect, useRef, useState } from 'react';
import type { Document, Block } from '../../models/document';
import styles from './index.module.css';

interface EditorProps {
  document: Document | null;
  onDocumentChange: (document: Document) => void;
  onToolbarPropsReady?: (props: {
    onFormat: (format: 'bold' | 'italic' | 'underline' | 'strikethrough') => void;
    activeFormats: Set<'bold' | 'italic' | 'underline' | 'strikethrough'>;
    onPageBreak: () => void;
    onBlockTypeChange: (blockType: 'h1' | 'h2' | 'h3' | 'paragraph') => void;
  }) => void;
}

interface PageRef {
  element: HTMLDivElement;
  contentElement: HTMLDivElement;
  blockRefs: Map<string, HTMLElement>;
}

type FormatType = 'bold' | 'italic' | 'underline' | 'strikethrough';

export function Editor({ document, onDocumentChange, onToolbarPropsReady }: EditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const isInitializedRef = useRef(false);
  const pageRefsRef = useRef<PageRef[]>([]);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeFormats, setActiveFormats] = useState<Set<FormatType>>(new Set());
  const currentSelectionRef = useRef<Range | null>(null);

  // Helper function to get the appropriate tag for a block
  const getBlockTag = (block: Block): 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'li' | 'div' => {
    // Check if this is a page break block
    if (block.metadata?.isPageBreak) {
      return 'div';
    }
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
    // Handle page break blocks
    if (block.metadata?.isPageBreak) {
      const element = window.document.createElement('div');
      element.className = 'block page-break';
      element.setAttribute('data-page-break', 'true');
      element.setAttribute('data-block-id', block.id);
      element.setAttribute('contenteditable', 'false');
      element.style.visibility = 'hidden';
      element.style.height = '0';
      element.style.margin = '0';
      element.style.padding = '0';
      element.style.border = 'none';
      element.style.overflow = 'hidden';
      return element;
    }

    const tag = getBlockTag(block);
    const element = window.document.createElement(tag);
    element.className = `block ${block.type}`;
    element.setAttribute('data-block-id', block.id);
    element.setAttribute('contenteditable', 'true');

    // Always use innerHTML to preserve formatting spans
    // For plain text, innerHTML works the same as textContent
    element.innerHTML = block.content;

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
    // Check if this is a page break block
    if (element.hasAttribute('data-page-break')) {
      return 'paragraph'; // Use paragraph as base type, but mark as page break in metadata
    }
    const className = element.className || '';
    if (className.includes('heading')) return 'heading';
    if (className.includes('list')) return 'list';
    return 'paragraph';
  };

  // Helper function to extract formatted content from a block element
  // Preserves formatting spans with data-format attributes
  const extractFormattedContent = (blockElement: HTMLElement): string => {
    // Clone the element to avoid modifying the original
    const clone = blockElement.cloneNode(true) as HTMLElement;

    // Remove the data-block-id attribute from the clone
    clone.removeAttribute('data-block-id');
    clone.removeAttribute('data-level');

    // Get innerHTML which preserves all formatting spans
    // For plain text, this will just return the text content
    return clone.innerHTML;
  };

  // Helper function to extract block metadata from DOM element
  const getBlockMetadataFromElement = (element: HTMLElement): Block['metadata'] => {
    const metadata: Block['metadata'] = {};

    // Check if this is a page break block
    if (element.hasAttribute('data-page-break')) {
      metadata.isPageBreak = true;
      return metadata; // Page breaks don't have other metadata
    }

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
    return blockElements.reduce((total, blockElement, index) => {
      // Check if this is a page break block
      if (blockElement.hasAttribute('data-page-break')) {
        // Page break blocks have height 0, but add big height to push next block to new page
        // If there's a next block in the same page, add a large height to force it to next page
        if (index < blockElements.length - 1) {
          // Add a very large height to push the next block to a new page
          return total + getPageContentMaxHeight() + 1000; // Large enough to force overflow
        }
        return total; // Page break at end of page doesn't add height
      }

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

    // Insert the new page right after the current page in the DOM
    const currentPageRef = pageRefsRef.current[currentPageIndex];
    if (currentPageRef && currentPageRef.element.nextSibling) {
      // Insert before the next sibling (if any)
      editor.insertBefore(pageElement, currentPageRef.element.nextSibling);
    } else {
      // No next sibling, append to end
      editor.appendChild(pageElement);
    }

    const newPageRef: PageRef = {
      element: pageElement,
      contentElement: pageContentElement,
      blockRefs: new Map<string, HTMLElement>(),
    };

    // Insert at the correct position in the array
    pageRefsRef.current.splice(nextPageIndex, 0, newPageRef);

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

  // Move all blocks from a starting index to the next page
  const moveBlocksToNextPage = (fromPageIndex: number, toPageIndex: number, startBlockIndex: number): void => {
    const fromPageRef = pageRefsRef.current[fromPageIndex];
    const toPageRef = pageRefsRef.current[toPageIndex];

    if (!fromPageRef || !toPageRef) return;

    const blockElements = Array.from(fromPageRef.contentElement.children) as HTMLElement[];
    if (startBlockIndex >= blockElements.length) return;

    // Find if cursor is in any of the blocks being moved
    let cursorBlock: HTMLElement | null = null;
    for (let i = startBlockIndex; i < blockElements.length; i++) {
      if (isCursorInBlock(blockElements[i])) {
        cursorBlock = blockElements[i];
        break;
      }
    }

    // Move all blocks from startBlockIndex to the end
    const blocksToMove = blockElements.slice(startBlockIndex);

    // To maintain order when inserting at the top, we need to iterate in reverse
    // This way, the first block in the array ends up at the top, preserving original order
    for (let i = blocksToMove.length - 1; i >= 0; i--) {
      const block = blocksToMove[i];
      const blockId = block.getAttribute('data-block-id');
      if (!blockId) continue;

      // Remove from source page
      fromPageRef.contentElement.removeChild(block);
      fromPageRef.blockRefs.delete(blockId);

      // Add to destination page at the top
      // Insert before firstChild (which may change as we insert, but that's okay when iterating backwards)
      toPageRef.contentElement.insertBefore(block, toPageRef.contentElement.firstChild);
      toPageRef.blockRefs.set(blockId, block);
    }

    // If cursor was in one of the moved blocks, restore it
    if (cursorBlock) {
      setTimeout(() => {
        setCursorToStart(cursorBlock!);
      }, 0);
    }
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

        // If page exceeds max height, find all blocks that need to be moved
        if (totalHeight > maxHeight) {
          const blockElements = Array.from(pageRef.contentElement.children) as HTMLElement[];

          // Find all non-page-break blocks
          const nonPageBreakBlocks = blockElements.filter((el) => !el.hasAttribute('data-page-break'));

          // Only move if there's more than one non-page-break block (keep at least one block per page)
          if (nonPageBreakBlocks.length > 1) {
            // Find the split point: keep blocks that fit, move the rest
            let accumulatedHeight = 0;
            let splitIndex = -1;

            // Calculate height of each block and find where to split
            for (let i = 0; i < blockElements.length; i++) {
              const block = blockElements[i];
              if (block.hasAttribute('data-page-break')) {
                // Page break adds large height - everything after it should move
                if (i < blockElements.length - 1) {
                  splitIndex = i + 1;
                  break;
                }
                continue;
              }

              const rect = block.getBoundingClientRect();
              const computedStyle = window.getComputedStyle(block);
              const marginTop = parseFloat(computedStyle.marginTop) || 0;
              const marginBottom = parseFloat(computedStyle.marginBottom) || 0;
              const blockHeight = rect.height + marginTop + marginBottom;

              accumulatedHeight += blockHeight;

              // If adding this block exceeds max height, move this and all subsequent blocks
              if (accumulatedHeight > maxHeight) {
                splitIndex = i;
                break;
              }
            }

            // If we found a split point, move all blocks from that point onwards
            if (splitIndex >= 0 && splitIndex < blockElements.length) {
              getOrCreateNextPage(pageIndex);
              moveBlocksToNextPage(pageIndex, pageIndex + 1, splitIndex);
              hasChanges = true;
              break; // Restart from beginning to re-check all pages
            }
          }
        }
      }
    }
  };

  // Move all blocks from a starting index to the previous page
  const moveBlocksToPreviousPage = (
    fromPageIndex: number,
    toPageIndex: number,
    startBlockIndex: number,
    endBlockIndex: number,
  ): void => {
    const fromPageRef = pageRefsRef.current[fromPageIndex];
    const toPageRef = pageRefsRef.current[toPageIndex];

    if (!fromPageRef || !toPageRef) return;

    const blockElements = Array.from(fromPageRef.contentElement.children) as HTMLElement[];
    if (startBlockIndex >= blockElements.length || endBlockIndex > blockElements.length) return;

    // Find if cursor is in any of the blocks being moved
    let cursorBlock: HTMLElement | null = null;
    for (let i = startBlockIndex; i < endBlockIndex; i++) {
      if (isCursorInBlock(blockElements[i])) {
        cursorBlock = blockElements[i];
        break;
      }
    }

    // Move all blocks from startBlockIndex to endBlockIndex
    const blocksToMove = blockElements.slice(startBlockIndex, endBlockIndex);
    for (const block of blocksToMove) {
      const blockId = block.getAttribute('data-block-id');
      if (!blockId) continue;

      // Remove from source page
      fromPageRef.contentElement.removeChild(block);
      fromPageRef.blockRefs.delete(blockId);

      // Add to destination page at the end
      toPageRef.contentElement.appendChild(block);
      toPageRef.blockRefs.set(blockId, block);
    }

    // If cursor was in one of the moved blocks, restore it
    if (cursorBlock) {
      setTimeout(() => {
        setCursorToStart(cursorBlock!);
      }, 0);
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

      const nextPageBlocks = Array.from(nextPageRef.contentElement.children) as HTMLElement[];

      // If next page has no blocks, move to next iteration
      if (nextPageBlocks.length === 0) continue;

      // Skip reverse compaction if current page has a page break
      // Page breaks force everything after them to the next page
      if (currentPageRef.contentElement.querySelector('[data-page-break]')) {
        continue;
      }

      // Calculate how many blocks can fit on current page
      // Use actual height calculation, not including page break artificial height
      // Note: We already skipped pages with page breaks above, so no need to check for page breaks here
      let currentPageHeight = 0;
      const currentPageBlocks = Array.from(currentPageRef.contentElement.children) as HTMLElement[];
      for (const block of currentPageBlocks) {
        const rect = block.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(block);
        const marginTop = parseFloat(computedStyle.marginTop) || 0;
        const marginBottom = parseFloat(computedStyle.marginBottom) || 0;
        currentPageHeight += rect.height + marginTop + marginBottom;
      }

      let blocksToMove: number[] = [];
      let encounteredPageBreak = false;

      // Iterate through ALL blocks in next page (including page breaks)
      for (let i = 0; i < nextPageBlocks.length; i++) {
        const block = nextPageBlocks[i];
        const isPageBreak = block.hasAttribute('data-page-break');

        if (isPageBreak) {
          // Page break block has height 0
          // Since we're still in the loop, we know we haven't overflowed yet
          // Page break has height 0, so it always fits
          blocksToMove.push(i);
          // Mark that we've encountered a page break
          encounteredPageBreak = true;
          // Continue to check blocks after page break (they'll have large height)
          continue;
        }

        // If we've encountered a page break, blocks after it get large height
        // (because page break forces them to stay after it)
        let blockHeight: number;
        if (encounteredPageBreak) {
          // Blocks after page break should be treated as having very large height
          blockHeight = getPageContentMaxHeight() + 1000;
        } else {
          // Normal block height calculation
          const rect = block.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(block);
          const marginTop = parseFloat(computedStyle.marginTop) || 0;
          const marginBottom = parseFloat(computedStyle.marginBottom) || 0;
          blockHeight = rect.height + marginTop + marginBottom;
        }

        // Check if this block fits
        if (currentPageHeight + blockHeight <= maxHeight) {
          currentPageHeight += blockHeight;
          blocksToMove.push(i);
        } else {
          // Stop if this block doesn't fit
          break;
        }
      }

      // If we found blocks that can fit, move them all at once
      if (blocksToMove.length > 0) {
        // Sort indices to move blocks in order
        blocksToMove.sort((a, b) => a - b);
        const startIndex = blocksToMove[0];
        const endIndex = blocksToMove[blocksToMove.length - 1] + 1;

        // Move all blocks that fit
        moveBlocksToPreviousPage(pageIndex + 1, pageIndex, startIndex, endIndex);

        // Continue to next page pair (don't break, as we want to process all pages)
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

      // Count non-page-break blocks
      const nonPageBreakBlocks = blockElements.filter((el) => !el.hasAttribute('data-page-break'));

      // Remove empty pages (pages with only page breaks or no blocks), but keep at least one page (the last one)
      if (nonPageBreakBlocks.length === 0 && pageRefsRef.current.length > 1) {
        // Remove from DOM
        if (pageRef.element.parentElement) {
          pageRef.element.parentElement.removeChild(pageRef.element);
        }

        // Remove from array
        console.log('removing page', i);
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

          // Skip page break blocks in normal processing - they're handled separately
          // But we still need to include them in the document
          const type = getBlockTypeFromElement(blockElement);
          const metadata = getBlockMetadataFromElement(blockElement);

          // For page break blocks, content is empty
          const content = blockElement.hasAttribute('data-page-break') ? '' : extractFormattedContent(blockElement);

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

  // Rebuild pageRefs from actual DOM state (handles pages/blocks added/removed by browser)
  const syncPageRefsWithDOM = (): void => {
    if (!isInitializedRef.current || !editorRef.current) return;

    const editor = editorRef.current;
    // Get all page elements directly from DOM (not from pageRefs)
    const pageElements = Array.from(editor.children) as HTMLDivElement[];

    // Rebuild pageRefs array to match DOM
    const newPageRefs: PageRef[] = [];

    pageElements.forEach((pageElement) => {
      // Check if this page element has the correct class
      if (!pageElement.classList.contains(styles.page)) return;

      // Find the pageContent element
      const pageContentElement = pageElement.querySelector(`.${styles.pageContent}`) as HTMLDivElement;
      if (!pageContentElement) return;

      // Check if we already have a PageRef for this DOM element
      const existingPageRef = pageRefsRef.current.find(
        (ref) => ref.element === pageElement && ref.contentElement === pageContentElement,
      );

      if (existingPageRef) {
        // Reuse existing PageRef but rebuild blockRefs Map
        const blockRefs = new Map<string, HTMLElement>();
        const blockElements = Array.from(pageContentElement.children) as HTMLElement[];
        blockElements.forEach((blockElement) => {
          const blockId = blockElement.getAttribute('data-block-id');
          if (blockId) {
            blockRefs.set(blockId, blockElement);
          }
        });
        existingPageRef.blockRefs = blockRefs;
        newPageRefs.push(existingPageRef);
      } else {
        // Create new PageRef for this DOM page
        const blockRefs = new Map<string, HTMLElement>();
        const blockElements = Array.from(pageContentElement.children) as HTMLElement[];
        blockElements.forEach((blockElement) => {
          const blockId = blockElement.getAttribute('data-block-id');
          if (blockId) {
            blockRefs.set(blockId, blockElement);
          }
        });

        newPageRefs.push({
          element: pageElement,
          contentElement: pageContentElement,
          blockRefs,
        });
      }
    });

    // Update pageRefsRef to match DOM
    pageRefsRef.current = newPageRefs;

    // Ensure at least one page exists - create default page if empty
    if (pageRefsRef.current.length === 0 && editorRef.current) {
      const editor = editorRef.current;
      const pageElement = window.document.createElement('div');
      pageElement.className = styles.page;

      const pageContentElement = window.document.createElement('div');
      pageContentElement.className = styles.pageContent;

      const blockElement = window.document.createElement('p');
      blockElement.className = 'block paragraph';
      const blockId = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      blockElement.setAttribute('data-block-id', blockId);

      pageContentElement.appendChild(blockElement);
      pageElement.appendChild(pageContentElement);
      editor.appendChild(pageElement);

      const blockRefs = new Map<string, HTMLElement>();
      blockRefs.set(blockId, blockElement);

      pageRefsRef.current.push({
        element: pageElement,
        contentElement: pageContentElement,
        blockRefs,
      });
    }
  };

  // Clean up heading styles that browser adds when merging blocks
  const cleanupHeadingStyles = (element: HTMLElement): void => {
    // Find all spans with font-size styles (browser adds these when merging heading blocks)
    const spansWithFontSize = element.querySelectorAll('span[style*="font-size"]');
    spansWithFontSize.forEach((span) => {
      const spanElement = span as HTMLElement;
      const style = spanElement.getAttribute('style') || '';
      // Check if this span only has font-size style (browser-added heading style)
      const styleMatch = style.match(/font-size:\s*[\d.]+em/);
      if (styleMatch && !spanElement.hasAttribute('data-format')) {
        // This is a browser-added heading style span - unwrap it
        const parent = spanElement.parentNode;
        if (parent) {
          while (spanElement.firstChild) {
            parent.insertBefore(spanElement.firstChild, spanElement);
          }
          parent.removeChild(spanElement);
        }
      }
    });
  };

  // Fix div+br blocks created by Enter key - replace with same type as preceding block
  const fixEnterCreatedBlocks = (): void => {
    if (!editorRef.current) return;

    // Find all div elements that might be Enter-created blocks
    const allDivs = editorRef.current.querySelectorAll('div');
    allDivs.forEach((div) => {
      // Skip page break blocks - they should never be replaced
      if (div.hasAttribute('data-page-break')) {
        return;
      }

      // Check if this is a div with only a br (typical Enter-created block)
      const children = Array.from(div.childNodes);
      const hasOnlyBr =
        children.length === 1 &&
        children[0].nodeType === Node.ELEMENT_NODE &&
        (children[0] as HTMLElement).tagName === 'BR';

      // Also check if it's an empty div (browser sometimes creates empty divs)
      const isEmpty =
        children.length === 0 ||
        (children.length === 1 && children[0].nodeType === Node.TEXT_NODE && !children[0].textContent?.trim());

      if ((hasOnlyBr || isEmpty) && div.parentElement) {
        // Check if this div is a direct child of pageContent (it's a block)
        const pageContent = div.closest(`.${styles.pageContent}`);
        if (pageContent && pageContent.contains(div) && div.parentElement === pageContent) {
          // Find the preceding sibling block
          let precedingBlock: HTMLElement | null = null;
          let current: Node | null = div.previousSibling;
          while (current) {
            if (current.nodeType === Node.ELEMENT_NODE) {
              const element = current as HTMLElement;
              if (element.hasAttribute('data-block-id') && !element.hasAttribute('data-page-break')) {
                precedingBlock = element;
                break;
              }
            }
            current = current.previousSibling;
          }

          if (precedingBlock) {
            // Get the tag type of the preceding block
            const precedingTag = precedingBlock.tagName.toLowerCase();
            const blockId = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Create new block with same type as preceding block
            const newBlockElement = window.document.createElement(
              precedingTag as 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6',
            );

            // Determine block type and class from tag
            let blockType = 'paragraph';
            if (precedingTag.startsWith('h')) {
              blockType = 'heading';
              const level = parseInt(precedingTag.substring(1), 10);
              newBlockElement.setAttribute('data-level', String(level));
            }

            newBlockElement.className = `block ${blockType}`;
            newBlockElement.setAttribute('data-block-id', blockId);
            newBlockElement.setAttribute('contenteditable', 'true');

            // Preserve alignment if it exists
            const currentAlignment = precedingBlock.style.textAlign;
            if (currentAlignment) {
              newBlockElement.style.textAlign = currentAlignment;
            }

            // Replace the div with the new block
            if (div.parentNode) {
              div.parentNode.replaceChild(newBlockElement, div);
            }

            // Update pageRefsRef
            pageRefsRef.current.forEach((pageRef) => {
              if (pageRef.contentElement.contains(newBlockElement)) {
                pageRef.blockRefs.set(blockId, newBlockElement);
              }
            });
          } else {
            // No preceding block - create a paragraph
            const blockId = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const newBlockElement = window.document.createElement('p');
            newBlockElement.className = 'block paragraph';
            newBlockElement.setAttribute('data-block-id', blockId);
            newBlockElement.setAttribute('contenteditable', 'true');

            if (div.parentNode) {
              div.parentNode.replaceChild(newBlockElement, div);
            }

            pageRefsRef.current.forEach((pageRef) => {
              if (pageRef.contentElement.contains(newBlockElement)) {
                pageRef.blockRefs.set(blockId, newBlockElement);
              }
            });
          }
        }
      }
    });
  };

  const handleInput = (_e: React.FormEvent<HTMLDivElement>) => {
    // Clean up any heading style spans that browser might have added during block merges
    if (editorRef.current) {
      const allBlocks = editorRef.current.querySelectorAll('[data-block-id]');
      allBlocks.forEach((block) => {
        if (!(block as HTMLElement).hasAttribute('data-page-break')) {
          cleanupHeadingStyles(block as HTMLElement);
        }
      });
    }

    // Fix div+br blocks created by Enter key
    fixEnterCreatedBlocks();

    // Rebuild pageRefs from DOM first (handles pages/blocks added/removed by browser)
    syncPageRefsWithDOM();

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

  // Get active formats for the current selection - only if ENTIRE selection has the format
  const getActiveFormats = (range: Range): Set<FormatType> => {
    const formats = new Set<FormatType>();
    const allFormats: FormatType[] = ['bold', 'italic', 'underline', 'strikethrough'];

    // Helper function to check if a text node is within a span with a specific format
    const isTextNodeFormatted = (textNode: Node, format: FormatType): boolean => {
      let node: Node | null = textNode;
      while (node && node !== editorRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement;
          if (element.tagName === 'SPAN' && element.hasAttribute('data-format')) {
            const formatAttr = element.getAttribute('data-format') || '';
            const formatList = formatAttr.split(' ');
            if (formatList.includes(format)) {
              return true;
            }
          }
        }
        node = node.parentNode;
      }
      return false;
    };

    // Get all text nodes within the selection range
    const textNodes: Node[] = [];
    const walker = window.document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (range.intersectsNode(node)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    });

    let textNode;
    while ((textNode = walker.nextNode())) {
      if (range.intersectsNode(textNode)) {
        textNodes.push(textNode);
      }
    }

    // If no text nodes found, try a different approach - check the actual selected content
    if (textNodes.length === 0) {
      // Fallback: check if selection is entirely within a single formatted span
      let node: Node | null = range.startContainer;
      while (node && node !== editorRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement;
          if (element.tagName === 'SPAN' && element.hasAttribute('data-format')) {
            // Check if the entire range is within this span
            const spanRange = window.document.createRange();
            spanRange.selectNodeContents(element);

            if (
              range.startContainer === element ||
              (element.contains(range.startContainer) && range.endContainer === element) ||
              element.contains(range.endContainer)
            ) {
              const formatAttr = element.getAttribute('data-format') || '';
              formatAttr.split(' ').forEach((f) => {
                if (allFormats.includes(f as FormatType)) {
                  formats.add(f as FormatType);
                }
              });
            }
            break;
          }
        }
        node = node.parentNode;
      }
      return formats;
    }

    // For each format type, check if ALL text nodes in the selection have that format
    allFormats.forEach((format) => {
      let allNodesHaveFormat = true;

      for (const textNode of textNodes) {
        // Check if this specific text node is formatted with this format
        if (!isTextNodeFormatted(textNode, format)) {
          allNodesHaveFormat = false;
          break;
        }
      }

      if (allNodesHaveFormat && textNodes.length > 0) {
        formats.add(format);
      }
    });

    return formats;
  };

  // Break selection into single character nodes with their formatting
  const breakSelectionIntoCharacterNodes = (range: Range, block: HTMLElement): void => {
    // Get all text nodes in the selection
    const textNodes: { node: Text; startOffset: number; endOffset: number }[] = [];
    const walker = window.document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);

    let textNode;
    while ((textNode = walker.nextNode())) {
      if (range.intersectsNode(textNode)) {
        const nodeText = textNode.textContent || '';
        const nodeRange = window.document.createRange();
        nodeRange.selectNodeContents(textNode);

        // Calculate intersection
        const startOffset = textNode === range.startContainer ? range.startOffset : 0;
        const endOffset = textNode === range.endContainer ? range.endOffset : nodeText.length;

        if (startOffset < endOffset) {
          // Check if this is already a single character node (from previous formatting)
          // If so, we don't need to break it again
          if (nodeText.length === 1) {
            // Already a single character - skip breaking, it will be handled in format application
            continue;
          }
          textNodes.push({ node: textNode as Text, startOffset, endOffset });
        }
      }
    }

    console.log(`  [BREAK] Found ${textNodes.length} text nodes to break`);

    // Process each text node: break into characters and wrap each with its formats
    for (const { node, startOffset, endOffset } of textNodes) {
      const parent = node.parentNode;
      if (!parent) continue;

      const text = node.textContent || '';
      const beforeText = text.substring(0, startOffset);
      const selectedText = text.substring(startOffset, endOffset);
      const afterText = text.substring(endOffset);

      // Get all formats for this text node by walking up the DOM tree
      const getFormatsForNode = (node: Node): Set<FormatType> => {
        const formats = new Set<FormatType>();
        let current: Node | null = node;
        while (current && current !== block) {
          if (current.nodeType === Node.ELEMENT_NODE) {
            const element = current as HTMLElement;
            if (element.tagName === 'SPAN' && element.hasAttribute('data-format')) {
              const formatAttr = element.getAttribute('data-format') || '';
              formatAttr.split(' ').forEach((f) => {
                if (['bold', 'italic', 'underline', 'strikethrough'].includes(f)) {
                  formats.add(f as FormatType);
                }
              });
            }
          }
          current = current.parentNode;
        }
        return formats;
      };

      const existingFormats = getFormatsForNode(node);

      // Create before text node if needed
      if (beforeText) {
        const beforeNode = window.document.createTextNode(beforeText);
        parent.insertBefore(beforeNode, node);
      }

      // Break selected text into character nodes, each wrapped in a span with its formats
      const selectedChars = Array.from(selectedText);
      selectedChars.forEach((char) => {
        const charNode = window.document.createTextNode(char);

        // Create span with all existing formats
        if (existingFormats.size > 0) {
          const span = window.document.createElement('span');
          const formatArray = Array.from(existingFormats).sort();
          span.setAttribute('data-format', formatArray.join(' '));
          span.appendChild(charNode);
          parent.insertBefore(span, node);
        } else {
          // No formatting, just insert text node
          parent.insertBefore(charNode, node);
        }
      });

      // Create after text node if needed
      if (afterText) {
        const afterNode = window.document.createTextNode(afterText);
        parent.insertBefore(afterNode, node);
      }

      // Remove original text node
      parent.removeChild(node);
    }
  };

  // Merge adjacent nodes with the same formatting
  const mergeAdjacentNodesWithSameFormatting = (block: HTMLElement): void => {
    // Get all direct children of the block
    const children = Array.from(block.childNodes);

    // Helper to normalize format string (sort formats for consistent comparison)
    const normalizeFormat = (format: string): string => {
      return format.split(' ').filter(Boolean).sort().join(' ');
    };

    let i = 0;
    while (i < children.length) {
      const current = children[i];

      // Check if current is a span with formatting
      if (current.nodeType === Node.ELEMENT_NODE) {
        const currentElement = current as HTMLElement;
        if (currentElement.tagName === 'SPAN' && currentElement.hasAttribute('data-format')) {
          const currentFormatRaw = currentElement.getAttribute('data-format') || '';
          const currentFormat = normalizeFormat(currentFormatRaw);
          const currentText = currentElement.textContent || '';

          // Look ahead for adjacent spans with the EXACT same formatting
          // Do NOT wrap unformatted text nodes - only merge spans that already have the same format
          let j = i + 1;
          while (j < children.length) {
            const next = children[j];

            if (next.nodeType === Node.ELEMENT_NODE) {
              const nextElement = next as HTMLElement;
              if (nextElement.tagName === 'SPAN' && nextElement.hasAttribute('data-format')) {
                const nextFormatRaw = nextElement.getAttribute('data-format') || '';
                const nextFormat = normalizeFormat(nextFormatRaw);
                const nextText = nextElement.textContent || '';

                // Only merge if formats are EXACTLY the same (after normalization)
                if (nextFormat === currentFormat && nextFormat.length > 0) {
                  // Same format - merge
                  console.log(
                    `  [MERGE] Merging spans with format "${currentFormat}": "${currentText}" + "${nextText}"`,
                  );
                  while (nextElement.firstChild) {
                    currentElement.appendChild(nextElement.firstChild);
                  }
                  block.removeChild(nextElement);
                  children.splice(j, 1);
                  continue;
                } else {
                  // Different format - stop merging
                  console.log(`  [MERGE] Stopping merge: different formats "${currentFormat}" vs "${nextFormat}"`);
                  break;
                }
              } else {
                // Not a formatting span - stop merging
                break;
              }
            } else {
              // Text node or other node type - stop merging (don't wrap unformatted text)
              break;
            }

            j++;
          }
        }
      }

      // Handle text nodes (separate check to avoid type narrowing issues)
      if (current.nodeType === Node.TEXT_NODE) {
        // Text node without formatting - check if next is also text or unformatted
        let j = i + 1;
        while (j < children.length) {
          const next = children[j];
          if (next.nodeType === Node.TEXT_NODE) {
            // Merge text nodes
            const currentText = current as Text;
            const nextText = next as Text;
            currentText.textContent = (currentText.textContent || '') + (nextText.textContent || '');
            block.removeChild(nextText);
            children.splice(j, 1);
          } else if (next.nodeType === Node.ELEMENT_NODE) {
            const nextElement = next as HTMLElement;
            if (nextElement.tagName !== 'SPAN' || !nextElement.hasAttribute('data-format')) {
              // Not a formatting span - can merge text into it or stop
              break;
            } else {
              // Formatting span - stop merging
              break;
            }
          } else {
            break;
          }
          j++;
        }
      }

      i++;
    }

    // Process nested spans - only unwrap if they have the EXACT same format as parent
    // This prevents accidental format merging when formats differ
    const nestedSpans = Array.from(block.querySelectorAll('span[data-format]'));
    nestedSpans.forEach((span) => {
      const parent = span.parentElement;
      if (parent && parent.tagName === 'SPAN' && parent.hasAttribute('data-format')) {
        const parentFormatRaw = parent.getAttribute('data-format') || '';
        const childFormatRaw = span.getAttribute('data-format') || '';
        const parentFormat = normalizeFormat(parentFormatRaw);
        const childFormat = normalizeFormat(childFormatRaw);

        // Only unwrap if formats are EXACTLY the same
        if (parentFormat === childFormat && parentFormat.length > 0) {
          while (span.firstChild) {
            parent.insertBefore(span.firstChild, span);
          }
          span.remove();
        } else {
          // Formats differ - merge them (this handles overlapping formats correctly)
          const allFormats = new Set([...parentFormatRaw.split(' '), ...childFormatRaw.split(' ')].filter(Boolean));
          const mergedFormat = Array.from(allFormats).sort().join(' ');

          while (span.firstChild) {
            parent.insertBefore(span.firstChild, span);
          }
          span.remove();
          parent.setAttribute('data-format', mergedFormat);
        }
      }
    });
  };

  // Apply formatting to selection
  const applyFormat = (format: FormatType): void => {
    // Refresh selection before applying format
    updateToolbar();

    const selection = window.getSelection();
    let range: Range | null = null;

    // Try to get current selection
    if (selection && selection.rangeCount > 0) {
      range = selection.getRangeAt(0);
      if (range.collapsed) {
        range = null;
      }
    }

    // If no valid selection, try to use the last known selection
    if (!range && currentSelectionRef.current) {
      range = currentSelectionRef.current.cloneRange();
      // Restore the selection
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    if (!range || range.collapsed) return;

    try {
      // Check if selection is already formatted with this format
      const existingFormats = getActiveFormats(range);
      const shouldRemove = existingFormats.has(format);

      // Find all blocks that intersect with the selection
      const blocks: HTMLElement[] = [];
      if (editorRef.current) {
        const allBlocks = editorRef.current.querySelectorAll('[data-block-id]');
        allBlocks.forEach((blockElement) => {
          const block = blockElement as HTMLElement;
          // Check if this block intersects with the selection range
          if (range.intersectsNode(block)) {
            blocks.push(block);
          }
        });
      }

      if (blocks.length === 0) return;

      // Process each block separately
      blocks.forEach((block) => {
        // Create a range for this specific block's portion of the selection
        const blockRange = window.document.createRange();
        blockRange.selectNodeContents(block);

        // Calculate the intersection of the selection with this block
        let blockStartCharIndex = 0;
        let blockEndCharIndex = block.textContent?.length || 0;

        // Check if selection starts before this block
        const selectionStartBeforeBlock = range.compareBoundaryPoints(Range.START_TO_START, blockRange) < 0;
        const selectionEndAfterBlock = range.compareBoundaryPoints(Range.END_TO_END, blockRange) > 0;

        if (!selectionStartBeforeBlock) {
          // Selection starts within or after this block
          // Calculate where selection starts relative to block
          const tempRange = window.document.createRange();
          tempRange.selectNodeContents(block);
          tempRange.setEnd(range.startContainer, range.startOffset);
          blockStartCharIndex = tempRange.toString().length;
        }

        if (!selectionEndAfterBlock) {
          // Selection ends within or before this block
          // Calculate where selection ends relative to block
          const tempRange = window.document.createRange();
          tempRange.selectNodeContents(block);
          tempRange.setEnd(range.endContainer, range.endOffset);
          blockEndCharIndex = tempRange.toString().length;
        }

        // Create a range for just this block's portion
        const blockSelectionRange = window.document.createRange();
        blockSelectionRange.selectNodeContents(block);

        // Find the start position within this block
        let startFound = false;
        const walker = window.document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
        let textNode;
        let charCount = 0;
        while ((textNode = walker.nextNode()) && !startFound) {
          const node = textNode as Text;
          const textLength = node.textContent?.length || 0;
          if (charCount + textLength >= blockStartCharIndex) {
            const offset = blockStartCharIndex - charCount;
            blockSelectionRange.setStart(node, Math.max(0, Math.min(offset, textLength)));
            startFound = true;
          } else {
            charCount += textLength;
          }
        }

        // Find the end position within this block
        let endFound = false;
        walker.currentNode = block;
        charCount = 0;
        while ((textNode = walker.nextNode()) && !endFound) {
          const node = textNode as Text;
          const textLength = node.textContent?.length || 0;
          if (charCount + textLength >= blockEndCharIndex) {
            const offset = blockEndCharIndex - charCount;
            blockSelectionRange.setEnd(node, Math.max(0, Math.min(offset, textLength)));
            endFound = true;
          } else {
            charCount += textLength;
          }
        }

        // Step 1: Break selection into single character nodes with their formatting
        breakSelectionIntoCharacterNodes(blockSelectionRange, block);

        // Step 2: Apply format to all character nodes that were in the selection
        const walker2 = window.document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
        const nodesToUpdate: { node: Text; parentSpan: HTMLElement | null }[] = [];

        let currentCharIndex = 0;
        let textNode2;
        while ((textNode2 = walker2.nextNode())) {
          const node = textNode2 as Text;
          const textLength = node.textContent?.length || 0;
          const nodeStart = currentCharIndex;
          const nodeEnd = currentCharIndex + textLength;

          // Check if this node is within the block's selection portion
          if (nodeStart < blockEndCharIndex && nodeEnd > blockStartCharIndex) {
            // This node overlaps with the selection
            // Only process single character nodes
            if (textLength === 1) {
              // Check if this character is actually within the selection bounds
              if (nodeStart >= blockStartCharIndex && nodeStart < blockEndCharIndex) {
                // Find the direct parent span (if any)
                const parent = node.parentNode;
                let parentSpan: HTMLElement | null = null;
                if (parent && parent.nodeType === Node.ELEMENT_NODE) {
                  const element = parent as HTMLElement;
                  if (element.tagName === 'SPAN' && element.hasAttribute('data-format')) {
                    parentSpan = element;
                  }
                }

                nodesToUpdate.push({ node, parentSpan });
              }
            }
          }

          currentCharIndex = nodeEnd;
        }

        // Update formats for each character node
        nodesToUpdate.forEach(({ node, parentSpan }) => {
          if (parentSpan) {
            // Character has formatting span - update it
            const formatAttr = parentSpan.getAttribute('data-format') || '';
            const formats = new Set(formatAttr.split(' ').filter(Boolean));

            if (shouldRemove) {
              formats.delete(format);
            } else {
              formats.add(format);
            }

            const formatArray = Array.from(formats).sort();
            if (formatArray.length === 0) {
              // No formats - unwrap the span
              const grandParent = parentSpan.parentNode;
              if (grandParent) {
                while (parentSpan.firstChild) {
                  grandParent.insertBefore(parentSpan.firstChild, parentSpan);
                }
                grandParent.removeChild(parentSpan);
              }
            } else {
              parentSpan.setAttribute('data-format', formatArray.join(' '));
            }
          } else {
            // Character has no formatting span
            if (shouldRemove) {
              // Already unformatted, nothing to remove
              return;
            }

            // Wrap in span with format
            const span = window.document.createElement('span');
            span.setAttribute('data-format', format);
            const parent = node.parentNode;
            if (parent) {
              parent.insertBefore(span, node);
              span.appendChild(node);
            }
          }
        });

        // Step 3: Merge adjacent nodes with same formatting
        // mergeAdjacentNodesWithSameFormatting(block);
      });

      // Reset selection to the starting position after formatting
      if (selection) {
        try {
          const newRange = window.document.createRange();
          // Set selection to the start of the original range
          newRange.setStart(range.startContainer, range.startOffset);
          newRange.collapse(true); // Collapse to start
          selection.removeAllRanges();
          selection.addRange(newRange);
          currentSelectionRef.current = newRange.cloneRange();
        } catch (e) {
          // If restoration fails, just collapse selection
          selection.removeAllRanges();
          currentSelectionRef.current = null;
        }
      }

      // Refresh toolbar to update active formats after formatting
      setTimeout(() => {
        updateToolbar();

        // Trigger document change to save formatting
        const updatedDocument = recreateDocumentFromDOM();
        if (updatedDocument) {
          onDocumentChange(updatedDocument);
        }
      }, 0);
    } catch (err) {
      console.error('Failed to apply format:', err);
      // Refresh toolbar even on error
      setTimeout(() => {
        updateToolbar();
      }, 0);
    }
  };

  // Update toolbar active formats based on selection
  const updateToolbar = (): void => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setActiveFormats(new Set());
      currentSelectionRef.current = null;
      return;
    }

    const range = selection.getRangeAt(0);
    setActiveFormats(getActiveFormats(range));
    currentSelectionRef.current = range.cloneRange();
  };

  const handleSelectionChange = (): void => {
    updateToolbar();
  };

  const handleMouseUp = (): void => {
    setTimeout(updateToolbar, 0);
  };

  // Handle block type change
  const handleBlockTypeChange = (blockTypeOption: 'h1' | 'h2' | 'h3' | 'paragraph'): void => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!range || range.collapsed) return;

    try {
      // Find all blocks that intersect with the selection
      const blocks: HTMLElement[] = [];
      if (editorRef.current) {
        const allBlocks = editorRef.current.querySelectorAll('[data-block-id]');
        allBlocks.forEach((blockElement) => {
          const block = blockElement as HTMLElement;
          // Skip page break blocks
          if (block.hasAttribute('data-page-break')) return;
          if (range.intersectsNode(block)) {
            blocks.push(block);
          }
        });
      }

      if (blocks.length === 0) return;

      // Map block type option to actual block type and metadata
      let blockType: 'paragraph' | 'heading' | 'list' = 'paragraph';
      let level: number | undefined = undefined;

      switch (blockTypeOption) {
        case 'h1':
          blockType = 'heading';
          level = 1;
          break;
        case 'h2':
          blockType = 'heading';
          level = 2;
          break;
        case 'h3':
          blockType = 'heading';
          level = 3;
          break;
        case 'paragraph':
          blockType = 'paragraph';
          break;
      }

      // Process each block
      blocks.forEach((block) => {
        // Get plain text content (strips all inline formatting)
        const plainText = block.textContent || '';

        // Determine the new tag
        const tag = blockType === 'heading' ? `h${level}` : 'p';

        // Create new element with the updated type
        const newElement = window.document.createElement(tag);
        newElement.className = `block ${blockType}`;
        newElement.setAttribute('data-block-id', block.getAttribute('data-block-id') || '');
        newElement.setAttribute('contenteditable', 'true');
        newElement.textContent = plainText;

        // Apply heading level as data attribute if needed
        if (blockType === 'heading' && level) {
          newElement.setAttribute('data-level', String(level));
        }

        // Preserve alignment if it exists
        const currentAlignment = block.style.textAlign;
        if (currentAlignment) {
          newElement.style.textAlign = currentAlignment;
        }

        // Replace the old block with the new one
        if (block.parentNode) {
          block.parentNode.replaceChild(newElement, block);
        }
      });

      // Update pageRefsRef to reflect the changes
      pageRefsRef.current.forEach((pageRef) => {
        blocks.forEach((oldBlock) => {
          const blockId = oldBlock.getAttribute('data-block-id');
          if (blockId) {
            // Find the new element
            const newBlockElement = editorRef.current?.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement;
            if (newBlockElement && pageRef.blockRefs.has(blockId)) {
              // Update the reference in the map
              pageRef.blockRefs.set(blockId, newBlockElement);
            }
          }
        });
      });

      // Trigger document change
      setTimeout(() => {
        const updatedDocument = recreateDocumentFromDOM();
        if (updatedDocument) {
          onDocumentChange(updatedDocument);
        }
      }, 0);
    } catch (err) {
      console.error('Failed to change block type:', err);
    }
  };

  // Handle page break insertion
  const handlePageBreak = (): void => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!range) return;

    // Find the block containing the cursor/selection
    let block: HTMLElement | null = null;
    let node: Node | null = range.commonAncestorContainer;
    while (node && node !== editorRef.current) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        if (element.hasAttribute('data-block-id')) {
          block = element;
          break;
        }
      }
      node = node.parentNode;
    }

    if (!block) return;

    // Find which page this block is in
    let currentPageIndex = -1;
    let currentPageRef: PageRef | null = null;
    for (let i = 0; i < pageRefsRef.current.length; i++) {
      const pageRef = pageRefsRef.current[i];
      if (pageRef.contentElement.contains(block)) {
        currentPageIndex = i;
        currentPageRef = pageRef;
        break;
      }
    }

    if (!currentPageRef || currentPageIndex === -1) return;

    try {
      // Split the block at cursor position while preserving formatting
      // Create a range from start of block to cursor position
      const beforeRange = window.document.createRange();
      beforeRange.selectNodeContents(block);
      beforeRange.setEnd(range.startContainer, range.startOffset);

      // Create a range from cursor position to end of block
      const afterRange = window.document.createRange();
      afterRange.selectNodeContents(block);
      afterRange.setStart(range.startContainer, range.startOffset);

      // Extract HTML content before and after cursor (preserves formatting)
      const beforeContent = beforeRange.cloneContents();
      const afterContent = afterRange.cloneContents();

      // Update current block with content before cursor (preserves formatting)
      block.innerHTML = '';
      block.appendChild(beforeContent);

      // Create page break block
      const pageBreakElement = window.document.createElement('div');
      const pageBreakId = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      pageBreakElement.className = 'block page-break';
      pageBreakElement.setAttribute('data-page-break', 'true');
      pageBreakElement.setAttribute('data-block-id', pageBreakId);
      pageBreakElement.setAttribute('contenteditable', 'false');
      pageBreakElement.style.visibility = 'hidden';
      pageBreakElement.style.height = '0';
      pageBreakElement.style.margin = '0';
      pageBreakElement.style.padding = '0';
      pageBreakElement.style.border = 'none';
      pageBreakElement.style.overflow = 'hidden';

      // Add to pageRefsRef
      if (currentPageRef) {
        currentPageRef.blockRefs.set(pageBreakId, pageBreakElement);
      }

      // Insert page break after current block
      if (block.parentNode) {
        block.parentNode.insertBefore(pageBreakElement, block.nextSibling);
      }

      // If there's content after cursor, create a new block for it (preserves formatting)
      const hasAfterContent = afterContent.textContent?.trim() || '';
      if (hasAfterContent) {
        const newBlockElement = window.document.createElement('p');
        newBlockElement.className = 'block paragraph';
        const blockId = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        newBlockElement.setAttribute('data-block-id', blockId);
        newBlockElement.setAttribute('contenteditable', 'true');
        // Append the cloned content to preserve formatting
        newBlockElement.appendChild(afterContent);

        // Insert new block after page break
        if (pageBreakElement.parentNode) {
          pageBreakElement.parentNode.insertBefore(newBlockElement, pageBreakElement.nextSibling);
        }

        // Update pageRefsRef
        if (currentPageRef) {
          currentPageRef.blockRefs.set(blockId, newBlockElement);
        }

        // Set cursor to start of new block
        setTimeout(() => {
          setCursorToStart(newBlockElement);
        }, 0);
      } else {
        // No text after cursor, just set cursor to end of current block
        setTimeout(() => {
          const range = window.document.createRange();
          const selection = window.getSelection();
          if (selection && block) {
            range.selectNodeContents(block);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }, 0);
      }

      // Trigger page overflow handling to move content to next page if needed
      setTimeout(() => {
        handlePageOverflow();
        // Trigger document change
        const updatedDocument = recreateDocumentFromDOM();
        if (updatedDocument) {
          onDocumentChange(updatedDocument);
        }
      }, 0);
    } catch (err) {
      console.error('Failed to insert page break:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Handle formatting shortcuts (Ctrl+B, Ctrl+I, Ctrl+U) - use our custom format function
    const isModifierPressed = e.ctrlKey || e.metaKey; // Ctrl on Windows/Linux, Cmd on Mac

    if (isModifierPressed) {
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        e.stopPropagation();
        applyFormat('bold');
        return;
      }
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        e.stopPropagation();
        applyFormat('italic');
        return;
      }
      if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        e.stopPropagation();
        applyFormat('underline');
        return;
      }
    }

    // Handle Enter key to ensure page overflow is checked after new block creation
    if (e.key === 'Enter') {
      // Use setTimeout to allow the browser to create the new block first
      setTimeout(() => {
        handlePageOverflow();
      }, 0);
    }
  };

  // Add selection change listener
  useEffect(() => {
    window.document.addEventListener('selectionchange', handleSelectionChange);
    // Initial update
    updateToolbar();
    return () => {
      window.document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  // Expose toolbar props to parent component
  useEffect(() => {
    if (onToolbarPropsReady) {
      onToolbarPropsReady({
        onFormat: applyFormat,
        activeFormats,
        onPageBreak: handlePageBreak,
        onBlockTypeChange: handleBlockTypeChange,
      });
    }
  }, [activeFormats]);

  return (
    <>
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
        onMouseUp={handleMouseUp}
      ></div>
    </>
  );
}
