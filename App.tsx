
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
  const [storageError, setStorageError] = useState<string | null>(null);

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
      setStorageError(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        setStorageError("Storage limit reached. Please delete old collections.");
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
  };

  const handleCuration = async () => {
    if (!activeCollection) return;
    setIsGenerating(true);
    try {
      const strategy = await generateExhibitionStrategy(activeCollection.name, activeCollection.description, activeCollection.images.map(img => img.base64 || img.url));
      const updated = { ...activeCollection, strategy };
      setActiveCollection(updated);
      setCollections(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch (err) { console.error(err); } finally { setIsGenerating(false); }
  };

  const handleVisualConcept = async () => {
    if (!activeCollection?.strategy) return;
    setIsImgGenerating(true);
    try {
      const url = await generateVisualConcept(activeCollection.strategy);
      const updated = { ...activeCollection, visualConceptUrl: url };
      setActiveCollection(updated);
      setCollections(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch (err) { console.error(err); } finally { setIsImgGenerating(false); }
  };

  const handlePromotionalSuite = async () => {
    if (!activeCollection?.strategy) return;
    setIsPromoGenerating(true);
    try {
      const promo = await generatePromotionalSuite({ name: activeCollection.name, strategy: activeCollection.strategy });
      const updated = { ...activeCollection, promoAssets: promo };
      setActiveCollection(updated);
      setCollections(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch (err) { console.error(err); } finally { setIsPromoGenerating(false); }
  };

  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-900 bg-black/50 backdrop-blur-md sticky top-0 z-50 px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView(AppView.DASHBOARD)}>
          <div className="w-10 h-10 bg-white flex items-center justify-center rounded-sm"><span className="text-black font-bold text-xl">V</span></div>
          <h1 className="text-2xl tracking-tighter uppercase font-medium">VogueCurate</h1>
        </div>
        <nav className="flex gap-4">
          <Button variant="ghost" onClick={() => setView(AppView.DASHBOARD)}>Dashboard</Button>
          {activeCollection && <Button variant="outline" onClick={() => setView(AppView.EDITOR)}>Editor</Button>}
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
                  <Button onClick={createCollection} className="w-full">Initialize Exhibition</Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {collections.slice(0, 4).map(c => (
                  <div key={c.id} className="aspect-[3/4] bg-neutral-900 border border-neutral-800 overflow-hidden relative cursor-pointer" onClick={() => { setActiveCollection(c); setView(AppView.EDITOR); }}>
                    {c.images[0] ? <img src={c.images[0].url} className="w-full h-full object-cover opacity-60" /> : <div className="w-full h-full flex items-center justify-center text-neutral-800">EMPTY</div>}
                    <div className="absolute bottom-4 left-4"><p className="text-xs uppercase tracking-widest">{c.name}</p></div>
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
                <h2 className="text-5xl serif">{activeCollection.name}</h2>
                <p className="text-neutral-400 italic">{activeCollection.description}</p>
                <div className="pt-6 space-y-3">
                  {!activeCollection.strategy && <Button onClick={handleCuration} className="w-full py-6" isLoading={isGenerating}>Design Strategy</Button>}
                  {activeCollection.strategy && !activeCollection.visualConceptUrl && <Button onClick={handleVisualConcept} className="w-full py-6" isLoading={isImgGenerating}>Visualize Installation</Button>}
                  {activeCollection.strategy && !activeCollection.promoAssets && <Button variant="secondary" onClick={handlePromotionalSuite} className="w-full py-6" isLoading={isPromoGenerating}>Generate Ad Campaign</Button>}
                </div>
              </div>

              <div className="lg:w-2/3 space-y-16">
                {activeCollection.strategy ? (
                  <>
                    <div className="space-y-8">
                      <div className="aspect-video bg-neutral-900 border border-neutral-800 overflow-hidden relative">
                        {activeCollection.visualConceptUrl ? <img src={activeCollection.visualConceptUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">Strategic view pending...</div>}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div><h4 className="text-xs uppercase text-white/40 mb-2">Theme</h4><p className="text-3xl serif">{activeCollection.strategy.themeName}</p></div>
                        <div><h4 className="text-xs uppercase text-white/40 mb-2">Tagline</h4><p className="text-xl serif italic">"{activeCollection.strategy.tagline}"</p></div>
                      </div>
                    </div>

                    {activeCollection.promoAssets && (
                      <div className="pt-16 border-t border-neutral-900 grid grid-cols-1 lg:grid-cols-2 gap-12">
                        <div className="aspect-[3/4] bg-neutral-900 border border-neutral-800 overflow-hidden relative shadow-2xl">
                          <img src={activeCollection.promoAssets.posterUrl} className="w-full h-full object-cover" />
                          <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-black to-transparent">
                            <p className="text-white text-xs tracking-[0.5em] font-bold uppercase">{activeCollection.name}</p>
                          </div>
                        </div>
                        <div className="space-y-6">
                          <h3 className="text-xs uppercase tracking-widest text-white/40">Campaign Content</h3>
                          <section><h4 className="text-xs text-neutral-500 mb-1">Instagram Caption</h4><p className="p-4 bg-black border border-neutral-800 rounded text-sm text-neutral-400 font-mono">{activeCollection.promoAssets.instagramCaption}</p></section>
                          <section><h4 className="text-xs text-neutral-500 mb-1">Press Snippet</h4><p className="text-neutral-300 leading-relaxed italic">{activeCollection.promoAssets.pressSnippet}</p></section>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-96 border border-dashed border-neutral-800 rounded flex items-center justify-center text-neutral-600">Strategy not yet initialized.</div>
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
