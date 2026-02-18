"use client";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

interface SpeechRecognitionStatusProps {
  onEnterCommand: () => void;
}

const SpeechRecognitionStatus = ({ onEnterCommand }: SpeechRecognitionStatusProps) => {
  const {
    isListening,
    isSpeaking,
    hasRecognitionSupport,
    error,
    startListening,
    stopListening,
  } = useSpeechRecognition(onEnterCommand, {
    commandPrefix: null,
    enablePunctuationWords: true,
    autoRestart: true,
    debounceMs: 50,
  });

  if (!hasRecognitionSupport || (!isListening && !error)) {
    return null;
  }

  return (
    <div className="text-xs mt-1 space-y-1">
      {isListening && (
        <div className="flex items-center gap-2">
          {isSpeaking ? (
            <div className="flex items-center gap-1 text-green-600">
              <span className="animate-pulse text-lg">🟢</span>
              <span className="font-medium">Recording your voice...</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-blue-500">
              <span className="animate-pulse">🎤</span>
              <span>Ready to listen - start speaking or type to edit</span>
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-1 text-red-500">
          <span>❌</span>
          <span>Speech error: {error}</span>
          <button 
            onClick={() => {
              stopListening();
              setTimeout(() => startListening(), 500);
            }}
            className="ml-2 text-blue-500 underline hover:text-blue-700"
          >
            Retry
          </button>
        </div>
      )}
      {isListening && !error && (
        <div className="text-xs text-gray-500 pl-6 space-y-1">
          <div><strong>Quick commands:</strong></div>
          <div>• "stop recording" - Stop listening but keep text</div>
          <div>• "start over [new text]" - Replace everything</div>
          <div>• "change [word] to [new word]" - Fix specific words</div>
          <div>• "clear all" - Delete everything</div>
          <div>• "click enter" - Submit form</div>
        </div>
      )}
    </div>
  );
};

export default SpeechRecognitionStatus;
