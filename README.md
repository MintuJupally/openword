# OpenWord

A modern, feature-rich document editor built with React and TypeScript. OpenWord provides a Google Docs-like editing experience with automatic page management, rich text formatting, and local storage capabilities.

## Project Description

OpenWord is a web-based document editor that allows users to create, edit, and manage documents with a clean and intuitive interface. The editor features automatic page overflow handling, real-time formatting, and persistent local storage using IndexedDB. Documents are organized in a paginated format similar to traditional word processors, with automatic content flow between pages.

## Demo

Watch a demo of OpenWord in action:

[OpenWord Demo Video](https://drive.google.com/file/d/1TsnU0iWncWlIw6eW1g3jETXERDPyEYhg/view?usp=sharing)

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

### Running the Application

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173` (or the port shown in the terminal).

## Tech Stack

- **React 19** - UI library for building the user interface
- **TypeScript** - Type-safe JavaScript for better code quality
- **Vite** - Fast build tool and development server
- **Ant Design** - UI component library for consistent design
- **React Router** - Client-side routing for navigation
- **IndexedDB (via idb)** - Client-side database for persistent document storage
- **UUID** - Unique identifier generation for documents and blocks

## Features

### Document Management

- Create and manage multiple documents
- Edit document titles inline
- Automatic document saving with debouncing
- View recent documents on the home page
- Last updated timestamp display

### Rich Text Editing

- **Text Formatting:**
  - Bold (Ctrl+B)
  - Italic (Ctrl+I)
  - Underline (Ctrl+U)
  - Strikethrough
- **Block Types:**
  - Heading 1 (H1)
  - Heading 2 (H2)
  - Heading 3 (H3)
  - Paragraph
- Formatting toolbar with active state indicators
- Multi-block selection and formatting support

### Page Management

- Automatic content flow - content automatically moves to the next page when the current page is full
- Smart page optimization - content automatically moves back to previous pages when space becomes available
- Manual page breaks - insert page breaks to force content onto a new page
- A4 page format with standard margins for document printing

### Editor Features

- Smooth editing experience with responsive performance
- Formatting toolbar with visual feedback for active formats
- Keyboard shortcuts for quick formatting (Ctrl+B, Ctrl+I, Ctrl+U)
- Multi-block selection and formatting support
- Browser tab title updates to match document title

### Storage

- All documents are automatically saved locally in your browser
- Changes are saved automatically as you type
- Documents persist across browser sessions - no data loss on refresh or browser restart
