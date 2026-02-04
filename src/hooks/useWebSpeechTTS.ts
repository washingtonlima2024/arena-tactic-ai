import { useState, useCallback, useEffect, useRef } from 'react';

interface Voice {
  name: string;
  lang: string;
  voiceURI: string;
  default: boolean;
}

interface UseWebSpeechTTSReturn {
  speak: (text: string) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  isSpeaking: boolean;
  isPaused: boolean;
  isSupported: boolean;
  voices: Voice[];
  selectedVoice: Voice | null;
  setSelectedVoice: (voice: Voice | null) => void;
  rate: number;
  setRate: (rate: number) => void;
  pitch: number;
  setPitch: (pitch: number) => void;
  progress: number;
}

export function useWebSpeechTTS(): UseWebSpeechTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [progress, setProgress] = useState(0);
  
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const textLengthRef = useRef(0);
  
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Load available voices
  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      const availableVoices = speechSynthesis.getVoices();
      const mappedVoices: Voice[] = availableVoices.map(v => ({
        name: v.name,
        lang: v.lang,
        voiceURI: v.voiceURI,
        default: v.default
      }));
      
      setVoices(mappedVoices);
      
      // Try to select a Portuguese voice by default
      const ptVoice = mappedVoices.find(v => 
        v.lang.startsWith('pt') || v.lang.includes('BR') || v.lang.includes('PT')
      );
      if (ptVoice && !selectedVoice) {
        setSelectedVoice(ptVoice);
      } else if (mappedVoices.length > 0 && !selectedVoice) {
        setSelectedVoice(mappedVoices.find(v => v.default) || mappedVoices[0]);
      }
    };

    // Load voices immediately and on voiceschanged event
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);

    return () => {
      speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, [isSupported, selectedVoice]);

  const speak = useCallback((text: string) => {
    if (!isSupported || !text) return;

    // Stop any current speech
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;
    textLengthRef.current = text.length;

    // Set voice if selected
    if (selectedVoice) {
      const synVoice = speechSynthesis.getVoices().find(v => v.voiceURI === selectedVoice.voiceURI);
      if (synVoice) {
        utterance.voice = synVoice;
      }
    }

    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.lang = selectedVoice?.lang || 'pt-BR';

    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsPaused(false);
      setProgress(0);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      setProgress(100);
    };

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event.error);
      setIsSpeaking(false);
      setIsPaused(false);
    };

    utterance.onpause = () => {
      setIsPaused(true);
    };

    utterance.onresume = () => {
      setIsPaused(false);
    };

    // Track progress via boundary events
    utterance.onboundary = (event) => {
      if (textLengthRef.current > 0) {
        const progressPercent = (event.charIndex / textLengthRef.current) * 100;
        setProgress(Math.min(progressPercent, 100));
      }
    };

    speechSynthesis.speak(utterance);
  }, [isSupported, selectedVoice, rate, pitch]);

  const stop = useCallback(() => {
    if (!isSupported) return;
    speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
    setProgress(0);
  }, [isSupported]);

  const pause = useCallback(() => {
    if (!isSupported) return;
    speechSynthesis.pause();
    setIsPaused(true);
  }, [isSupported]);

  const resume = useCallback(() => {
    if (!isSupported) return;
    speechSynthesis.resume();
    setIsPaused(false);
  }, [isSupported]);

  return {
    speak,
    stop,
    pause,
    resume,
    isSpeaking,
    isPaused,
    isSupported,
    voices,
    selectedVoice,
    setSelectedVoice,
    rate,
    setRate,
    pitch,
    setPitch,
    progress
  };
}
