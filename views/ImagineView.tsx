
import React, { useState } from 'react';
import { GeneratedAsset } from '../types';
import { geminiService } from '../services/gemini';

const ImagineView: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [assets, setAssets] = useState<GeneratedAsset[]>([]);

  const handleImagine = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    try {
      const url = await geminiService.generateImage(prompt);
      const newAsset: GeneratedAsset = {
        id: Date.now().toString(),
        type: 'image',
        url: url,
        prompt: prompt,
        timestamp: Date.now()
      };
      setAssets(prev => [newAsset, ...prev]);
      setPrompt('');
    } catch (error) {
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="glass p-8 rounded-3xl border border-primary/20 shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[80px] -mr-32 -mt-32"></div>
        
        <h2 className="text-3xl font-extrabold text-white mb-2">Create Vision</h2>
        <p className="text-muted-foreground mb-6 max-w-lg">Transform text into high-fidelity visuals using Lumina's generative neural engine.</p>
        
        <div className="flex flex-col md:flex-row gap-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your vision (e.g., 'A cyberpunk street at night with neon signs and rain reflecting on the asphalt')..."
            className="flex-1 bg-background/50 border border-border rounded-2xl p-4 text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[100px] resize-none transition-all"
          />
          <button
            onClick={handleImagine}
            disabled={!prompt.trim() || isGenerating}
            className="md:w-40 flex flex-col items-center justify-center gap-2 bg-primary text-primary-foreground font-bold rounded-2xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            {isGenerating ? (
              <div className="w-6 h-6 border-4 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin"></div>
            ) : (
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            )}
            <span>{isGenerating ? 'Rendering...' : 'Imagine'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {assets.map((asset) => (
          <div key={asset.id} className="group glass rounded-3xl overflow-hidden shadow-lg border border-border hover:border-primary/30 transition-all duration-300">
            <div className="aspect-square relative overflow-hidden bg-muted">
              <img src={asset.url} alt={asset.prompt} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                <button className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white rounded-lg py-2 px-4 text-sm font-medium transition-all mb-2">
                  Download HD
                </button>
              </div>
            </div>
            <div className="p-4 bg-card/40">
              <p className="text-sm text-white line-clamp-2 font-medium">{asset.prompt}</p>
              <p className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wider">
                Generated {new Date(asset.timestamp).toLocaleTimeString()} • Lumina 2.5 Image
              </p>
            </div>
          </div>
        ))}
        
        {assets.length === 0 && !isGenerating && (
          <div className="md:col-span-2 py-20 border-2 border-dashed border-border rounded-3xl flex flex-col items-center justify-center text-muted-foreground opacity-50">
            <svg className="w-12 h-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="font-medium">No creations yet. Start imagining above.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImagineView;
