import { useEffect, useRef, useState } from 'react';
import type { Document, Block } from '../../models/document';
import { FormatToolbar } from './FormatToolbar';
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

type FormatType = 'bold' | 'italic' | 'underline' | 'strikethrough';

export function Editor({ document, onDocumentChange }: EditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const isInitializedRef = useRef(false);
  const pageRefsRef = useRef<PageRef[]>([]);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeFormats, setActiveFormats] = useState<Set<FormatType>>(new Set());
  const currentSelectionRef = useRef<Range | null>(null);

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

          // Extract content with formatting - preserve HTML structure with formatting spans
          // Get all child nodes and serialize them to HTML
          const content = extractFormattedContent(blockElement);

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
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
      <FormatToolbar onFormat={applyFormat} activeFormats={activeFormats} />
    </>
  );
}
