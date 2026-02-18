import { useState, useEffect, useCallback, useRef } from 'react';

type SpeechRecog = any;

interface SpeechRecognitionEventLike extends Event {
  results: SpeechRecognitionResultList & { isFinal?: boolean };
}

interface UseSpeechRecognitionOpts {
  lang?: string;                      // e.g., 'en-US' | 'sv-SE'
  wakeWord?: string | null;           // e.g., 'computer' to start capturing after keyword
  autoRestart?: boolean;              // restart when engine stops unexpectedly
  continuous?: boolean;               // keep listening until stop
  interimResults?: boolean;           // stream interim hypotheses
  debounceMs?: number;                // debounce interim updates
  commandPrefix?: string | null;      // say 'command' to avoid accidental command matches
  enablePunctuationWords?: boolean;   // map "comma", "question mark", etc.
}

interface UseSpeechRecognitionReturn {
  transcript: string;
  isListening: boolean;
  isSpeaking: boolean;
  hasRecognitionSupport: boolean;
  error?: string;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  updateTranscript: (t: string) => void;
}

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecog;
    SpeechRecognition?: SpeechRecog;
  }
}

const DEFAULT_OPTS: Required<UseSpeechRecognitionOpts> = {
  lang: 'en-US',
  wakeWord: null,
  autoRestart: true,
  continuous: true,
  interimResults: true,
  debounceMs: 120,
  commandPrefix: 'command', // say "command change X to Y"
  enablePunctuationWords: true,
};

const punctuationMap: Record<string, string> = {
  ' period': '.',
  ' full stop': '.',
  ' dot': '.',
  ' comma': ',',
  ' question mark': '?',
  ' exclamation mark': '!',
  ' exclamation point': '!',
  ' colon': ':',
  ' semicolon': ';',
  ' new line': '\n',
  ' newline': '\n',
  ' line break': '\n',
};

const sanitizePunctuationWords = (input: string) => {
  let out = ` ${input} `.replace(/\s+/g, ' ');
  for (const [k, v] of Object.entries(punctuationMap)) {
    const rx = new RegExp(`${k}(?=\\s|$)`, 'gi');
    out = out.replace(rx, v);
  }
  // tidy spaces around punctuation
  out = out
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/([.,!?;:])([^\s])/g, '$1 $2')
    .trim();
  // Capitalize first sentence char
  if (out.length) out = out[0].toUpperCase() + out.slice(1);
  return out;
};

const escapeReg = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const processVoiceCommands = (
  text: string,
  commandPrefix?: string | null,
): { processedText: string; shouldSubmit: boolean } => {
  // Only treat as commands if prefixed, unless prefix is null
  const source = commandPrefix
    ? text.replace(new RegExp(`\\b${escapeReg(commandPrefix)}\\s*`, 'i'), '')
    : text;

  let processedText = source;
  let shouldSubmit = false;

  // Debug logging
  if (text.toLowerCase().includes('click enter') || text.toLowerCase().includes('stop recording')) {
    console.log('🎤 Voice Command Detected:', { original: text, source, commandPrefix });
  }

  const commands = [
    {
      // change john to john smith
      pattern: /\b(?:change|update|replace)\s+(\w+(?:\s+\w+)*?)\s+to\s+(\w+(?:\s+\w+)*)/gi,
      handler: (oldText: string, newText: string, fullText: string) => {
        const rx = new RegExp(`\\b${escapeReg(oldText)}\\b`, 'gi');
        return fullText.replace(rx, newText);
      },
    },
    {
      // correct john to john smith
      pattern: /\b(?:correct)\s+(\w+(?:\s+\w+)*?)\s+to\s+(\w+(?:\s+\w+)*)/gi,
      handler: (oldText: string, newText: string, fullText: string) => {
        const rx = new RegExp(`\\b${escapeReg(oldText)}\\b`, 'gi');
        return fullText.replace(rx, newText);
      },
    },
    {
      // delete the word meeting / remove meeting
      pattern: /\b(?:delete|remove)(?:\s+the\s+word)?\s+(\w+(?:\s+\w+)*)/gi,
      handler: (wordToDelete: string, fullText: string) => {
        const rx = new RegExp(`\\b${escapeReg(wordToDelete)}\\b`, 'gi');
        return fullText.replace(rx, ' ').replace(/\s+/g, ' ').trim();
      },
    },
    {
      // stop recording / stop listening / pause recording
      pattern: /\b(?:stop\s+(?:recording|listening)|pause\s+recording)\b/gi,
      handler: (fullText: string) => {
        // Signal to stop listening but keep the text
        if (typeof window !== 'undefined' && (window as any)._stopRecordingCallback) {
          setTimeout(() => (window as any)._stopRecordingCallback(), 100);
        }
        return fullText; // Text already cleaned by the loop above
      },
    },
    {
      // click enter / press enter / submit
      pattern: /\b(?:(?:click|press)\s+enter|submit)\b/gi,
      handler: (fullText: string) => {
        shouldSubmit = true;
        // Signal to stop listening before submitting
        if (typeof window !== 'undefined' && (window as any)._stopRecordingCallback) {
          setTimeout(() => (window as any)._stopRecordingCallback(), 50);
        }
        return fullText; // Text already cleaned by the loop above
      },
    },
    {
      // repeat that | say that again | replace all | start over -> new content
      pattern: /\b(?:repeat\s+that|say\s+that\s+again|replace\s+all|start\s+over)\s+(.+)/gi,
      handler: (newContent: string) => newContent.trim(),
    },
    {
      // clear all | delete everything | start fresh | clear everything
      pattern: /\b(?:clear\s+all|delete\s+everything|start\s+fresh|clear\s+everything)\b/gi,
      handler: () => '',
    },
  ];

  for (const cmd of commands) {
    const matches = [...processedText.matchAll(cmd.pattern)];
    if (matches.length) {
      console.log('🎤 Command Match Found:', { pattern: cmd.pattern, matches, text: processedText });
      for (const m of matches) {
        // First remove the command from the text
        const textWithoutCommand = processedText.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
        const args = m.slice(1).filter(Boolean);
        // Then apply the command handler
        processedText = (cmd.handler as any)(...args, textWithoutCommand);
        console.log('🎤 Command Applied:', { originalMatch: m[0], newText: processedText, shouldSubmit });
      }
    }
  }

  return { processedText: processedText.trim(), shouldSubmit };
};

export const useSpeechRecognition = (
  onEnterCommand?: () => void,
  opts?: UseSpeechRecognitionOpts,
): UseSpeechRecognitionReturn => {
  const {
    lang,
    wakeWord,
    autoRestart,
    continuous,
    interimResults,
    debounceMs,
    commandPrefix,
    enablePunctuationWords,
  } = { ...DEFAULT_OPTS, ...opts };

  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef('');
  const lastResultIndexRef = useRef(0);
  const shouldBeListeningRef = useRef(false); // for auto-restart
  const wakeWordArmedRef = useRef(!!wakeWord);
  const interimTimerRef = useRef<number | null>(null);
  const endSilenceTimerRef = useRef<number | null>(null);

  const hasRecognitionSupport =
    typeof window !== 'undefined' &&
    (('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window));

  // Debounced setter for interim
  const setTranscriptDebounced = useCallback((value: string) => {
    if (interimTimerRef.current) {
      window.clearTimeout(interimTimerRef.current);
    }
    interimTimerRef.current = window.setTimeout(() => {
      setTranscript(value);
    }, debounceMs);
  }, [debounceMs]);

  // Warm-up mic permission early (improves first word truncation)
  useEffect(() => {
    if (!hasRecognitionSupport) return;
    navigator.mediaDevices?.getUserMedia?.({ audio: true }).catch(() => {
      // user may deny; we’ll surface via onerror later
    });
  }, [hasRecognitionSupport]);

  useEffect(() => {
    if (!hasRecognitionSupport) return;

    const SR = (window.SpeechRecognition || window.webkitSpeechRecognition) as any;
    const rec = new SR();
    recognitionRef.current = rec;

    rec.continuous = continuous;
    rec.interimResults = interimResults;
    rec.lang = lang;

    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setIsListening(true);
      setError(undefined);
    };

    rec.onspeechstart = () => {
      setIsSpeaking(true);
      if (endSilenceTimerRef.current) {
        window.clearTimeout(endSilenceTimerRef.current);
        endSilenceTimerRef.current = null;
      }
    };

    rec.onspeechend = () => {
      setIsSpeaking(false);
      // Give a small idle window so we don't cut off tail syllables
      if (endSilenceTimerRef.current) {
        window.clearTimeout(endSilenceTimerRef.current);
      }
      endSilenceTimerRef.current = window.setTimeout(() => {
        // no-op; keeping the session alive helps Chrome capture next phrase
      }, 250);
    };

    rec.onresult = (evt: SpeechRecognitionEventLike) => {
      let newFinal = '';
      let interim = '';

      for (let i = lastResultIndexRef.current; i < evt.results.length; i++) {
        const r = evt.results[i];
        if ((r as any).isFinal || (r as SpeechRecognitionResult).isFinal) {
          newFinal += r[0].transcript + ' ';
          lastResultIndexRef.current = i + 1;
        } else {
          interim += r[0].transcript;
        }
      }

      if (wakeWord && wakeWordArmedRef.current) {
        const all = (finalTranscriptRef.current + newFinal + interim).toLowerCase();
        if (all.includes(wakeWord.toLowerCase())) {
          wakeWordArmedRef.current = false; // disarm and start capturing normally
          // Strip everything until (and including) wake word
          const idx = all.indexOf(wakeWord.toLowerCase());
          const kept = (finalTranscriptRef.current + newFinal + interim).slice(idx + wakeWord.length);
          finalTranscriptRef.current = kept.trim() ? kept + ' ' : '';
          setTranscript(finalTranscriptRef.current.trim());
          return;
        } else {
          // still waiting for wake word – don't emit
          return;
        }
      }

      if (newFinal) {
        let combined = (finalTranscriptRef.current + newFinal).trim();

        if (enablePunctuationWords) {
          combined = sanitizePunctuationWords(combined);
        }

        // Process commands on final text
        const { processedText, shouldSubmit } = processVoiceCommands(combined, commandPrefix);
        finalTranscriptRef.current = processedText ? processedText + ' ' : '';

        setTranscript(finalTranscriptRef.current.trim());

        if (shouldSubmit && onEnterCommand) {
          // Small delay to ensure transcript is updated first
          setTimeout(() => onEnterCommand(), 100);
        }
      } else if (interim) {
        const current = (finalTranscriptRef.current + interim).trim();
        const maybePunct = enablePunctuationWords ? sanitizePunctuationWords(current) : current;
        
        // Check for commands in interim results for immediate response
        const { processedText, shouldSubmit } = processVoiceCommands(maybePunct, commandPrefix);
        
        if (shouldSubmit && onEnterCommand) {
          // Command detected in interim - execute immediately
          finalTranscriptRef.current = processedText ? processedText + ' ' : '';
          setTranscript(finalTranscriptRef.current.trim());
          setTimeout(() => onEnterCommand(), 100);
        } else if (processedText !== maybePunct) {
          // Other commands detected - apply immediately
          finalTranscriptRef.current = processedText ? processedText + ' ' : '';
          setTranscript(finalTranscriptRef.current.trim());
        } else {
          setTranscriptDebounced(maybePunct);
        }
      }
    };

    rec.onend = () => {
      setIsListening(false);
      setIsSpeaking(false);
      if (autoRestart && shouldBeListeningRef.current) {
        // Chrome often ends sessions after some silence; restart seamlessly
        try {
          rec.start();
        } catch {
          // throttle quick restarts
          setTimeout(() => {
            try { rec.start(); } catch { /* ignore */ }
          }, 250);
        }
      }
    };

    rec.onerror = (e: any) => {
      setError(`${e.error || 'error'}${e.message ? `: ${e.message}` : ''}`);
      setIsListening(false);
      setIsSpeaking(false);
      // Some errors (like 'no-speech'/'aborted') are recoverable; allow autoRestart to retry
    };

    return () => {
      try {
        rec.onstart = rec.onresult = rec.onend = rec.onerror = null;
        if (recognitionRef.current) recognitionRef.current.stop();
      } catch { /* ignore */ }
    };
  }, [
    hasRecognitionSupport,
    lang,
    continuous,
    interimResults,
    autoRestart,
    commandPrefix,
    enablePunctuationWords,
    setTranscriptDebounced,
    wakeWord,
  ]);

  const startListening = useCallback(() => {
    if (!hasRecognitionSupport) return;
    if (!recognitionRef.current) return;

    shouldBeListeningRef.current = true;
    wakeWordArmedRef.current = !!wakeWord;

    finalTranscriptRef.current = '';
    lastResultIndexRef.current = 0;
    setTranscript('');
    setError(undefined);

    try {
      recognitionRef.current.start();
    } catch {
      // If already started, ignore
    }
  }, [hasRecognitionSupport, wakeWord]);

  const stopListening = useCallback(() => {
    shouldBeListeningRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }
  }, []);

  const resetTranscript = useCallback(() => {
    finalTranscriptRef.current = '';
    lastResultIndexRef.current = 0;
    setTranscript('');
  }, []);

  const updateTranscript = useCallback((t: string) => {
    finalTranscriptRef.current = t ? t.trim() + ' ' : '';
    setTranscript(t.trim());
  }, []);

  return {
    transcript,
    isListening,
    isSpeaking,
    hasRecognitionSupport,
    error,
    startListening,
    stopListening,
    resetTranscript,
    updateTranscript,
  };
};
