import React, { useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useOnViewportChange,
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { WelcomeNode } from './WelcomeNode';
import { ProductImageNode } from './ProductImageNode';
import { ProductDnaNode } from './ProductDnaNode';
import { NineGridPlanNode } from './NineGridPlanNode';
import { ScenePlanNode } from './ScenePlanNode';
import { ImageGenerationNode } from './ImageGenerationNode';
import { GeneratedImageNode } from './GeneratedImageNode';
import { CanvasToolbar } from './CanvasToolbar';

interface CanvasWorkspaceProps {
  workspaceId?: string;
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
}

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onNodeClick
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const nodeTypes = useMemo(
    () => ({
      welcomeNode: WelcomeNode,
      productImageNode: ProductImageNode,
      productDnaNode: ProductDnaNode,
      nineGridPlanNode: NineGridPlanNode,
      scenePlanNode: ScenePlanNode,
      imageGenerationNode: ImageGenerationNode,
      generatedImageNode: GeneratedImageNode,
      welcome: WelcomeNode,
      productImage: ProductImageNode,
      productDna: ProductDnaNode,
      nineGridPlan: NineGridPlanNode,
      scenePlan: ScenePlanNode,
      imageGeneration: ImageGenerationNode,
      generatedImage: GeneratedImageNode
    }),
    []
  );

  // Track viewport changes for zoom level display
  useOnViewportChange({
    onChange: useCallback((viewport: { zoom: number }) => {
      setZoomLevel(viewport.zoom);
    }, [])
  });

  return (
    <div className="relative w-full h-full bg-[#FAF8F5] overflow-hidden select-none">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2.5}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        panOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        onNodeClick={onNodeClick}
        className="w-full h-full"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.5}
          color="#E5E0D8"
          className="bg-[#FAF8F5]"
        />
        <CanvasToolbar zoomLevel={zoomLevel} />
      </ReactFlow>
    </div>
  );
};
