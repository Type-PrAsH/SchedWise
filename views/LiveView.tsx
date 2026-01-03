
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
              
              let binary = '';
              const bytes = new Uint8Array(int16.buffer);
              for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);

              sessionPromise.then(session => {
                session.sendRealtimeInput({ 
                  media: { data: btoa(binary), mimeType: 'audio/pcm;rate=16000' } 
                });
              });
            };
            source.connect(processor);
            processor.connect(inputCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.inputTranscription) {
               setTranscription(prev => [...prev.slice(-15), `You: ${msg.serverContent!.inputTranscription!.text}`]);
            }
            if (msg.serverContent?.outputTranscription) {
               setTranscription(prev => [...prev.slice(-15), `SchedWise: ${msg.serverContent!.outputTranscription!.text}`]);
            }

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
    <div className="h-full flex flex-col items-center justify-center space-y-12 py-12">
      <div className="relative">
        {/* Pulsing visualizer */}
        <div className={`w-80 h-80 rounded-full flex items-center justify-center transition-all duration-700 shadow-2xl ${
          isActive ? 'bg-primary/20 scale-110 shadow-primary/20' : 'bg-white/5 border border-white/5'
        }`}>
          <div className={`w-64 h-64 rounded-full border-4 transition-all duration-300 flex items-center justify-center shadow-inner ${
            isActive ? 'border-primary' : 'border-white/10'
          }`} style={{ transform: `scale(${1 + volume * 2})` }}>
            <svg className={`w-32 h-32 transition-all ${isActive ? 'text-primary' : 'text-white/20'}`} fill="currentColor" viewBox="0 0 20 20">
               <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>

      <div className="text-center max-w-md space-y-4">
        <h2 className="text-4xl font-black text-white tracking-tight">{isActive ? 'SchedWise Listening' : 'Voice Interaction'}</h2>
        <p className="text-muted-foreground text-lg font-medium leading-relaxed">Low-latency neural voice protocol. Speak naturally to recalibrate your planner on the fly.</p>
      </div>

      <button
        onClick={isActive ? stopSession : startSession}
        className={`px-14 py-6 rounded-[2rem] font-black text-xl transition-all duration-500 shadow-2xl active:scale-95 ${
          isActive 
          ? 'bg-red-500/10 text-red-500 border-2 border-red-500/30 hover:bg-red-500 hover:text-white' 
          : 'bg-primary text-black hover:scale-105 shadow-primary/30'
        }`}
      >
        {isActive ? 'Terminate Link' : 'Establish Vocal Link'}
      </button>

      {/* Live Transcript */}
      <div className="w-full max-w-3xl glass-strong bg-white/[0.02] border border-white/10 rounded-[2.5rem] p-10 h-64 overflow-y-auto flex flex-col-reverse hide-scrollbar shadow-2xl relative">
        <div className="space-y-4 relative z-10">
          {transcription.length === 0 && <div className="py-12 text-center space-y-3 opacity-20"><div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-2"><svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg></div><p className="text-white font-black uppercase tracking-[0.2em] text-xs">Vocal Buffer Empty</p></div>}
          {transcription.map((line, i) => (
            <div key={i} className={`flex gap-3 items-start animate-in fade-in slide-in-from-bottom-1`}>
              <span className={`text-[10px] font-black uppercase tracking-widest mt-1.5 shrink-0 ${line.startsWith('You:') ? 'text-primary' : 'text-accent'}`}>{line.split(':')[0]}</span>
              <p className={`text-base font-medium leading-relaxed ${line.startsWith('You:') ? 'text-white/80' : 'text-white'}`}>
                {line.split(':').slice(1).join(':').trim()}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LiveView;
