
import React, { useState, useEffect } from 'react';
import { Collection, AppView, CollectionImage, ExhibitionStrategy } from './types';
import { Button } from './components/Button';
import { generateExhibitionStrategy, generateVisualConcept } from './services/geminiService';

const MAX_IMAGE_DIMENSION = 1024;
const JPEG_QUALITY = 0.8;

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.DASHBOARD);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollection, setActiveCollection] = useState<Collection | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImgGenerating, setIsImgGenerating] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  // Form State for New Collection
  const [formData, setFormData] = useState({
    name: '',
    season: '',
    description: ''
  });
  const [pendingImages, setPendingImages] = useState<CollectionImage[]>([]);

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem('voguecurate_collections');
    if (saved) {
      try {
        setCollections(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved collections");
      }
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('voguecurate_collections', JSON.stringify(collections));
      setStorageError(null);
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        setStorageError("Storage limit reached. Some changes may not be saved. Please delete old collections.");
      } else {
        console.error("Storage error:", e);
      }
    }
  }, [collections]);

  // Helper to resize and compress images before storing as base64
  const processImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_IMAGE_DIMENSION) {
              height *= MAX_IMAGE_DIMENSION / width;
              width = MAX_IMAGE_DIMENSION;
            }
          } else {
            if (height > MAX_IMAGE_DIMENSION) {
              width *= MAX_IMAGE_DIMENSION / height;
              height = MAX_IMAGE_DIMENSION;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject("Canvas context failed");
          
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const processedImages: CollectionImage[] = [];
    // Fix: Explicitly cast Array.from(files) to File[] to prevent 'unknown' type inference error in the loop
    const fileArray = Array.from(files) as File[];
    for (const file of fileArray) {
      try {
        const base64 = await processImage(file);
        processedImages.push({
          id: Math.random().toString(36).substr(2, 9),
          url: base64,
          base64: base64
        });
      } catch (err) {
        console.error("Error processing image:", err);
      }
    }
    setPendingImages(prev => [...prev, ...processedImages]);
  };

  const createCollection = () => {
    if (!formData.name) return;
    const newColl: Collection = {
      id: Math.random().toString(36).substr(2, 9),
      name: formData.name,
      season: formData.season,
      description: formData.description,
      images: pendingImages,
      createdAt: Date.now()
    };
    setCollections(prev => [newColl, ...prev]);
    setActiveCollection(newColl);
    setView(AppView.EDITOR);
    setFormData({ name: '', season: '', description: '' });
    setPendingImages([]);
  };

  const deleteCollection = (id: string) => {
    setCollections(prev => prev.filter(c => c.id !== id));
    if (activeCollection?.id === id) {
      setActiveCollection(null);
      setView(AppView.DASHBOARD);
    }
  };

  const handleCuration = async () => {
    if (!activeCollection) return;
    setIsGenerating(true);
    try {
      const strategy = await generateExhibitionStrategy(
        activeCollection.name,
        activeCollection.description,
        activeCollection.images.map(img => img.base64 || img.url)
      );
      
      const updatedCollection = { ...activeCollection, strategy };
      setActiveCollection(updatedCollection);
      setCollections(prev => prev.map(c => c.id === updatedCollection.id ? updatedCollection : c));
    } catch (err) {
      console.error(err);
      alert("Failed to generate curation strategy. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleVisualConcept = async () => {
    if (!activeCollection?.strategy) return;
    setIsImgGenerating(true);
    try {
      const url = await generateVisualConcept(activeCollection.strategy);
      const updatedCollection = { ...activeCollection, visualConceptUrl: url };
      setActiveCollection(updatedCollection);
      setCollections(prev => prev.map(c => c.id === updatedCollection.id ? updatedCollection : c));
    } catch (err) {
      console.error(err);
      alert("Failed to generate visual concept.");
    } finally {
      setIsImgGenerating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Storage Warning Banner */}
      {storageError && (
        <div className="bg-red-900/80 text-white text-xs py-2 px-6 text-center backdrop-blur-sm sticky top-0 z-[60] flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {storageError}
          <button onClick={() => setStorageError(null)} className="ml-4 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Header */}
      <header className={`border-b border-neutral-800 bg-black/50 backdrop-blur-md sticky ${storageError ? 'top-[32px]' : 'top-0'} z-50`}>
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div 
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => setView(AppView.DASHBOARD)}
          >
            <div className="w-10 h-10 bg-white flex items-center justify-center rounded-sm group-hover:rotate-12 transition-transform">
              <span className="text-black font-bold text-xl">V</span>
            </div>
            <h1 className="text-2xl tracking-tighter uppercase font-medium">VogueCurate</h1>
          </div>
          <nav className="flex gap-6">
            <Button variant="ghost" onClick={() => setView(AppView.DASHBOARD)}>Collections</Button>
            {activeCollection && (
              <Button variant="outline" onClick={() => setView(AppView.EDITOR)}>Current Editor</Button>
            )}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-12">
        {view === AppView.DASHBOARD && (
          <div className="space-y-12 animate-in fade-in duration-500">
            <section className="flex flex-col md:flex-row gap-12 items-start">
              <div className="flex-1 space-y-6">
                <h2 className="text-5xl font-light serif leading-tight">Bring your vision to the <span className="italic">gallery floor</span>.</h2>
                <p className="text-neutral-400 text-lg max-w-lg leading-relaxed">
                  Upload your collection's moodboard and details. Our AI curator will help you define the space, the light, and the story of your next exhibition.
                </p>
                <div className="p-8 bg-neutral-900/50 border border-neutral-800 rounded-lg space-y-6 w-full max-w-xl">
                  <h3 className="text-xl serif">New Collection</h3>
                  <div className="space-y-4">
                    <input 
                      className="w-full bg-neutral-900 border-neutral-800 border p-3 focus:outline-none focus:border-white transition-colors"
                      placeholder="Collection Name (e.g., 'Metamorphosis')"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                    <input 
                      className="w-full bg-neutral-900 border-neutral-800 border p-3 focus:outline-none focus:border-white transition-colors"
                      placeholder="Season (e.g., 'Spring/Summer 2025')"
                      value={formData.season}
                      onChange={e => setFormData({...formData, season: e.target.value})}
                    />
                    <textarea 
                      className="w-full bg-neutral-900 border-neutral-800 border p-3 min-h-[100px] focus:outline-none focus:border-white transition-colors"
                      placeholder="Describe the aesthetic, fabrics, and core themes..."
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                    />
                    <div className="space-y-2">
                      <p className="text-sm text-neutral-500 uppercase tracking-widest">Images</p>
                      <input 
                        type="file" 
                        multiple 
                        accept="image/*" 
                        onChange={handleImageUpload}
                        className="hidden" 
                        id="image-upload"
                      />
                      <label 
                        htmlFor="image-upload"
                        className="flex items-center justify-center p-6 border-2 border-dashed border-neutral-800 hover:border-neutral-600 transition-colors cursor-pointer group"
                      >
                        <div className="text-center">
                          <span className="text-neutral-500 group-hover:text-neutral-300">Click to upload images (auto-optimized)</span>
                        </div>
                      </label>
                      {pendingImages.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto py-2 custom-scrollbar">
                          {pendingImages.map(img => (
                            <img key={img.id} src={img.url} className="h-16 w-16 object-cover rounded-sm border border-neutral-800" />
                          ))}
                        </div>
                      )}
                    </div>
                    <Button onClick={createCollection} className="w-full py-4">Begin Curating</Button>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-8">
              <div className="flex items-end justify-between">
                <h3 className="text-3xl serif">Past Projects</h3>
                <div className="h-px bg-neutral-800 flex-1 mx-8 mb-3"></div>
              </div>
              
              {collections.length === 0 ? (
                <div className="text-center py-20 bg-neutral-900/20 border border-neutral-900 rounded-lg">
                  <p className="text-neutral-500">No collections saved yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {collections.map(col => (
                    <div 
                      key={col.id} 
                      className="group bg-neutral-900/30 border border-neutral-800 p-6 space-y-4 hover:bg-neutral-900/50 transition-all cursor-pointer relative"
                      onClick={() => {
                        setActiveCollection(col);
                        setView(AppView.EDITOR);
                      }}
                    >
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteCollection(col.id);
                        }}
                        className="absolute top-4 right-4 text-neutral-700 hover:text-red-500 transition-colors p-2 z-10"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      <div className="aspect-[4/5] overflow-hidden bg-neutral-800 relative">
                        {col.images[0] ? (
                          <img src={col.images[0].url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-neutral-700 font-bold text-4xl">F</div>
                        )}
                        {col.strategy && (
                          <div className="absolute bottom-4 left-4 bg-white text-black px-3 py-1 text-xs font-bold uppercase tracking-widest">
                            Curated
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 uppercase tracking-widest mb-1">{col.season}</p>
                        <h4 className="text-2xl font-medium tracking-tight group-hover:underline underline-offset-4">{col.name}</h4>
                        <p className="text-neutral-500 text-sm line-clamp-2 mt-2">{col.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {view === AppView.EDITOR && activeCollection && (
          <div className="space-y-12 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col lg:flex-row gap-12">
              {/* Sidebar Info */}
              <div className="lg:w-1/3 space-y-8">
                <div className="space-y-2">
                   <Button variant="ghost" onClick={() => setView(AppView.DASHBOARD)} className="-ml-4 opacity-50 hover:opacity-100">
                    ← Back to Collections
                  </Button>
                  <p className="text-sm text-neutral-500 uppercase tracking-[0.2em]">{activeCollection.season}</p>
                  <h2 className="text-5xl serif">{activeCollection.name}</h2>
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-xs uppercase tracking-[0.3em] text-neutral-500 border-b border-neutral-800 pb-2">The Collection</h3>
                  <p className="text-neutral-400 leading-relaxed italic">{activeCollection.description}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {activeCollection.images.map(img => (
                      <div key={img.id} className="aspect-square bg-neutral-900 border border-neutral-800 overflow-hidden">
                        <img src={img.url} className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity" />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-8">
                  {!activeCollection.strategy && (
                    <Button 
                      onClick={handleCuration} 
                      className="w-full py-6 text-lg"
                      isLoading={isGenerating}
                    >
                      Generate Exhibition Strategy
                    </Button>
                  )}
                  {activeCollection.strategy && !activeCollection.visualConceptUrl && (
                    <Button 
                      onClick={handleVisualConcept} 
                      className="w-full py-6 text-lg"
                      isLoading={isImgGenerating}
                    >
                      Visualize Installation Sketch
                    </Button>
                  )}
                </div>
              </div>

              {/* Main Curation Display */}
              <div className="lg:w-2/3 space-y-12">
                {!activeCollection.strategy ? (
                  <div className="h-full min-h-[500px] border border-neutral-800 border-dashed rounded-lg flex items-center justify-center p-12 text-center text-neutral-600">
                    <div className="max-w-md space-y-4">
                      <svg className="w-16 h-16 mx-auto opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      <p className="text-xl serif italic">Your exhibition space is currently a blank canvas. Tap the button to let the curator begin conceptualizing.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-16 animate-in fade-in zoom-in-95 duration-1000">
                    {/* Visual Concept Sketch */}
                    <div className="space-y-4">
                      <h3 className="text-xs uppercase tracking-[0.3em] text-neutral-500">Atmospheric Visualization</h3>
                      {activeCollection.visualConceptUrl ? (
                         <div className="relative group overflow-hidden bg-neutral-900 border border-neutral-800 aspect-video">
                            <img 
                              src={activeCollection.visualConceptUrl} 
                              className="w-full h-full object-cover transition-transform duration-[20s] ease-linear group-hover:scale-110" 
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-8">
                              <p className="text-white text-lg italic serif">Proposed Installation: "{activeCollection.strategy.themeName}"</p>
                            </div>
                         </div>
                      ) : (
                        <div className="aspect-video bg-neutral-900 flex items-center justify-center border border-neutral-800">
                          {isImgGenerating ? (
                            <div className="flex flex-col items-center gap-4">
                              <div className="animate-spin h-8 w-8 border-t-2 border-white rounded-full"></div>
                              <p className="text-neutral-500 italic">Rendering spatial concept...</p>
                            </div>
                          ) : (
                            <p className="text-neutral-700 italic">No visual generated yet.</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Detailed Strategy */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                      <div className="space-y-6">
                        <section>
                          <h4 className="text-xs uppercase tracking-[0.3em] text-white/40 mb-3">Exhibition Theme</h4>
                          <h5 className="text-4xl serif">{activeCollection.strategy.themeName}</h5>
                        </section>

                        <section>
                          <h4 className="text-xs uppercase tracking-[0.3em] text-white/40 mb-3">The Concept</h4>
                          <p className="text-neutral-300 leading-relaxed font-light">{activeCollection.strategy.conceptDescription}</p>
                        </section>

                        <section>
                          <h4 className="text-xs uppercase tracking-[0.3em] text-white/40 mb-3">Spatial Arrangement</h4>
                          <p className="text-neutral-300 leading-relaxed font-light">{activeCollection.strategy.spatialArrangement}</p>
                        </section>
                      </div>

                      <div className="space-y-6">
                        <div className="p-8 bg-neutral-900/40 border border-neutral-800/60 rounded-lg space-y-6">
                           <section>
                            <h4 className="text-xs uppercase tracking-[0.3em] text-white/40 mb-2">Lighting Scheme</h4>
                            <p className="text-neutral-300">{activeCollection.strategy.lightingStrategy}</p>
                          </section>
                          
                          <section>
                            <h4 className="text-xs uppercase tracking-[0.3em] text-white/40 mb-2">Sonic Atmosphere</h4>
                            <p className="text-neutral-300">{activeCollection.strategy.musicAtmosphere}</p>
                          </section>

                          <section>
                            <h4 className="text-xs uppercase tracking-[0.3em] text-white/40 mb-3">Material Palette</h4>
                            <div className="flex flex-wrap gap-2">
                              {activeCollection.strategy.materialsUsed.map(mat => (
                                <span key={mat} className="px-3 py-1 border border-neutral-700 text-neutral-400 text-xs rounded-full uppercase tracking-widest">{mat}</span>
                              ))}
                            </div>
                          </section>
                        </div>
                        
                        <div className="pt-6">
                           <Button 
                             variant="outline" 
                             className="w-full text-xs"
                             onClick={handleCuration}
                             isLoading={isGenerating}
                           >
                            Regenerate Concept
                           </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-800 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-6 text-center space-y-4">
          <p className="text-xs text-neutral-600 uppercase tracking-[0.4em]">Designed for the Vanguard of Fashion</p>
          <p className="text-neutral-400 text-sm">VogueCurate &copy; 2024. Elevate the art of the exhibition.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
