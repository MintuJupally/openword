import { Button } from 'antd';
import {
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  StrikethroughOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import styles from './FormatToolbar.module.css';

type BlockTypeOption = 'h1' | 'h2' | 'h3' | 'paragraph';

interface FormatToolbarProps {
  onFormat: (format: 'bold' | 'italic' | 'underline' | 'strikethrough') => void;
  activeFormats: Set<'bold' | 'italic' | 'underline' | 'strikethrough'>;
  onPageBreak?: () => void;
  onBlockTypeChange?: (blockType: BlockTypeOption) => void;
}

export function FormatToolbar({ onFormat, activeFormats, onPageBreak, onBlockTypeChange }: FormatToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <Button
        type={activeFormats.has('bold') ? 'primary' : 'default'}
        icon={<BoldOutlined />}
        onClick={() => onFormat('bold')}
        title="Bold"
      />
      <Button
        type={activeFormats.has('italic') ? 'primary' : 'default'}
        icon={<ItalicOutlined />}
        onClick={() => onFormat('italic')}
        title="Italic"
      />
      <Button
        type={activeFormats.has('underline') ? 'primary' : 'default'}
        icon={<UnderlineOutlined />}
        onClick={() => onFormat('underline')}
        title="Underline"
      />
      <Button
        type={activeFormats.has('strikethrough') ? 'primary' : 'default'}
        icon={<StrikethroughOutlined />}
        onClick={() => onFormat('strikethrough')}
        title="Strikethrough"
      />
      <Button type="default" icon={<FileTextOutlined />} onClick={() => onPageBreak?.()} title="Page Break">
        Page Break
      </Button>
      <div style={{ width: '1px', height: '20px', background: '#d9d9d9', margin: '0 0.5rem' }} />
      <Button type="default" onClick={() => onBlockTypeChange?.('h1')} title="Heading 1">
        H1
      </Button>
      <Button type="default" onClick={() => onBlockTypeChange?.('h2')} title="Heading 2">
        H2
      </Button>
      <Button type="default" onClick={() => onBlockTypeChange?.('h3')} title="Heading 3">
        H3
      </Button>
      <Button type="default" onClick={() => onBlockTypeChange?.('paragraph')} title="Paragraph">
        P
      </Button>
    </div>
  );
}
