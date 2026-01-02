
import React, { useState } from 'react';
import { GeneratedAsset } from '../types';
import { geminiService } from '../services/gemini';

// Fix: Removed the local 'declare global' block for aistudio to avoid conflicts 
// with the pre-defined AIStudio type in the execution context.

const VideoView: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [videos, setVideos] = useState<GeneratedAsset[]>([]);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    // MANDATORY: Check for API key selection when using Veo models.
    // Use type casting to access the pre-configured window.aistudio methods.
    const aistudio = (window as any).aistudio;
    if (aistudio) {
      const hasKey = await aistudio.hasSelectedApiKey();
      if (!hasKey) {
        // Open dialog if no key is selected
        await aistudio.openSelectKey();
        // Assume success after opening dialog as per race condition mitigation guidelines
      }
    }

    setIsGenerating(true);
    setStatus('Contacting GPU cluster...');
    
    try {
      const videoUrl = await geminiService.generateVideo(prompt, (msg) => setStatus(msg));
      const newVideo: GeneratedAsset = {
        id: Date.now().toString(),
        type: 'video',
        url: videoUrl,
        prompt: prompt,
        timestamp: Date.now()
      };
      setVideos(prev => [newVideo, ...prev]);
      setPrompt('');
    } catch (error: any) {
      console.error(error);
      // Fix: If the request fails with "Requested entity was not found.", 
      // reset key selection state by prompting the user again.
      if (error?.message?.includes("Requested entity was not found.")) {
        setStatus('Billing error. Please re-select a paid API key.');
        const aistudio = (window as any).aistudio;
        if (aistudio) await aistudio.openSelectKey();
      } else {
        setStatus('Generation failed. Ensure you have selected a billing-enabled key.');
      }
      setTimeout(() => setStatus(''), 5000);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="glass p-8 rounded-3xl border border-accent/20 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-64 h-64 bg-accent/10 blur-[80px] -ml-32 -mt-32"></div>
        
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-3xl font-extrabold text-white">Cinematic Veo</h2>
          <span className="px-2 py-0.5 rounded bg-accent/20 text-accent text-[10px] font-bold uppercase">Experimental</span>
        </div>
        <p className="text-muted-foreground mb-6 max-w-lg">Advanced temporal video synthesis. Describe a sequence and watch it come to life.</p>
        
        <div className="space-y-4">
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A high-speed drone shot through a neon-lit futuristic canyon..."
              className="w-full bg-background/50 border border-border rounded-2xl p-4 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 min-h-[100px] resize-none transition-all"
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-success"></div> 720p HD</span>
              <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-success"></div> 16:9 Cinema</span>
            </div>
            
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isGenerating}
              className="px-8 py-3 bg-accent text-white font-bold rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Synthesizing...</span>
                </div>
              ) : 'Generate Clip'}
            </button>
          </div>
          
          <div className="mt-4 flex flex-col gap-2">
             <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-[10px] text-accent hover:underline text-right uppercase tracking-widest font-bold">Billing Docs</a>
             {isGenerating && (
                <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 animate-pulse">
                  <p className="text-sm text-accent font-medium text-center">{status}</p>
                </div>
             )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {videos.map((video) => (
          <div key={video.id} className="glass rounded-3xl overflow-hidden shadow-2xl border border-border">
            <div className="aspect-video relative bg-black">
              <video src={video.url} controls className="w-full h-full object-contain" poster="https://picsum.photos/1280/720?grayscale" />
            </div>
            <div className="p-6 bg-card/40 flex items-start justify-between">
              <div>
                <p className="text-white font-medium mb-1">{video.prompt}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Veo 3.1 • {new Date(video.timestamp).toLocaleString()}</p>
              </div>
              <a href={video.url} download="lumina_generation.mp4" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </a>
            </div>
          </div>
        ))}
        
        {videos.length === 0 && !isGenerating && (
          <div className="py-24 border-2 border-dashed border-border rounded-3xl flex flex-col items-center justify-center text-muted-foreground opacity-50">
            <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-lg font-medium">Video Synthesis Library Empty</p>
            <p className="text-sm">Generations typically take 1-3 minutes.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoView;
