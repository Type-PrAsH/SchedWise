
import React, { useState, useRef, useEffect } from 'react';
import { Message } from '../types';
import { geminiService } from '../services/gemini';

const ChatView: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const responseText = await geminiService.chatAssistant(input, {}, history);
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error(error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "System Error: Failed to communicate with neural engine.",
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full glass rounded-[3rem] overflow-hidden shadow-2xl border border-white/10">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 hide-scrollbar" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-8 opacity-40">
            <div className="w-20 h-20 rounded-[2.5rem] bg-primary/20 flex items-center justify-center animate-float shadow-lg shadow-primary/20">
              <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-black text-white">Neural Hub Open</h2>
              <p className="text-white/60 max-w-sm text-lg font-medium leading-relaxed">
                Connect with the SchedWise core logic. Describe your schedule shift or study roadblocks.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
            <div className={`max-w-[85%] md:max-w-[75%] p-6 rounded-[2.5rem] shadow-2xl ${
              msg.role === 'user' 
              ? 'bg-primary text-black font-bold rounded-tr-none' 
              : 'glass bg-white/5 text-white rounded-tl-none border border-white/10'
            }`}>
              <div className="prose prose-invert prose-sm max-w-none font-medium leading-relaxed">
                {msg.text}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="glass bg-white/5 p-6 rounded-[2.5rem] rounded-tl-none border border-white/10 flex items-center gap-4 animate-pulse">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce"></div>
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]"></div>
              </div>
              <span className="text-xs font-black uppercase tracking-[0.2em] text-white/30">SchedWise is processing...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="p-8 border-t border-white/10 bg-background/50">
        <div className="relative flex items-center gap-4 max-w-5xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Relay message to the intelligence unit..."
            className="flex-1 glass bg-white/5 border border-white/10 rounded-[2rem] px-8 py-5 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-white/10 transition-all text-lg font-medium shadow-inner"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="w-20 h-20 rounded-[2rem] bg-primary text-black flex items-center justify-center transition-all hover:scale-105 active:scale-90 disabled:opacity-30 disabled:scale-100 shadow-xl shadow-primary/30 group"
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatView;
