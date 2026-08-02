import React from 'react';
import { useParams } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import { WorkflowHeader } from '../../components/creative-canvas/WorkflowHeader';
import { CanvasWorkspace } from '../../components/creative-canvas/CanvasWorkspace';
import { AgentPanel } from '../../components/creative-canvas/AgentPanel';
import { BatchConfirmModal } from '../../components/creative-canvas/BatchConfirmModal';
import { SaveVersionModal } from '../../components/creative-canvas/SaveVersionModal';
import { VersionHistoryModal } from '../../components/creative-canvas/VersionHistoryModal';
import { useCreativeCanvasWorkspace } from '../../hooks/useCreativeCanvasWorkspace';

export default function CreativeCanvasPage() {
  const { workspaceId } = useParams<{ workspaceId?: string }>();

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
    canvasId
  } = useCreativeCanvasWorkspace(workspaceId);

  return (
    <div className="w-screen h-screen h-[100dvh] flex flex-col bg-[#FAF8F5] overflow-hidden fixed inset-0 z-50">
      <WorkflowHeader
        workspaceName={workspaceId ? `企划空间 #${workspaceId}` : '新建立体视觉企划案'}
        saveStatus={saveStatus}
        lastSavedAt={lastSavedAt}
        currentRevisionNumber={currentRevisionNumber}
        onOpenSaveModal={() => setShowSaveVersionModal(true)}
        onOpenHistoryModal={() => setShowHistoryModal(true)}
      />
      <div className="flex-1 flex w-full h-[calc(100dvh-3.5rem)] overflow-hidden relative">
        <ReactFlowProvider>
          <div className="flex-1 relative h-full overflow-hidden">
            <CanvasWorkspace
              workspaceId={workspaceId}
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
            />
          </div>
          <AgentPanel
            messages={messages}
            uploadState={uploadState}
            errorMessage={errorMessage}
            activeDna={activeDna}
            showFullDnaDrawer={showFullDnaDrawer}
            setShowFullDnaDrawer={setShowFullDnaDrawer}
            onUploadFile={handleUploadFile}
            onSendMessage={addUserMessage}
            agentRun={agentRun}
            isPlanGenerating={isPlanGenerating}
            planError={planError}
            selectedNodeId={selectedNodeId}
            selectedSceneIndex={selectedSceneIndex}
            onGenerateNineGridPlan={handleGenerateNineGridPlan}
            onReplanSingleScene={handleReplanSingleScene}
            generatingScenes={generatingScenes}
            nodes={nodes}
            onGenerateSceneImage={handleGenerateSceneImage}
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
          />
        </ReactFlowProvider>

        {/* C3B Batch Generation Confirmation Modal */}
        <BatchConfirmModal
          isOpen={showBatchConfirmModal}
          onClose={() => setShowBatchConfirmModal(false)}
          onConfirm={handleStartBatchGeneration}
          info={batchConfirmInfo}
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
      </div>
    </div>
  );
}
