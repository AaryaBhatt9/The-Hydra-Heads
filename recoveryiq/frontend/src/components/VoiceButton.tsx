import { useState } from 'react';

const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY as string;
const VOICE_ID = import.meta.env.VITE_ELEVENLABS_VOICE_ID as string;

export async function speakText(text: string): Promise<void> {
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );
    const blob = await response.blob();
    const audio = new Audio(URL.createObjectURL(blob));
    await audio.play();
    await new Promise(resolve => { audio.onended = resolve; });
  } catch (e) {
    console.error('ElevenLabs TTS error:', e);
  }
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEventType extends Event {
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((e: SpeechRecognitionEventType) => void) | null;
  onerror: (() => void) | null;
  start(): void;
}

interface WindowWithSpeech {
  SpeechRecognition?: new () => SpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
}

export function useSpeechInput() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');

  const startListening = () => {
    const win = window as unknown as WindowWithSpeech;
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SR) {
      alert('Speech recognition not supported. Use Chrome.');
      return;
    }
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onresult = (e: SpeechRecognitionEventType) => {
      setTranscript(e.results[0][0].transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.start();
  };

  return { listening, transcript, startListening };
}

interface Props {
  onTranscript: (text: string) => void;
  label?: string;
}

export default function VoiceButton({ onTranscript, label = 'Speak Answer' }: Props) {
  const { listening, transcript, startListening } = useSpeechInput();

  if (transcript) {
    onTranscript(transcript);
  }

  return (
    <button
      onClick={startListening}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition
        ${listening
          ? 'bg-red-50 border-red-300 text-red-700 animate-pulse'
          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
        }`}
    >
      <span>{listening ? '🎙 Listening...' : `🎙 ${label}`}</span>
    </button>
  );
}
