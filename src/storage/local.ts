import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { Document } from '../models/document';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB('openword-db', 1, {
      upgrade(db) {
        const documentStore = db.createObjectStore('documents', {
          keyPath: 'id',
        });
        documentStore.createIndex('by-updatedAt', 'updatedAt');
      },
    });
  }
  return dbPromise;
}

/**
 * Saves a document to IndexedDB.
 * Updates the updatedAt timestamp to current UTC time (milliseconds since epoch).
 */
export async function saveDocument(doc: Document): Promise<void> {
  const db = await getDB();
  // Date.now() returns UTC milliseconds since epoch - stored as UTC
  doc.updatedAt = Date.now();
  await db.put('documents', doc);
}

export async function getDocument(docId: string): Promise<Document | undefined> {
  const db = await getDB();
  return await db.get('documents', docId);
}

export async function getAllDocuments(): Promise<Document[]> {
  const db = await getDB();
  return await db.getAll('documents');
}

export async function getRecentDocuments(limit: number = 10): Promise<Document[]> {
  const db = await getDB();
  const index = db.transaction('documents').store.index('by-updatedAt');
  const documents = await index.getAll();
  // Sort by updatedAt descending and limit
  return documents
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

export async function deleteDocument(docId: string): Promise<void> {
  const db = await getDB();
  await db.delete('documents', docId);
}

