import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Button, Typography, List, Empty, Card, Spin } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { createEmptyDocument } from '../../models/document';
import { saveDocument, getRecentDocuments } from '../../storage/local';
import { formatUTCTimestampForDisplay } from '../../utils/date';
import styles from './index.module.css';

const { Title, Text } = Typography;

function Home() {
  const navigate = useNavigate();
  const [recentDocuments, setRecentDocuments] = useState<
    Array<{ id: string; title: string; lastModified: number }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecentDocuments();
  }, []);

  const loadRecentDocuments = async () => {
    try {
      const docs = await getRecentDocuments(10);
      setRecentDocuments(
        docs.map((doc) => ({
          id: doc.id,
          title: doc.title,
          // Store UTC timestamp (will be converted to local time when displaying)
          lastModified: doc.updatedAt,
        }))
      );
    } catch (error) {
      console.error('Failed to load recent documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewDocument = async () => {
    try {
      const docId = uuidv4();
      const newDoc = createEmptyDocument(docId);
      await saveDocument(newDoc);
      navigate(`/document/${docId}`);
    } catch (error) {
      console.error('Failed to create document:', error);
      // TODO: Show error message to user
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <Title level={1}>OpenWord</Title>
        <Text type="secondary" className={styles.subtitle}>
          Word-style text editor for the web
        </Text>

        <Button
          type="primary"
          size="large"
          icon={<FileTextOutlined />}
          onClick={handleCreateNewDocument}
          className={styles.createButton}
        >
          Create New Document
        </Button>

        <Card className={styles.recentDocuments} title="Recent Documents">
          {loading ? (
            <Spin />
          ) : recentDocuments.length === 0 ? (
            <Empty description="No recent documents" />
          ) : (
            <List
              dataSource={recentDocuments}
              renderItem={(doc) => (
                <List.Item
                  className={styles.documentItem}
                  onClick={() => navigate(`/document/${doc.id}`)}
                >
                  <List.Item.Meta
                    title={doc.title}
                    description={formatUTCTimestampForDisplay(doc.lastModified, {
                      second: undefined, // Don't show seconds in list view
                    })}
                  />
                </List.Item>
              )}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

export default Home;

