import React from 'react';
import { TypographyWorkspacePanel } from './TypographyWorkspacePanel';

export interface TypographyEditorPanelProps {
  projectId: string;
  canvasId: string;
  sceneIndex: number;
  productDnaVersionId?: string;
  assetVersionId?: string;
}

export const TypographyEditorPanel: React.FC<TypographyEditorPanelProps> = (props) => {
  return <TypographyWorkspacePanel {...props} />;
};

export default TypographyEditorPanel;
