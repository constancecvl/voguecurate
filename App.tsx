
import React, { useState, useEffect } from 'react';
import { Collection, AppView, CollectionImage, ExhibitionStrategy, PromotionalAssets } from './types';
import { Button } from './components/Button';
import { generateExhibitionStrategy, generateVisualConcept, generatePromotionalSuite } from './services/geminiService';

const MAX_IMAGE_DIMENSION = 1024;
const JPEG_QUALITY = 0.8;

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.DASHBOARD);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollection, setActiveCollection] = useState<Collection | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImgGenerating, setIsImgGenerating] = useState(false);
  const [isPromoGenerating, setIsPromoGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({ name: '', season: '', description: '' });
  const [pendingImages, setPendingImages] = useState<CollectionImage[]>([]);

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
        setError("Your fashion archive is full. Please delete an older collection.");
      }
    }
  }, [collections]);

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
          if (!ctx) return reject("Failed to process image.");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isForActiveCollection: boolean = false) => {
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

    if (isForActiveCollection && activeCollection) {
      const updatedImages = [...activeCollection.images, ...processedImages];
      const updatedCollection = { ...activeCollection, images: updatedImages };
      setActiveCollection(updatedCollection);
      setCollections(prev => prev.map(c => c.id === updatedCollection.id ? updatedCollection : c));
    } else {
      setPendingImages(prev => [...prev, ...processedImages]);
    }
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

  const removeImageFromCollection = (imageId: string) => {
    if (!activeCollection) return;
    const updatedImages = activeCollection.images.filter(img => img.id !== imageId);
    const updatedCollection = { ...activeCollection, images: updatedImages };
    setActiveCollection(updatedCollection);
    setCollections(prev => prev.map(c => c.id === updatedCollection.id ? updatedCollection : c));
  };

  const wrapApiCall = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (err: any) {
      console.error(err);
      setError("The digital curator is currently busy. Please try again in a moment.");
    }
  };

  const handleCuration = () => wrapApiCall(async () => {
    if (!activeCollection) return;
    setIsGenerating(true);
    const strategy = await generateExhibitionStrategy(
      activeCollection.name, 
      activeCollection.description, 
      activeCollection.images.map(img => img.base64 || img.url)
    );
    const updated = { ...activeCollection, strategy };
    setActiveCollection(updated);
    setCollections(prev => prev.map(c => c.id === updated.id ? updated : c));
    setIsGenerating(false);
  });

  const handleVisualConcept = () => wrapApiCall(async () => {
    if (!activeCollection?.strategy) return;
    setIsImgGenerating(true);
    const url = await generateVisualConcept(activeCollection.strategy);
    const updated = { ...activeCollection, visualConceptUrl: url };
    setActiveCollection(updated);
    setCollections(prev => prev.map(c => c.id === updated.id ? updated : c));
    setIsImgGenerating(false);
  });

  const handlePromotionalSuite = () => wrapApiCall(async () => {
    if (!activeCollection?.strategy) return;
    setIsPromoGenerating(true);
    const promo = await generatePromotionalSuite({ name: activeCollection.name, strategy: activeCollection.strategy });
    const updated = { ...activeCollection, promoAssets: promo };
    setActiveCollection(updated);
    setCollections(prev => prev.map(c => c.id === updated.id ? updated : c));
    setIsPromoGenerating(false);
  });

  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100">
      {error && (
        <div className="bg-neutral-900 border-b border-neutral-800 text-neutral-400 text-xs py-3 px-6 text-center fixed top-0 left-0 right-0 z-[60] backdrop-blur-md animate-in fade-in slide-in-from-top-4 flex items-center justify-center gap-4">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold underline text-white">Dismiss</button>
        </div>
      )}

      <header className="border-b border-neutral-900 bg-black/50 backdrop-blur-md sticky top-0 z-50 px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView(AppView.DASHBOARD)}>
          <div className="w-10 h-10 bg-white flex items-center justify-center rounded-sm shadow-xl"><span className="text-black font-bold text-xl tracking-tighter">V</span></div>
          <h1 className="text-2xl tracking-tighter uppercase font-medium">VogueCurate</h1>
        </div>
        <nav className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => setView(AppView.DASHBOARD)}>Collections</Button>
          {activeCollection && <Button variant="outline" onClick={() => setView(AppView.EDITOR)}>Curation Deck</Button>}
        </nav>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-12">
        {view === AppView.DASHBOARD && (
          <div className="space-y-12 animate-in fade-in duration-500">
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-8">
                <h2 className="text-6xl serif leading-tight">Spatial <span className="italic">Narratives</span>.</h2>
                <p className="text-neutral-400 text-lg max-w-md leading-relaxed">Archive your fashion collections and transform them into immersive exhibition experiences with our curator engine.</p>
                
                <div className="p-8 bg-neutral-900/40 border border-neutral-900 rounded-sm space-y-5 max-w-lg shadow-2xl">
                  <h3 className="text-xl serif tracking-tight">New Archive</h3>
                  <input className="w-full bg-neutral-950 border-neutral-800 border p-3 focus:outline-none focus:border-white transition-colors text-sm" placeholder="Collection Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                  <input className="w-full bg-neutral-950 border-neutral-800 border p-3 focus:outline-none focus:border-white transition-colors text-sm" placeholder="Season (e.g. FW25)" value={formData.season} onChange={e => setFormData({...formData, season: e.target.value})} />
                  <textarea className="w-full bg-neutral-950 border-neutral-800 border p-3 min-h-[100px] focus:outline-none focus:border-white transition-colors text-sm" placeholder="Vision and aesthetic description..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                  
                  <div className="space-y-3">
                    <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Visual References</p>
                    <input type="file" multiple accept="image/*" className="hidden" id="moodboard-upload" onChange={(e) => handleImageUpload(e, false)} />
                    <label htmlFor="moodboard-upload" className="block border border-dashed border-neutral-800 p-6 text-center cursor-pointer hover:border-neutral-600 hover:bg-neutral-900/50 transition-all rounded-sm">
                      <span className="text-xs text-neutral-500 uppercase tracking-widest">Select Files</span>
                    </label>
                    {pendingImages.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto py-2 custom-scrollbar">
                        {pendingImages.map(img => (
                          <div key={img.id} className="relative flex-shrink-0">
                            <img src={img.url} className="h-16 w-16 object-cover border border-neutral-800 grayscale" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <Button onClick={createCollection} className="w-full uppercase text-xs tracking-[0.2em] py-4">Create Archive</Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 h-fit">
                {collections.map(c => (
                  <div key={c.id} className="aspect-[3/4] bg-neutral-900 border border-neutral-900 overflow-hidden relative cursor-pointer group rounded-sm shadow-lg" onClick={() => { setActiveCollection(c); setView(AppView.EDITOR); }}>
                    {c.images[0] ? (
                      <img src={c.images[0].url} className="w-full h-full object-cover opacity-50 group-hover:scale-105 transition-transform duration-700 grayscale group-hover:grayscale-0" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-800 font-bold uppercase tracking-widest text-[10px]">No Content</div>
                    )}
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-colors"></div>
                    <div className="absolute bottom-6 left-6 pr-10">
                      <p className="text-xs uppercase tracking-[0.3em] font-bold truncate">{c.name}</p>
                      <p className="text-[10px] text-white/40 uppercase tracking-widest mt-2">{c.season}</p>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteCollection(c.id); }}
                      className="absolute top-4 right-4 text-white/10 hover:text-white transition-colors p-2 rounded-full"
                    >✕</button>
                  </div>
                ))}
                {collections.length === 0 && (
                  <div className="col-span-2 py-32 border border-dashed border-neutral-900 text-center flex flex-col items-center justify-center gap-4 opacity-30">
                    <p className="serif italic text-xl">The archive is currently empty.</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {view === AppView.EDITOR && activeCollection && (
          <div className="space-y-12 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col lg:flex-row gap-12">
              <div className="lg:w-1/3 space-y-10">
                <div className="flex items-center justify-between border-b border-neutral-900 pb-8">
                  <div className="space-y-1">
                    <h2 className="text-4xl serif leading-tight tracking-tight">{activeCollection.name}</h2>
                    <p className="text-[10px] tracking-[0.4em] uppercase text-neutral-600 font-bold">{activeCollection.season}</p>
                  </div>
                  <Button variant="ghost" onClick={() => setView(AppView.DASHBOARD)} className="text-[10px] uppercase tracking-widest">Back</Button>
                </div>
                
                <div className="space-y-8">
                  <p className="text-neutral-500 italic leading-relaxed text-sm font-light">{activeCollection.description}</p>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-[0.4em] text-neutral-400 font-bold">Visual Reference Library</p>
                      <input type="file" multiple accept="image/*" className="hidden" id="editor-image-upload" onChange={(e) => handleImageUpload(e, true)} />
                      <label htmlFor="editor-image-upload" className="text-[9px] uppercase tracking-widest text-neutral-500 hover:text-white cursor-pointer transition-colors border border-neutral-800 px-3 py-1.5 rounded-sm">
                        <span>Upload</span>
                      </label>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {activeCollection.images.map(img => (
                        <div key={img.id} className="relative group aspect-square">
                          <img src={img.url} className="w-full h-full object-cover border border-neutral-900 grayscale hover:grayscale-0 transition-all cursor-zoom-in rounded-sm" />
                          <button 
                            onClick={() => removeImageFromCollection(img.id)}
                            className="absolute -top-1 -right-1 bg-black text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 scale-50 border border-neutral-800"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-10 space-y-4 border-t border-neutral-900">
                  <p className="text-[10px] uppercase tracking-[0.4em] text-neutral-600 font-bold mb-2">Exhibition Tools</p>
                  {!activeCollection.strategy && <Button onClick={handleCuration} className="w-full py-5 text-xs uppercase tracking-widest" isLoading={isGenerating}>Draft Curation Strategy</Button>}
                  {activeCollection.strategy && !activeCollection.visualConceptUrl && <Button onClick={handleVisualConcept} className="w-full py-5 text-xs uppercase tracking-widest" isLoading={isImgGenerating}>Render Concept View</Button>}
                  {activeCollection.strategy && !activeCollection.promoAssets && <Button variant="secondary" onClick={handlePromotionalSuite} className="w-full py-5 text-xs uppercase tracking-widest" isLoading={isPromoGenerating}>Generate Campaign Assets</Button>}
                </div>
              </div>

              <div className="lg:w-2/3 space-y-16">
                {activeCollection.strategy ? (
                  <div className="animate-in fade-in duration-1000">
                    <div className="space-y-10">
                      <div className="aspect-video bg-neutral-900 border border-neutral-800 overflow-hidden relative group rounded-sm shadow-2xl">
                        {activeCollection.visualConceptUrl ? (
                          <img src={activeCollection.visualConceptUrl} className="w-full h-full object-cover transition-transform duration-[30s] group-hover:scale-110" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-neutral-700 gap-4">
                            {isImgGenerating ? <div className="animate-pulse h-8 w-8 bg-neutral-800 rounded-full"></div> : null}
                            <p className="italic text-xs tracking-widest uppercase">{isImgGenerating ? "Synthesizing spatial render..." : "Spatial concept visualization pending"}</p>
                          </div>
                        )}
                        <div className="absolute inset-0 border-[20px] border-black/10 pointer-events-none"></div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                        <section className="space-y-4">
                          <h4 className="text-[10px] uppercase tracking-[0.5em] text-neutral-600 font-bold">Curation Identity</h4>
                          <p className="text-5xl serif tracking-tight">{activeCollection.strategy.themeName}</p>
                          <p className="text-xl serif italic text-neutral-400 font-light leading-relaxed">"{activeCollection.strategy.tagline}"</p>
                        </section>
                        <section className="bg-neutral-900/10 border border-neutral-900 p-10 rounded-sm">
                          <h4 className="text-[10px] uppercase tracking-[0.5em] text-neutral-600 font-bold mb-6">Exhibition Concept</h4>
                          <p className="text-neutral-400 leading-relaxed font-light text-sm">{activeCollection.strategy.conceptDescription}</p>
                        </section>
                      </div>
                    </div>

                    {activeCollection.promoAssets && (
                      <div className="pt-20 mt-20 border-t border-neutral-900 grid grid-cols-1 lg:grid-cols-2 gap-16 animate-in slide-in-from-right-8 duration-700">
                        <div className="aspect-[3/4] bg-neutral-900 border border-neutral-800 overflow-hidden relative shadow-2xl group rounded-sm">
                          <img src={activeCollection.promoAssets.posterUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[15s] grayscale hover:grayscale-0" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80 pointer-events-none"></div>
                        </div>
                        <div className="space-y-10">
                          <h3 className="text-[10px] uppercase tracking-[0.6em] text-white font-bold border-b border-neutral-900 pb-8">Campaign Deck</h3>
                          <section className="space-y-4">
                            <h4 className="text-[10px] uppercase text-neutral-600 tracking-[0.3em] font-bold">Editorial Copy</h4>
                            <p className="p-6 bg-black/40 border border-neutral-900 rounded-sm text-xs text-neutral-400 font-light whitespace-pre-wrap leading-loose shadow-inner">
                              {activeCollection.promoAssets.instagramCaption}
                            </p>
                          </section>
                          <section className="space-y-4">
                            <h4 className="text-[10px] uppercase text-neutral-600 tracking-[0.3em] font-bold">Media Narrative</h4>
                            <p className="text-neutral-300 leading-relaxed italic text-sm font-light border-l border-neutral-800 pl-6">
                              "{activeCollection.promoAssets.pressSnippet}"
                            </p>
                          </section>
                          <Button variant="outline" className="w-full text-[10px] uppercase tracking-widest py-4 mt-6" onClick={handlePromotionalSuite} isLoading={isPromoGenerating}>Refresh Campaign</Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-[700px] border border-neutral-900 rounded-sm flex flex-col items-center justify-center text-neutral-800 p-12 text-center gap-8 bg-neutral-900/10 shadow-inner">
                    <div className="w-20 h-[1px] bg-neutral-800"></div>
                    <p className="italic serif text-3xl max-w-md text-neutral-500">
                      {isGenerating ? "Synthesizing the spatial narrative..." : "The archive is ready for curation."}
                    </p>
                    {!isGenerating && (
                      <p className="text-[10px] uppercase tracking-[0.4em] text-neutral-700 max-w-xs leading-loose font-bold">
                        Begin by selecting 'Draft Curation Strategy' to define the exhibition identity.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
      <footer className="px-6 py-12 border-t border-neutral-900 flex justify-between items-center opacity-20">
        <p className="text-[9px] uppercase tracking-[0.5em] font-bold">VogueCurate Archive System</p>
        <p className="text-[9px] uppercase tracking-[0.5em] font-bold">Proprietary Curator Engine</p>
      </footer>
    </div>
  );
};

export default App;
