"use client";
import { Button } from "antd";
import { toast } from '@/hooks/use-toast';
import { Mic, MicOff } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useEffect, useRef } from "react";

interface SpeechRecognitionButtonProps {
  isAuthenticated: boolean;
  loading: boolean;
  onTranscriptUpdate: (transcript: string) => void;
  onEnterCommand: () => void;
  message: any;
  getCurrentUser: (openDialog?: boolean) => void;
  canChat?: boolean;
}

const SpeechRecognitionButton = ({
  isAuthenticated,
  loading,
  onTranscriptUpdate,
  onEnterCommand,
  message,
  getCurrentUser,
  canChat = true,
}: SpeechRecognitionButtonProps) => {
  const {
    transcript,
    isListening,
    isSpeaking,
    hasRecognitionSupport,
    error,
    startListening,
    stopListening,
    resetTranscript,
    updateTranscript,
  } = useSpeechRecognition(onEnterCommand, {
    commandPrefix: null,
    enablePunctuationWords: true,
    autoRestart: true,
    debounceMs: 50,
  });

  const handleAutomateRef = useRef<() => void>(() => {});
  handleAutomateRef.current = onEnterCommand;

  // Set up the stop recording callback for voice commands
  useEffect(() => {
    (window as any)._stopRecordingCallback = () => {
      stopListening();
    };
    
    return () => {
      delete (window as any)._stopRecordingCallback;
    };
  }, [stopListening]);

  // Update parent component when transcript changes
  useEffect(() => {
    if (transcript && transcript.trim()) {
      onTranscriptUpdate(transcript);
    }
  }, [transcript, onTranscriptUpdate]);

  const handleMicrophoneToggle = () => {
    if (!isAuthenticated) {
      toast.info("Please sign in to use voice input");
      getCurrentUser(true);
      return;
    }

    if (!hasRecognitionSupport) {
      toast.error("Error","Speech recognition is not supported in your browser");
      return;
    }

    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      startListening();
    }
  };

  if (!hasRecognitionSupport) {
    return null;
  }

  return (
    <>
      <Button
        style={{
          height: 32,
          width: 32,
          backgroundColor: isListening ? (isSpeaking ? '#52c41a' : '#1890ff') : 'transparent',
          borderColor: isListening ? (isSpeaking ? '#52c41a' : '#1890ff') : 'var(--border-default)',
        }}
        shape="round"
        type={isListening ? "primary" : "default"}
        icon={isListening ? <MicOff size={18} /> : <Mic size={18} />}
        disabled={(isAuthenticated && !canChat) || loading}
        onClick={handleMicrophoneToggle}
        className={isSpeaking ? "animate-pulse" : ""}
        title={
          (isAuthenticated && !canChat)
            ? "Voice input is disabled"
            : isListening
            ? (isSpeaking ? "🟢 Recording - Click to stop" : "🎤 Listening - Click to stop")
            : "🎤 Start voice input"
        }
      />
      {isListening && (
        <Button
          style={{ height: 32 }}
          size="small"
          type="text"
          onClick={() => {
            resetTranscript();
            onTranscriptUpdate('');
          }}
          className="text-gray-500 hover:text-red-500"
          title="Clear all text and start over"
        >
          🗑️
        </Button>
      )}
    </>
  );
};

export default SpeechRecognitionButton;
