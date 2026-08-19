import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import { WorkflowHeader } from '../../components/creative-canvas/WorkflowHeader';
import { CanvasWorkspace } from '../../components/creative-canvas/CanvasWorkspace';
import { AgentPanel } from '../../components/creative-canvas/AgentPanel';
import { BatchConfirmModal } from '../../components/creative-canvas/BatchConfirmModal';
import { SaveVersionModal } from '../../components/creative-canvas/SaveVersionModal';
import { VersionHistoryModal } from '../../components/creative-canvas/VersionHistoryModal';
import { NewCanvasModal } from '../../components/creative-canvas/NewCanvasModal';
import { AssetVersionModal } from '../../components/creative-canvas/AssetVersionModal';
import { GptImagePreviewModal } from '../../components/creative-canvas/GptImagePreviewModal';
import { LongImageLayoutEditor } from '../../components/creative-canvas/LongImageLayoutEditor';
import { useCreativeCanvasWorkspace } from '../../hooks/useCreativeCanvasWorkspace';

export default function CreativeCanvasPage() {
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const navigate = useNavigate();
  const [showNewCanvasModal, setShowNewCanvasModal] = React.useState(false);
  const [showLayoutEditor, setShowLayoutEditor] = React.useState(false);
  const [showAssetModal, setShowAssetModal] = React.useState(false);
  const [assetModalTarget, setAssetModalTarget] = React.useState<{
    nodeId: string;
    sceneKey: string;
    imageUrl: string;
  }>({
    nodeId: 'gen-img-node-1',
    sceneKey: 'scene-01',
    imageUrl: ''
  });

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    uploadState,
    errorMessage,
    messages,
    activeDna,
    showFullDnaDrawer,
    setShowFullDnaDrawer,
    handleUploadFile,
    addUserMessage,
    agentRun,
    isPlanGenerating,
    planError,
    selectedNodeId,
    selectedSceneIndex,
    handleGenerateNineGridPlan,
    handleReplanSingleScene,
    handleNodeClick,
    generatingScenes,
    uploadedBase64,
    setUploadedBase64,
    selectedModel,
    setSelectedModel,
    planAgentModel,
    setPlanAgentModel,
    planReasoningEffort,
    setPlanReasoningEffort,
    selectedResolution,
    setSelectedResolution,
    handleGenerateSceneImage,
    handleApproveSceneImage,
    handleRejectSceneImage,

    // C3B Batch Queue Hooks
    batchState,
    queueItems,
    showBatchConfirmModal,
    setShowBatchConfirmModal,
    batchConfirmInfo,
    handleTriggerBatchMissingModal,
    handleStartBatchGeneration,
    handlePauseBatch,
    handleResumeBatch,
    handleCancelBatch,
    handleRetryFailedBatch,

    // C4-Edit Selection & Node Manipulation Hooks
    selectAllNodes,
    clearSelection,
    deleteSelectedNodes,
    duplicateSelectedNodes,
    addCustomNode,

    // C4A-1 Persistence & Versioning Hooks
    saveStatus,
    lastSavedAt,
    currentRevisionNumber,
    showSaveVersionModal,
    setShowSaveVersionModal,
    showHistoryModal,
    setShowHistoryModal,
    handleSaveVersion,
    handleRestoreRevision,
    clearCanvasWorkspace,
    canvasId,

    // C4B-1 DNA Version & Linkage Hooks
    dnaCode,
    productDnaVersionCode,
    productDnaVersionId,
    dnaVersions,
    onSelectDnaVersion,
    onSelectSceneIndex,

    // G0-1 Agent Conversation Hooks
    currentConversation,
    conversationsList,
    isStreaming,
    streamError,
    handleSendMessageStream,
    handleStopGenerating,
    handleRetryMessage,
    handleCreateNewConversation,
    handleSelectConversation
  } = useCreativeCanvasWorkspace(workspaceId);

  // GPT Image 2 Preview Modal state & handlers
  const [showGptPreviewModal, setShowGptPreviewModal] = React.useState(false);
  const [gptPreviewParams, setGptPreviewParams] = React.useState<{
    screenIndex: number;
    reviewFeedback?: string;
    overrideModel?: string;
    overrideResolution?: '1K' | '2K' | '4K';
    screenTitle?: string;
    promptSuggestion?: string;
  }>({
    screenIndex: 1
  });

  const effectiveUploadedImageUrl = React.useMemo(() => {
    if (uploadedBase64) return uploadedBase64;
    const imgNode = nodes.find(
      n => n.id === 'img-node-1' || n.type === 'productImageNode' || n.type === 'productImage'
    );
    return (imgNode?.data?.imageUrl as string) || null;
  }, [uploadedBase64, nodes]);

  const handleTriggerGenerateSceneImage = React.useCallback(
    (
      screenIndex: number,
      reviewFeedback?: string,
      overrideModel?: string,
      overrideResolution?: '1K' | '2K' | '4K'
    ) => {
      const modelToUse = overrideModel || selectedModel || 'gemini-3.1-flash-image';
      if (modelToUse.includes('gpt-image')) {
        const screen = agentRun?.plan?.screens?.find(s => s.screenIndex === screenIndex);
        const sceneNode = nodes.find(
          n => n.id === `scene-plan-node-${screenIndex}` || n.data?.screenIndex === screenIndex
        );
        setGptPreviewParams({
          screenIndex,
          reviewFeedback,
          overrideModel,
          overrideResolution,
          screenTitle: screen?.screenTitle || (sceneNode?.data?.screenTitle as string) || `第 ${screenIndex} 屏`,
          promptSuggestion:
            screen?.promptSuggestion ||
            (sceneNode?.data?.promptSuggestion as string) ||
            (sceneNode?.data?.prompt as string) ||
            ''
        });
        setShowGptPreviewModal(true);
      } else {
        handleGenerateSceneImage(screenIndex, reviewFeedback, overrideModel, overrideResolution);
      }
    },
    [selectedModel, agentRun, nodes, handleGenerateSceneImage]
  );

  const handleOpenGptPreviewManual = React.useCallback(() => {
    const idx = selectedSceneIndex || 1;
    const screen = agentRun?.plan?.screens?.find(s => s.screenIndex === idx);
    const sceneNode = nodes.find(
      n => n.id === `scene-plan-node-${idx}` || n.data?.screenIndex === idx
    );
    setGptPreviewParams({
      screenIndex: idx,
      screenTitle: screen?.screenTitle || (sceneNode?.data?.screenTitle as string) || `第 ${idx} 屏`,
      promptSuggestion:
        screen?.promptSuggestion ||
        (sceneNode?.data?.promptSuggestion as string) ||
        (sceneNode?.data?.prompt as string) ||
        ''
    });
    setShowGptPreviewModal(true);
  }, [selectedSceneIndex, agentRun, nodes]);

  const handleConfirmGptPreview = React.useCallback(() => {
    setShowGptPreviewModal(false);
    if (gptPreviewParams.screenIndex) {
      handleGenerateSceneImage(
        gptPreviewParams.screenIndex,
        gptPreviewParams.reviewFeedback,
        gptPreviewParams.overrideModel,
        gptPreviewParams.overrideResolution
      );
    }
  }, [gptPreviewParams, handleGenerateSceneImage]);

  const handleCreateNewCanvas = () => {
    setShowNewCanvasModal(true);
  };

  const handleConfirmNewCanvas = async () => {
    const newId = await clearCanvasWorkspace();
    if (newId) {
      navigate(`/creative-canvas/${newId}`);
    }
  };

  const augmentedNodes = React.useMemo(() => {
    return nodes.map(node => {
      if (node.type === 'generatedImageNode' || node.type === 'generatedImage' || node.id.startsWith('gen-img-node-')) {
        return {
          ...node,
          data: {
            ...node.data,
            onOpenAssetVersions: () => {
              const idx = node.data?.sceneIndex || 1;
              const key = `scene-${String(idx).padStart(2, '0')}`;
              setAssetModalTarget({
                nodeId: node.id,
                sceneKey: key,
                imageUrl: (node.data?.imageUrl as string) || ''
              });
              setShowAssetModal(true);
            }
          }
        };
      }
      return node;
    });
  }, [nodes]);

  const productionImagesMap = React.useMemo(() => {
    const map: Record<string, {
      imageUrl: string;
      width: number;
      height: number;
      aspectRatio?: string;
      assetVersionId?: string;
      subjectBounds?: any;
    }> = {};

    nodes.forEach(node => {
      if (node.type === 'generatedImage' || node.type === 'generatedImageNode' || node.id.startsWith('gen-img-node-')) {
        const d = node.data as any;
        if (d) {
          const sIdx = Number(d.sceneIndex) || 1;
          const sceneKey = `scene-${String(sIdx).padStart(2, '0')}`;
          const dims = typeof d.dimensions === 'string' ? d.dimensions.split('x') : [];
          const w = d.sourceWidth || (dims.length === 2 ? parseInt(dims[0], 10) : 1920);
          const h = d.sourceHeight || (dims.length === 2 ? parseInt(dims[1], 10) : 1080);
          map[sceneKey] = {
            imageUrl: d.imageUrl || '',
            width: w,
            height: h,
            aspectRatio: d.sourceAspectRatio || d.aspectRatio,
            assetVersionId: d.assetVersionId,
            subjectBounds: d.subjectBounds || null
          };
        }
      }
    });
    return map;
  }, [nodes]);

  return (
    <div className="w-screen h-screen h-[100dvh] flex flex-col bg-[#FAF8F5] overflow-hidden fixed inset-0 z-50">
      <WorkflowHeader
        workspaceName={workspaceId ? `企划空间 #${workspaceId}` : '新建立体视觉企划案'}
        saveStatus={saveStatus}
        lastSavedAt={lastSavedAt}
        currentRevisionNumber={currentRevisionNumber}
        dnaCode={dnaCode}
        productDnaVersionCode={productDnaVersionCode}
        productDnaVersionId={productDnaVersionId}
        onViewDnaVersion={() => setShowFullDnaDrawer(true)}
        onOpenSaveModal={() => setShowSaveVersionModal(true)}
        onOpenHistoryModal={() => setShowHistoryModal(true)}
        onOpenLayoutEditor={() => setShowLayoutEditor(true)}
        onNewCanvas={handleCreateNewCanvas}
      />
      <div className="flex-1 flex w-full h-[calc(100dvh-3.5rem)] overflow-hidden relative">
        <ReactFlowProvider>
          <div className="flex-1 relative h-full overflow-hidden">
            <CanvasWorkspace
              workspaceId={workspaceId}
              nodes={augmentedNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              selectedNodeId={selectedNodeId}
              onSelectAll={selectAllNodes}
              onClearSelection={clearSelection}
              onDeleteSelected={deleteSelectedNodes}
              onDuplicateSelected={duplicateSelectedNodes}
              onAddCustomNode={addCustomNode}
            />
          </div>
          <AgentPanel
            messages={messages}
            uploadState={uploadState}
            errorMessage={errorMessage}
            activeDna={activeDna}
            dnaCode={dnaCode}
            productDnaVersionCode={productDnaVersionCode}
            productDnaVersionId={productDnaVersionId}
            dnaVersions={dnaVersions}
            onSelectDnaVersion={onSelectDnaVersion}
            showFullDnaDrawer={showFullDnaDrawer}
            setShowFullDnaDrawer={setShowFullDnaDrawer}
            onUploadFile={handleUploadFile}
            onSendMessage={handleSendMessageStream}
            currentConversation={currentConversation}
            conversationsList={conversationsList}
            isStreaming={isStreaming}
            streamError={streamError}
            onStopGenerating={handleStopGenerating}
            onRetryMessage={handleRetryMessage}
            onCreateNewConversation={handleCreateNewConversation}
            onSelectConversation={handleSelectConversation}
            agentRun={agentRun}
            isPlanGenerating={isPlanGenerating}
            planError={planError}
            selectedNodeId={selectedNodeId}
            selectedSceneIndex={selectedSceneIndex}
            onSelectSceneIndex={onSelectSceneIndex}
            onGenerateNineGridPlan={handleGenerateNineGridPlan}
            onReplanSingleScene={handleReplanSingleScene}
            planAgentModel={planAgentModel}
            setPlanAgentModel={setPlanAgentModel}
            planReasoningEffort={planReasoningEffort}
            setPlanReasoningEffort={setPlanReasoningEffort}
            generatingScenes={generatingScenes}
            nodes={nodes}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            selectedResolution={selectedResolution}
            setSelectedResolution={setSelectedResolution}
            onGenerateSceneImage={handleTriggerGenerateSceneImage}
            onPreviewGptImage={handleOpenGptPreviewManual}
            onApproveSceneImage={handleApproveSceneImage}
            onRejectSceneImage={handleRejectSceneImage}

            // C3B Batch Queue Props
            batchState={batchState}
            queueItems={queueItems}
            onTriggerBatchMissingModal={handleTriggerBatchMissingModal}
            onPauseBatch={handlePauseBatch}
            onResumeBatch={handleResumeBatch}
            onCancelBatch={handleCancelBatch}
            onRetryFailedBatch={handleRetryFailedBatch}

            // C4B Copy Workspace Props
            canvasId={canvasId || workspaceId || 'default-canvas'}
            projectId={workspaceId || 'default-project'}
          />
        </ReactFlowProvider>

        {/* C3B Batch Generation Confirmation Modal */}
        <BatchConfirmModal
          isOpen={showBatchConfirmModal}
          onClose={() => setShowBatchConfirmModal(false)}
          onConfirm={handleStartBatchGeneration}
          info={batchConfirmInfo}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          selectedResolution={selectedResolution}
          setSelectedResolution={setSelectedResolution}
        />

        {/* New Canvas Confirmation Modal */}
        <NewCanvasModal
          isOpen={showNewCanvasModal}
          onClose={() => setShowNewCanvasModal(false)}
          onConfirm={handleConfirmNewCanvas}
        />

        {/* C4A-1 Save Version Snapshot Modal */}
        <SaveVersionModal
          isOpen={showSaveVersionModal}
          onClose={() => setShowSaveVersionModal(false)}
          onSave={handleSaveVersion}
          currentRevisionNumber={currentRevisionNumber}
        />

        {/* C4A-1 Revision History Modal */}
        <VersionHistoryModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          canvasId={canvasId}
          onRestoreRevision={handleRestoreRevision}
        />

        {/* C4A-2 Scene Asset SKU & Version Modal */}
        <AssetVersionModal
          isOpen={showAssetModal}
          onClose={() => setShowAssetModal(false)}
          canvasId={canvasId}
          projectId="proj_c4a2_default"
          sceneKey={assetModalTarget.sceneKey}
          nodeId={assetModalTarget.nodeId}
          currentImageUrl={assetModalTarget.imageUrl}
          onVersionSwitched={(skuId, versionId, previewUrl, versionCode) => {
            // Update local node state
            const targetIndex = nodes.findIndex(n => n.id === assetModalTarget.nodeId);
            if (targetIndex !== -1) {
              const updated = [...nodes];
              updated[targetIndex] = {
                ...updated[targetIndex],
                data: {
                  ...updated[targetIndex].data,
                  assetSkuId: skuId,
                  assetVersionId: versionId,
                  assetVersionCode: versionCode,
                  imageUrl: previewUrl
                }
              };
            }
          }}
        />

        {/* GPT-Image-2 Uploaded Reference Preview & Confirmation Modal */}
        <GptImagePreviewModal
          isOpen={showGptPreviewModal}
          onClose={() => setShowGptPreviewModal(false)}
          onConfirm={handleConfirmGptPreview}
          uploadedImageUrl={effectiveUploadedImageUrl}
          onUploadNewImage={(b64) => setUploadedBase64(b64)}
          screenIndex={gptPreviewParams.screenIndex}
          screenTitle={gptPreviewParams.screenTitle}
          promptSuggestion={gptPreviewParams.promptSuggestion}
          selectedModel={selectedModel}
          selectedResolution={selectedResolution}
        />

        {/* C4B-4-R2 Nine-Screen Mixed Aspect Ratio Long Image Layout Editor */}
        {showLayoutEditor && (
          <LongImageLayoutEditor
            canvasId={canvasId || workspaceId || 'default-canvas'}
            projectId={workspaceId || 'proj_c4b4_default'}
            productionImages={productionImagesMap}
            onClose={() => setShowLayoutEditor(false)}
          />
        )}
      </div>
    </div>
  );
}
