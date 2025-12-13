import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { Typography, Spin, Alert, Button, Card } from 'antd';
import { ArrowLeftOutlined, HomeOutlined } from '@ant-design/icons';
import { getDocument, saveDocument } from '../../storage/local';
import type { Document } from '../../models/document';
import { formatUTCTimestampForDisplay } from '../../utils/date';
import { Editor } from '../../components/Editor';
import styles from './index.module.css';

const { Text } = Typography;

function DocumentPage() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();

  const documentRef = useRef<Document | null>(null);

  const [document, setDocument] = useState<Document | null>(null);

  const [documentTitle, setDocumentTitle] = useState('');
  const [documentUpdatedAt, setDocumentUpdatedAt] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (docId) {
      loadDocument(docId);
    }
  }, [docId]);

  useEffect(() => {
    if (document) {
      setDocumentTitle(document.title);
      setDocumentUpdatedAt(document.updatedAt);

      // Update titleValue if not currently editing
      if (!isEditingTitle) {
        setTitleValue(document.title);
      }

      // Save document with debounce
      if (documentRef.current) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }

        setSaving(true);
        saveTimeoutRef.current = setTimeout(async () => {
          try {
            await saveDocument(document);
            setSaving(false);
          } catch (err) {
            console.error('Failed to save document:', err);
            setSaving(false);
          }
        }, 500);
      }

      documentRef.current = document;
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [document, isEditingTitle]);

  const loadDocument = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const doc = await getDocument(id);
      if (!doc) {
        setError(`Document with ID "${id}" does not exist.`);
        return;
      }
      setDocument(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  // Focus title input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleTitleClick = () => {
    setTitleValue(documentTitle);
    setIsEditingTitle(true);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitleValue(e.target.value);
  };

  const handleTitleSave = async () => {
    if (!document || !docId) return;

    const trimmedTitle = titleValue.trim() || 'Untitled Document';
    setIsEditingTitle(false);

    // Only update if title actually changed
    if (trimmedTitle !== document.title) {
      // Update document title
      const updatedDoc = { ...document, title: trimmedTitle, updatedAt: Date.now() };
      setDocument(updatedDoc);
    } else {
      // Reset titleValue to current document title if no change
      setTitleValue(document.title);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setTitleValue(documentTitle);
      setIsEditingTitle(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <Card>
            <Spin size="large" />
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <Card>
            <Alert
              title="Error"
              description={error}
              type="error"
              showIcon
              action={
                <Button icon={<HomeOutlined />} onClick={() => navigate('/')}>
                  Go Home
                </Button>
              }
            />
          </Card>
        </div>
      </div>
    );
  }

  if (!document) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} />
        <div className={styles.headerContent}>
          <div className={styles.headerTitle}>
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={titleValue}
                onChange={handleTitleChange}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                className={styles.headerTitleInput}
              />
            ) : (
              <Text className={styles.headerTitleText} onClick={handleTitleClick} style={{ cursor: 'pointer' }}>
                {documentTitle}
              </Text>
            )}
          </div>

          <div className={styles.headerActions}>
            {saving && <Text type="secondary">Saving...</Text>}
            {documentUpdatedAt && (
              <Text type="secondary" className={styles.lastUpdated}>
                Last updated:{' '}
                {formatUTCTimestampForDisplay(documentUpdatedAt, {
                  second: undefined,
                })}
              </Text>
            )}
          </div>
        </div>
      </div>
      <div className={styles.editorContainer}>
        <Editor
          document={document}
          onDocumentChange={(doc) => {
            setDocument(doc);
          }}
        />
      </div>
    </div>
  );
}

export default DocumentPage;
