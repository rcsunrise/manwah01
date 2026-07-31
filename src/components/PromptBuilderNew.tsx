import React from 'react';

export interface PromptBuilderProps {
  initialPrompt: string;
  onApply: (prompt: string) => void;
  onClose: () => void;
}

export const PromptBuilder: React.FC<PromptBuilderProps> = ({ initialPrompt, onApply, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white p-6 rounded-lg w-full max-w-2xl shadow-xl">
        <h2 className="text-xl font-bold mb-4">Prompt Builder</h2>
        <textarea 
          className="w-full h-40 p-2 border rounded-md mb-4"
          defaultValue={initialPrompt}
          id="prompt-textarea"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-md hover:bg-gray-50">Cancel</button>
          <button 
            onClick={() => onApply((document.getElementById('prompt-textarea') as HTMLTextAreaElement).value)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
