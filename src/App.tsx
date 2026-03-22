import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Image as ImageIcon, Wand2, Loader2, Download, Trash2, Key, Sun, Moon, Lightbulb } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';

interface Photo {
  id: string;
  file: File;
  originalUrl: string;
  transformedUrl?: string;
  status: 'idle' | 'transforming' | 'done' | 'error';
  error?: string;
}

export default function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const checkKey = async () => {
      try {
        if ((window as any).aistudio?.hasSelectedApiKey) {
          const selected = await (window as any).aistudio.hasSelectedApiKey();
          setHasKey(selected);
        } else {
          setHasKey(true);
        }
      } catch (e) {
        setHasKey(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    try {
      if ((window as any).aistudio?.openSelectKey) {
        await (window as any).aistudio.openSelectKey();
      }
    } catch (e) {
      console.error(e);
    } finally {
      // Assume success due to race condition
      setHasKey(true);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (files: File[]) => {
    const newPhotos = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      originalUrl: URL.createObjectURL(file),
      status: 'idle' as const,
    }));
    setPhotos(prev => [...prev, ...newPhotos]);
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const removePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = error => reject(error);
    });
  };

  const transformPhoto = async (id: string) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, status: 'transforming', error: undefined } : p));
    
    const photo = photos.find(p => p.id === id);
    if (!photo) return;

    try {
      // Create a new GoogleGenAI instance right before making an API call
      const apiKey = (process.env as any).API_KEY || (process.env as any).GEMINI_API_KEY;
      const ai = new GoogleGenAI({ apiKey: apiKey });
      
      const base64Data = await fileToBase64(photo.file);
      
      const promptText = customPrompt.trim()
        ? `Transform this product photo. User instructions: ${customPrompt.trim()}. Ensure it looks like a professional studio quality image with perfect lighting and sharp focus.`
        : 'Transform this product photo into a professional studio quality image. Ensure perfect, even lighting, sharp focus, and place the product on a clean, seamless white background. Enhance the details and colors to make it look premium and ready for e-commerce.';

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: photo.file.type,
              },
            },
            {
              text: promptText,
            },
          ],
        },
      });

      let transformedUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          transformedUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (transformedUrl) {
        setPhotos(prev => prev.map(p => p.id === id ? { ...p, status: 'done', transformedUrl } : p));
      } else {
        throw new Error('No image returned from the model');
      }
    } catch (error: any) {
      console.error('Transformation error:', error);
      if (error.message?.includes('Requested entity was not found.')) {
        setHasKey(false);
        setPhotos(prev => prev.map(p => p.id === id ? { ...p, status: 'error', error: 'Clave API no encontrada o inválida. Por favor, selecciona una nueva.' } : p));
        return;
      }
      setPhotos(prev => prev.map(p => p.id === id ? { ...p, status: 'error', error: error.message || 'Transformation failed' } : p));
    }
  };

  const transformAll = async () => {
    const idlePhotos = photos.filter(p => p.status === 'idle' || p.status === 'error');
    for (const photo of idlePhotos) {
      await transformPhoto(photo.id);
    }
  };

  if (hasKey === null) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-black flex items-center justify-center transition-colors duration-300">
        <Loader2 className="w-8 h-8 animate-spin text-black dark:text-white" />
      </div>
    );
  }

  if (hasKey === false) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-black flex flex-col items-center justify-center p-4 font-sans text-neutral-900 dark:text-neutral-200 transition-colors duration-300">
        <div className="bg-white dark:bg-[#0A0A0A] p-8 rounded-2xl border border-neutral-200 dark:border-neutral-800 max-w-md w-full text-center transition-colors duration-300">
          <div className="w-16 h-16 bg-neutral-100 dark:bg-neutral-900 rounded-full flex items-center justify-center mx-auto mb-6 border border-neutral-200 dark:border-neutral-800 transition-colors duration-300">
            <Key className="w-8 h-8 text-black dark:text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-4 text-black dark:text-white">Requiere Clave API Pro</h2>
          <p className="text-neutral-600 dark:text-neutral-400 mb-6 leading-relaxed">
            Para usar <strong>Nano Banana Pro</strong> (Gemini 3 Pro Image), necesitas seleccionar una clave API de un proyecto de Google Cloud con facturación habilitada.
            <br/><br/>
            Consulta la <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-black dark:text-white hover:underline font-medium">documentación de facturación</a> para más detalles.
          </p>
          <button
            onClick={handleSelectKey}
            className="bg-black text-white dark:bg-white dark:text-black px-6 py-3 rounded-lg font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors w-full"
          >
            Seleccionar Clave API
          </button>
        </div>
      </div>
    );
  }

  const hasPhotos = photos.length > 0;
  const hasTransformedOrTransforming = photos.some(p => p.status !== 'idle');
  const canTransform = photos.some(p => p.status === 'idle' || p.status === 'error');

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-200 font-sans p-4 md:p-8 selection:bg-neutral-200 dark:selection:bg-neutral-800 selection:text-black dark:selection:text-white transition-colors duration-300">
      <header className="max-w-7xl mx-auto mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black dark:bg-white rounded-lg flex items-center justify-center transition-colors duration-300">
            <Wand2 className="w-5 h-5 text-white dark:text-black" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-black dark:text-white">ProStudio AI (Pro)</h1>
        </div>
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="p-2 rounded-lg bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white transition-colors shadow-sm dark:shadow-none"
          title={isDarkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        >
          {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Upload & Originals */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-white dark:bg-[#0A0A0A] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 transition-colors duration-300 shadow-sm dark:shadow-none">
            <h2 className="text-base font-medium mb-4 text-black dark:text-white">1. Sube tus fotos</h2>
            
            {/* Upload Area */}
            <div
              className={`border border-dashed rounded-xl p-8 text-center transition-all cursor-pointer mb-6 ${
                isDragging 
                  ? 'border-black bg-neutral-100 dark:border-white dark:bg-neutral-900' 
                  : 'border-neutral-300 bg-neutral-50 hover:border-neutral-400 hover:bg-neutral-100/50 dark:border-neutral-700 dark:bg-[#0A0A0A] dark:hover:border-neutral-500 dark:hover:bg-neutral-900/50'
              }`}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*"
                multiple
              />
              <div className="w-12 h-12 bg-white dark:bg-neutral-900 rounded-full flex items-center justify-center mx-auto mb-3 border border-neutral-200 dark:border-neutral-800 transition-colors duration-300">
                <Upload className="w-5 h-5 text-neutral-500 dark:text-neutral-300" />
              </div>
              <p className="text-neutral-700 dark:text-neutral-300 font-medium text-sm">Arrastra tus fotos aquí</p>
              <p className="text-neutral-500 text-xs mt-1">o haz clic para buscar</p>
            </div>

            {/* Original Photos List */}
            {hasPhotos && (
              <div className="space-y-3">
                <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Fotos Originales</h3>
                <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                  <AnimatePresence>
                    {photos.map(photo => (
                      <motion.div
                        key={`orig-${photo.id}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex items-center gap-4 bg-neutral-50 dark:bg-neutral-900/50 p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 transition-colors duration-300"
                      >
                        <img src={photo.originalUrl} alt="Original" className="w-12 h-12 object-cover rounded bg-neutral-200 dark:bg-neutral-900" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-200 truncate">{photo.file.name}</p>
                          <p className="text-xs text-neutral-500">
                            {photo.status === 'idle' ? 'Lista para transformar' : 
                             photo.status === 'transforming' ? 'Procesando...' : 
                             photo.status === 'done' ? 'Transformada' : 'Error'}
                          </p>
                        </div>
                        <button
                          onClick={() => removePhoto(photo.id)}
                          className="p-2 text-neutral-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-white hover:bg-red-50 dark:hover:bg-neutral-800 rounded-md transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>

          {/* NANO BANANA PROMPT BOX */}
          <div className="bg-amber-50/30 dark:bg-[#0A0A0A] rounded-2xl border border-amber-200 dark:border-amber-500/20 p-6 relative overflow-hidden group hover:border-amber-300 dark:hover:border-amber-500/40 transition-colors duration-300 shadow-sm dark:shadow-none">
            <div className="absolute -top-8 -right-8 text-8xl opacity-10 dark:opacity-5 pointer-events-none grayscale group-hover:grayscale-0 transition-all duration-500">🍌</div>
            <h2 className="text-base font-medium mb-2 text-amber-700 dark:text-amber-500 flex items-center gap-2">
              <span className="text-xl">🍌</span> 2. Caja de Nano Banana
            </h2>
            <p className="text-xs text-amber-600/80 dark:text-neutral-400 mb-4">
              Dile a Nano Banana Pro cómo quieres que transforme tu producto (Opcional).
            </p>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Ej: Fondo de mármol negro, iluminación dramática, estilo minimalista..."
              className="w-full p-3 rounded-lg border border-amber-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 focus:border-amber-400 dark:focus:border-amber-500/50 focus:ring-1 focus:ring-amber-400/20 dark:focus:ring-amber-500/20 outline-none resize-none transition-all text-sm text-neutral-800 dark:text-neutral-200 placeholder-amber-700/30 dark:placeholder-neutral-600"
              rows={3}
            />
          </div>

          {/* BIG TRANSFORM BUTTON */}
          <button
            onClick={transformAll}
            disabled={!canTransform}
            className={`w-full py-4 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all duration-300 ${
              canTransform 
                ? 'bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 shadow-md dark:shadow-none' 
                : 'bg-neutral-100 text-neutral-400 border border-neutral-200 dark:bg-neutral-900 dark:text-neutral-600 dark:border-neutral-800 cursor-not-allowed'
            }`}
          >
            <Wand2 className="w-4 h-4" />
            Transformar Fotos
          </button>
        </div>

        {/* RIGHT COLUMN: Converted Photos Box */}
        <div className="lg:col-span-7 flex flex-col">
          <div className="bg-white dark:bg-[#0A0A0A] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 flex-1 flex flex-col transition-colors duration-300 shadow-sm dark:shadow-none">
            <h2 className="text-base font-medium mb-4 text-black dark:text-white flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
              Caja de Fotos Convertidas
            </h2>
            
            <div className={`flex-1 rounded-xl border transition-colors duration-300 ${hasTransformedOrTransforming ? 'border-solid border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/20 p-4' : 'border-dashed border-neutral-300 bg-neutral-50/50 dark:border-neutral-800 dark:bg-transparent flex items-center justify-center p-12'}`}>
              
              {!hasTransformedOrTransforming ? (
                <div className="max-w-md mx-auto w-full">
                  <div className="text-center mb-10">
                    <div className="w-16 h-16 bg-white dark:bg-neutral-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-neutral-200 dark:border-neutral-800 transition-colors duration-300 shadow-sm">
                      <ImageIcon className="w-6 h-6 text-neutral-400 dark:text-neutral-500" />
                    </div>
                    <h3 className="text-neutral-700 dark:text-neutral-300 font-medium text-sm">Aún no hay fotos convertidas</h3>
                    <p className="text-neutral-500 text-xs mt-2">Sube tus fotos y presiona transformar para ver los resultados.</p>
                  </div>
                  
                  <div className="bg-white dark:bg-[#0A0A0A] rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 shadow-sm transition-colors duration-300">
                    <h4 className="text-sm font-medium mb-5 text-neutral-800 dark:text-neutral-200 flex items-center gap-2 justify-center">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      Guía para mejorar tus imágenes
                    </h4>
                    <ul className="space-y-4 text-xs text-neutral-600 dark:text-neutral-400">
                      <li className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0 mt-0.5 font-medium text-neutral-500">1</div>
                        <span className="leading-relaxed"><strong>Iluminación:</strong> Sube fotos donde el producto esté bien iluminado y sin sombras muy duras o reflejos extremos.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0 mt-0.5 font-medium text-neutral-500">2</div>
                        <span className="leading-relaxed"><strong>Encuadre:</strong> Deja un poco de espacio alrededor del producto para que la IA pueda generar el fondo correctamente sin cortar los bordes.</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0 mt-0.5 font-medium text-neutral-500">3</div>
                        <span className="leading-relaxed"><strong>Instrucciones:</strong> Sé específico en la Caja de Nano Banana. En lugar de "fondo bonito", prueba con "fondo de madera rústica con hojas verdes desenfocadas".</span>
                      </li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <AnimatePresence>
                    {photos.filter(p => p.status !== 'idle').map(photo => (
                      <motion.div
                        key={`conv-${photo.id}`}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white dark:bg-[#0A0A0A] rounded-xl p-2 border border-neutral-200 dark:border-neutral-800 flex flex-col transition-colors duration-300 shadow-sm dark:shadow-none"
                      >
                        <div className="aspect-square rounded-lg bg-neutral-100 dark:bg-neutral-900 relative overflow-hidden flex items-center justify-center mb-2 border border-neutral-200/50 dark:border-neutral-800/50 transition-colors duration-300">
                          {photo.status === 'done' && photo.transformedUrl ? (
                            <>
                              <img src={photo.transformedUrl} alt="Convertida" className="w-full h-full object-contain" />
                              <div className="absolute top-2 left-2 bg-white/90 dark:bg-black/80 backdrop-blur-md border border-neutral-200 dark:border-neutral-700 text-black dark:text-white text-[9px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wider transition-colors duration-300">
                                Estudio Pro
                              </div>
                            </>
                          ) : photo.status === 'transforming' ? (
                            <div className="flex flex-col items-center text-neutral-500 dark:text-neutral-400">
                              <Loader2 className="w-6 h-6 animate-spin mb-2 text-black dark:text-white" />
                              <span className="text-[10px] font-medium uppercase tracking-widest">Generando...</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center text-red-500 dark:text-red-400 p-4 text-center">
                              <span className="text-[10px] font-medium uppercase mb-1">Error</span>
                              <span className="text-[10px] opacity-80">{photo.error}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-between mt-auto px-1">
                          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400 truncate pr-2">
                            {photo.file.name}
                          </span>
                          {photo.status === 'done' && photo.transformedUrl && (
                            <a
                              href={photo.transformedUrl}
                              download={`studio-pro-${photo.file.name}`}
                              className="text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                              title="Descargar foto"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
