
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';

const LiveView: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [transcription, setTranscription] = useState<string[]>([]);
  const [volume, setVolume] = useState(0);
  
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Helper: Base64 Decoding
  const decodeBase64 = (base64: string) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };

  // Helper: PCM Decoding
  const decodeAudioData = async (data: Uint8Array, ctx: AudioContext) => {
    const dataInt16 = new Int16Array(data.buffer);
    const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < dataInt16.length; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
    }
    return buffer;
  };

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    setIsActive(false);
    setVolume(0);
  }, []);

  const startSession = async () => {
    try {
      const API_KEY = process.env.API_KEY || '';
      const ai = new GoogleGenAI({ apiKey: API_KEY });

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
          },
          systemInstruction: "You are SchedWise, a friendly and warm real-time AI companion. Be concise and natural in speech.",
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
              const input = e.inputBuffer.getChannelData(0);
              
              // Calculate volume for UI
              let sum = 0;
              for(let i=0; i<input.length; i++) sum += input[i]*input[i];
              setVolume(Math.sqrt(sum/input.length));

              const int16 = new Int16Array(input.length);
              for (let i = 0; i < input.length; i++) int16[i] = input[i] * 32768;
              
              const binary = '';
              const bytes = new Uint8Array(int16.buffer);
              let b64 = '';
              for (let i = 0; i < bytes.byteLength; i++) b64 += String.fromCharCode(bytes[i]);

              sessionPromise.then(session => {
                session.sendRealtimeInput({ 
                  media: { data: btoa(b64), mimeType: 'audio/pcm;rate=16000' } 
                });
              });
            };
            source.connect(processor);
            processor.connect(inputCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            // Handle Transcription
            if (msg.serverContent?.inputTranscription) {
               setTranscription(prev => [...prev.slice(-10), `You: ${msg.serverContent!.inputTranscription!.text}`]);
            }
            if (msg.serverContent?.outputTranscription) {
               setTranscription(prev => [...prev.slice(-10), `SchedWise: ${msg.serverContent!.outputTranscription!.text}`]);
            }

            // Handle Audio Output
            const audioB64 = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioB64 && audioContextRef.current) {
              const bytes = decodeBase64(audioB64);
              const buffer = await decodeAudioData(bytes, audioContextRef.current);
              
              const source = audioContextRef.current.createBufferSource();
              source.buffer = buffer;
              source.connect(audioContextRef.current.destination);
              
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioContextRef.current.currentTime);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
              source.onended = () => sourcesRef.current.delete(source);
            }

            if (msg.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => stopSession(),
          onerror: (e) => {
            console.error("Live Error", e);
            stopSession();
          }
        }
      });

      sessionRef.current = await sessionPromise;
      setIsActive(true);
    } catch (err) {
      console.error("Failed to start live session", err);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center space-y-8 py-12">
      <div className="relative">
        {/* Pulsing visualizer */}
        <div className={`w-64 h-64 rounded-full flex items-center justify-center transition-all duration-700 ${
          isActive ? 'bg-primary/20 scale-110 glow-primary' : 'bg-muted/30'
        }`}>
          <div className={`w-48 h-48 rounded-full border-4 transition-all duration-300 flex items-center justify-center ${
            isActive ? 'border-primary' : 'border-muted'
          }`} style={{ transform: `scale(${1 + volume * 2})` }}>
            <svg className={`w-24 h-24 ${isActive ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} fill="currentColor" viewBox="0 0 20 20">
               <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
        
        {isActive && (
          <div className="absolute inset-0 -z-10 bg-primary/10 rounded-full blur-3xl animate-pulse"></div>
        )}
      </div>

      <div className="text-center max-w-md">
        <h2 className="text-2xl font-bold text-white mb-2">{isActive ? 'SchedWise is listening' : 'Start a Conversation'}</h2>
        <p className="text-muted-foreground text-sm">Experience low-latency voice interaction with Gemini's most advanced multi-modal model.</p>
      </div>

      <button
        onClick={isActive ? stopSession : startSession}
        className={`px-12 py-4 rounded-full font-bold text-lg transition-all duration-300 shadow-xl ${
          isActive 
          ? 'bg-red-500/20 text-red-500 border border-red-500/30 hover:bg-red-500/30' 
          : 'bg-primary text-primary-foreground hover:scale-105 active:scale-95 shadow-primary/20'
        }`}
      >
        {isActive ? 'Disconnect' : 'Start Session'}
      </button>

      {/* Live Transcript */}
      <div className="w-full max-w-2xl bg-card/50 border border-border rounded-2xl p-6 h-48 overflow-y-auto glass flex flex-col-reverse hide-scrollbar">
        <div className="space-y-3">
          {transcription.length === 0 && <p className="text-muted-foreground text-center italic text-sm py-12">Conversational history will appear here...</p>}
          {transcription.map((line, i) => (
            <p key={i} className={`text-sm ${line.startsWith('You:') ? 'text-primary' : 'text-white'} font-medium`}>
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LiveView;
