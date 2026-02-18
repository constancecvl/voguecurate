
import React, { useState, useEffect } from 'react';
import { Collection, AppView, CollectionImage, ExhibitionStrategy, PromotionalAssets } from './types';
import { Button } from './components/Button';
import { generateExhibitionStrategy, generateVisualConcept, generatePromotionalSuite } from './services/geminiService';

const MAX_IMAGE_DIMENSION = 1024;
const JPEG_QUALITY = 0.8;

// Fixed: Corrected the Window interface declaration to match the expected AIStudio type.
// The error indicated that 'aistudio' was already defined as 'AIStudio' in the global scope.
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    readonly aistudio: AIStudio;
  }
}

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.DASHBOARD);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollection, setActiveCollection] = useState<Collection | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImgGenerating, setIsImgGenerating] = useState(false);
  const [isPromoGenerating, setIsPromoGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);

  const [formData, setFormData] = useState({ name: '', season: '', description: '' });
  const [pendingImages, setPendingImages] = useState<CollectionImage[]>([]);

  // Check for API Key on mount
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      }
    };
    checkKey();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('voguecurate_collections');
    if (saved) {
      try { setCollections(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('voguecurate_collections', JSON.stringify(collections));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        setError("Storage limit reached. Please delete old collections.");
      }
    }
  }, [collections]);

  const handleOpenKeyPicker = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true); // Assume success per guidelines
    }
  };

  const processImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width, height = img.height;
          if (width > height) {
            if (width > MAX_IMAGE_DIMENSION) { height *= MAX_IMAGE_DIMENSION / width; width = MAX_IMAGE_DIMENSION; }
          } else {
            if (height > MAX_IMAGE_DIMENSION) { width *= MAX_IMAGE_DIMENSION / height; height = MAX_IMAGE_DIMENSION; }
          }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject("Canvas context failed");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const processedImages: CollectionImage[] = [];
    const fileArray = Array.from(files) as File[];
    for (const file of fileArray) {
      try {
        const base64 = await processImage(file);
        processedImages.push({ id: Math.random().toString(36).substr(2, 9), url: base64, base64 });
      } catch (err) { console.error(err); }
    }
    setPendingImages(prev => [...prev, ...processedImages]);
  };

  const createCollection = () => {
    if (!formData.name) return;
    const newColl: Collection = {
      id: Math.random().toString(36).substr(2, 9),
      name: formData.name, season: formData.season, description: formData.description,
      images: pendingImages, createdAt: Date.now()
    };
    setCollections(prev => [newColl, ...prev]);
    setActiveCollection(newColl);
    setView(AppView.EDITOR);
    setFormData({ name: '', season: '', description: '' });
    setPendingImages([]);
    setError(null);
  };

  const deleteCollection = (id: string) => {
    setCollections(prev => prev.filter(c => c.id !== id));
    if (activeCollection?.id === id) {
      setActiveCollection(null);
      setView(AppView.DASHBOARD);
    }
  };

  const wrapApiCall = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("Requested entity was not found") || err.message?.includes("API key")) {
        setHasApiKey(false);
        setError("API Key issue detected. Please re-connect your key.");
      } else {
        setError(err.message || "An unexpected error occurred.");
      }
    }
  };

  const handleCuration = () => wrapApiCall(async () => {
    if (!activeCollection) return;
    setIsGenerating(true);
    setError(null);
    const strategy = await generateExhibitionStrategy(activeCollection.name, activeCollection.description, activeCollection.images.map(img => img.base64 || img.url));
    const updated = { ...activeCollection, strategy };
    setActiveCollection(updated);
    setCollections(prev => prev.map(c => c.id === updated.id ? updated : c));
    setIsGenerating(false);
  });

  const handleVisualConcept = () => wrapApiCall(async () => {
    if (!activeCollection?.strategy) return;
    setIsImgGenerating(true);
    setError(null);
    const url = await generateVisualConcept(activeCollection.strategy);
    const updated = { ...activeCollection, visualConceptUrl: url };
    setActiveCollection(updated);
    setCollections(prev => prev.map(c => c.id === updated.id ? updated : c));
    setIsImgGenerating(false);
  });

  const handlePromotionalSuite = () => wrapApiCall(async () => {
    if (!activeCollection?.strategy) return;
    setIsPromoGenerating(true);
    setError(null);
    const promo = await generatePromotionalSuite({ name: activeCollection.name, strategy: activeCollection.strategy });
    const updated = { ...activeCollection, promoAssets: promo };
    setActiveCollection(updated);
    setCollections(prev => prev.map(c => c.id === updated.id ? updated : c));
    setIsPromoGenerating(false);
  });

  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100">
      {!hasApiKey && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl animate-in fade-in duration-500 px-6">
          <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 p-10 text-center space-y-8 rounded-lg shadow-2xl">
            <div className="w-16 h-16 bg-white flex items-center justify-center rounded-sm mx-auto shadow-xl">
              <span className="text-black font-bold text-2xl">V</span>
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl serif">Connection Required</h2>
              <p className="text-neutral-400 text-sm leading-relaxed">
                To generate curated strategies and ad visuals, you must connect a valid Gemini API key from a paid GCP project.
              </p>
            </div>
            <div className="space-y-4">
              <Button onClick={handleOpenKeyPicker} className="w-full py-4 text-lg">Connect Gemini API</Button>
              <p className="text-[10px] text-neutral-500 uppercase tracking-widest">
                Need help? Visit the <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition-colors">Billing Documentation</a>.
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-900/80 text-white text-xs py-2 px-6 text-center fixed top-20 left-0 right-0 z-[60] backdrop-blur-md animate-in fade-in slide-in-from-top-4 flex items-center justify-center gap-4">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold underline">Dismiss</button>
        </div>
      )}

      <header className="border-b border-neutral-900 bg-black/50 backdrop-blur-md sticky top-0 z-50 px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView(AppView.DASHBOARD)}>
          <div className="w-10 h-10 bg-white flex items-center justify-center rounded-sm"><span className="text-black font-bold text-xl">V</span></div>
          <h1 className="text-2xl tracking-tighter uppercase font-medium">VogueCurate</h1>
        </div>
        <nav className="flex gap-4">
          <Button variant="ghost" onClick={() => setView(AppView.DASHBOARD)}>Dashboard</Button>
          {activeCollection && <Button variant="outline" onClick={() => setView(AppView.EDITOR)}>Editor</Button>}
          <Button variant="ghost" onClick={handleOpenKeyPicker} className="text-[10px] uppercase tracking-widest opacity-50 hover:opacity-100">API Key</Button>
        </nav>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-12">
        {view === AppView.DASHBOARD && (
          <div className="space-y-12 animate-in fade-in duration-500">
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-6">
                <h2 className="text-6xl serif leading-tight">Curation <span className="italic">Elevated</span>.</h2>
                <p className="text-neutral-400 text-lg max-w-md">Transform your fashion collection into an immersive gallery experience with AI-assisted curation and ad campaigns.</p>
                <div className="p-8 bg-neutral-900/50 border border-neutral-800 rounded-lg space-y-4 max-w-lg">
                  <h3 className="text-xl serif">New Collection</h3>
                  <input className="w-full bg-neutral-950 border-neutral-800 border p-3" placeholder="Collection Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                  <input className="w-full bg-neutral-950 border-neutral-800 border p-3" placeholder="Season" value={formData.season} onChange={e => setFormData({...formData, season: e.target.value})} />
                  <textarea className="w-full bg-neutral-950 border-neutral-800 border p-3 min-h-[100px]" placeholder="Aesthetic description..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                  
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-widest text-neutral-500">Moodboard Images</p>
                    <input type="file" multiple accept="image/*" className="hidden" id="moodboard-upload" onChange={handleImageUpload} />
                    <label htmlFor="moodboard-upload" className="block border-2 border-dashed border-neutral-800 p-4 text-center cursor-pointer hover:border-neutral-600 transition-colors">
                      <span className="text-sm text-neutral-500">Click to upload collection photos</span>
                    </label>
                    {pendingImages.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto py-2 custom-scrollbar">
                        {pendingImages.map(img => (
                          <div key={img.id} className="relative group flex-shrink-0">
                            <img src={img.url} className="h-16 w-16 object-cover border border-neutral-800" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <Button onClick={createCollection} className="w-full">Initialize Exhibition</Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 h-fit">
                {collections.map(c => (
                  <div key={c.id} className="aspect-[3/4] bg-neutral-900 border border-neutral-800 overflow-hidden relative cursor-pointer group" onClick={() => { setActiveCollection(c); setView(AppView.EDITOR); }}>
                    {c.images[0] ? (
                      <img src={c.images[0].url} className="w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-700" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-800 font-bold">EXHIBIT</div>
                    )}
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-colors"></div>
                    <div className="absolute bottom-4 left-4">
                      <p className="text-xs uppercase tracking-[0.2em] font-bold">{c.name}</p>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteCollection(c.id); }}
                      className="absolute top-4 right-4 text-white/20 hover:text-white transition-colors"
                    >✕</button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {view === AppView.EDITOR && activeCollection && (
          <div className="space-y-12 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col lg:flex-row gap-12">
              <div className="lg:w-1/3 space-y-8">
                <Button variant="ghost" onClick={() => setView(AppView.DASHBOARD)} className="-ml-4 opacity-50 hover:opacity-100">← Back to Dashboard</Button>
                <h2 className="text-5xl serif leading-tight">{activeCollection.name}</h2>
                <div className="space-y-4">
                  <p className="text-neutral-400 italic leading-relaxed">{activeCollection.description}</p>
                  <div className="flex gap-2 overflow-x-auto py-2 custom-scrollbar">
                    {activeCollection.images.map(img => (
                      <img key={img.id} src={img.url} className="h-20 w-16 object-cover border border-neutral-900 grayscale hover:grayscale-0 transition-all" />
                    ))}
                  </div>
                </div>
                <div className="pt-6 space-y-3">
                  {!activeCollection.strategy && <Button onClick={handleCuration} className="w-full py-6" isLoading={isGenerating}>Design Curation Strategy</Button>}
                  {activeCollection.strategy && !activeCollection.visualConceptUrl && <Button onClick={handleVisualConcept} className="w-full py-6" isLoading={isImgGenerating}>Visualize Space</Button>}
                  {activeCollection.strategy && !activeCollection.promoAssets && <Button variant="secondary" onClick={handlePromotionalSuite} className="w-full py-6" isLoading={isPromoGenerating}>Generate Ad Campaign</Button>}
                </div>
              </div>

              <div className="lg:w-2/3 space-y-16">
                {activeCollection.strategy ? (
                  <>
                    <div className="space-y-8">
                      <div className="aspect-video bg-neutral-900 border border-neutral-800 overflow-hidden relative group">
                        {activeCollection.visualConceptUrl ? (
                          <img src={activeCollection.visualConceptUrl} className="w-full h-full object-cover transition-transform duration-[20s] group-hover:scale-110" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-neutral-600 gap-4">
                            {isImgGenerating ? <div className="animate-spin h-6 w-6 border-t-2 border-white rounded-full"></div> : null}
                            <p className="italic">{isImgGenerating ? "Rendering installation sketch..." : "Spatial visualization pending..."}</p>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in duration-1000">
                        <section>
                          <h4 className="text-xs uppercase tracking-widest text-white/40 mb-3">Theme Name</h4>
                          <p className="text-4xl serif">{activeCollection.strategy.themeName}</p>
                          <p className="text-xl serif italic text-neutral-400 mt-2">"{activeCollection.strategy.tagline}"</p>
                        </section>
                        <section className="bg-neutral-900/30 border border-neutral-900 p-6 rounded">
                          <h4 className="text-xs uppercase tracking-widest text-white/40 mb-3">Concept & Atmosphere</h4>
                          <p className="text-neutral-300 leading-relaxed font-light">{activeCollection.strategy.conceptDescription}</p>
                        </section>
                      </div>
                    </div>

                    {activeCollection.promoAssets && (
                      <div className="pt-16 border-t border-neutral-900 grid grid-cols-1 lg:grid-cols-2 gap-12 animate-in slide-in-from-right-8 duration-700">
                        <div className="aspect-[3/4] bg-neutral-900 border border-neutral-800 overflow-hidden relative shadow-2xl">
                          <img src={activeCollection.promoAssets.posterUrl} className="w-full h-full object-cover" />
                        </div>
                        <div className="space-y-8">
                          <h3 className="text-xs uppercase tracking-[0.5em] text-white font-bold border-b border-neutral-900 pb-4">Promotional Campaign</h3>
                          <section>
                            <h4 className="text-[10px] uppercase text-neutral-500 mb-2 tracking-widest">Instagram Copy</h4>
                            <p className="p-4 bg-black border border-neutral-900 rounded text-xs text-neutral-400 font-mono whitespace-pre-wrap">{activeCollection.promoAssets.instagramCaption}</p>
                          </section>
                          <section>
                            <h4 className="text-[10px] uppercase text-neutral-500 mb-2 tracking-widest">Press Snippet</h4>
                            <p className="text-neutral-300 leading-relaxed italic text-sm">"{activeCollection.promoAssets.pressSnippet}"</p>
                          </section>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-96 border border-dashed border-neutral-900 rounded-lg flex items-center justify-center text-neutral-700 italic serif text-xl p-12 text-center">
                    {isGenerating ? "Analyzing Collection..." : "Design Strategy Pending."}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
