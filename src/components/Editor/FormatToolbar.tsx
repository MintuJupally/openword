import { Button } from 'antd';
import {
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  StrikethroughOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import styles from './FormatToolbar.module.css';

interface FormatToolbarProps {
  onFormat: (format: 'bold' | 'italic' | 'underline' | 'strikethrough') => void;
  activeFormats: Set<'bold' | 'italic' | 'underline' | 'strikethrough'>;
  onPageBreak?: () => void;
}

export function FormatToolbar({ onFormat, activeFormats, onPageBreak }: FormatToolbarProps) {
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
    </div>
  );
}
