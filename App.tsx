import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { ModelData, SceneData, ReferenceData, OverlayData, LocksState, ModelCreatorLocks, SceneLocks } from './types';
import { GENDER_OPTIONS, EXPRESSION_OPTIONS, LIGHTING_OPTIONS, MOOD_OPTIONS, NATIONALITY_OPTIONS, SHOT_TYPE_OPTIONS, INDOOR_PRESET_OPTIONS, ASPECT_RATIO_OPTIONS, MODERN_OUTFITS, AUTHENTIC_OUTFITS, SENSUAL_POSES, NON_SENSUAL_POSES, BODY_SHAPE_OPTIONS } from './constants';
import { generateAIImage, adaptScenePreset, generateLocalRandomization, generateSmartRandomization } from './services/geminiService';
import Card from './components/Card';
import Button from './components/Button';
import Input from './components/Input';
import Select from './components/Select';
import Textarea from './components/Textarea';
import Checkbox from './components/Checkbox';
import ImageUpload from './components/ImageUpload';
import OverlayControl from './components/OverlayControl';
import LockButton from './components/LockButton';

const initialModelData: ModelData = {
  description: 'A young woman with long black hair',
  gender: GENDER_OPTIONS[0],
  age: 25,
  bodyShape: BODY_SHAPE_OPTIONS[0],
  expression: EXPRESSION_OPTIONS[0],
  outfit: 'White linen shirt',
  outfitColor: 'any',
  tones: '',
  pose: 'Standing naturally',
  isSensual: false,
};

const initialSceneData: SceneData = {
  location: 'A cozy corner of a sunlit library',
  lighting: LIGHTING_OPTIONS[0],
  mood: MOOD_OPTIONS[0],
  details: 'Dust particles floating in the light rays, shelves filled with old books',
  shotType: SHOT_TYPE_OPTIONS[0],
};

const initialLocksState: LocksState = {
  global: false,
  generationMode: false,
  overallStyle: false,
  modelType: false,
  country: false,
  referencePhoto: false,
  overlays: false,
  modelCreator: {
    all: false,
    gender: false,
    age: false,
    expression: false,
    description: false,
    outfit: false,
    outfitColor: false,
    pose: false,
    tones: false,
    bodyShape: false,
  },
  composition: false,
  generationEngine: false,
  scene: {
    all: false,
    location: false,
    lighting: false,
    mood: false,
    details: false,
  },
};

const generationLoadingMessages = [
  "Contacting the AI studio...",
  "Building a new model from scratch...",
  "Setting up the lighting and mood...",
  "Applying the final touches... Almost there!",
];

const App: React.FC = () => {
  const [model, setModel] = useState<ModelData>(initialModelData);
  const [scene, setScene] = useState<SceneData>(initialSceneData);
  const [nationality, setNationality] = useState<string>(NATIONALITY_OPTIONS[0]);
  const [overallStyle, setOverallStyle] = useState<'modern' | 'authentic'>('modern');
  const [modelType, setModelType] = useState<'professional' | 'natural'>('professional');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '3:4' | '9:16'>('1:1');
  const [generationTier, setGenerationTier] = useState<'premium' | 'standard'>('standard');
  const [isCountryRandom, setIsCountryRandom] = useState<boolean>(false);
  const [reference, setReference] = useState<ReferenceData>({
    photo: null,
    usePhoto: false,
    useStyle: false,
    useComposition: false,
    keepOverlays: false,
  });
  const [overlays, setOverlays] = useState<OverlayData[]>([]);
  const [locks, setLocks] = useState<LocksState>(initialLocksState);

  const [generatedImages, setGeneratedImages] = useState<string[] | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [compositeImage, setCompositeImage] = useState<string | null>(null);
  const [generatingCount, setGeneratingCount] = useState<0 | 1 | 4>(0);
  const [isAdaptingScene, setIsAdaptingScene] = useState<boolean>(false);
  const [isRandomizingModel, setIsRandomizingModel] = useState<boolean>(false);
  const [isRandomizingScene, setIsRandomizingScene] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>(generationLoadingMessages[0]);
  
  const loadingIntervalRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const isLoading = generatingCount > 0;
  const anyLoading = isLoading || isAdaptingScene || isRandomizingModel || isRandomizingScene;

  const handleToggleLock = useCallback((section: keyof Omit<LocksState, 'global' | 'modelCreator' | 'scene'>) => {
    setLocks(prev => {
      const newLocks = { ...prev, [section]: !prev[section] };
      if (prev[section]) { // If unlocking a section
        newLocks.global = false;
      } else { // If locking a section, check if all others are locked
        const allLocked = Object.keys(newLocks)
          .filter(k => k !== 'global' && k !== 'modelCreator' && k !== 'scene')
          .every(k => newLocks[k as keyof Omit<LocksState, 'global' | 'modelCreator' | 'scene'>]);
        if (allLocked && newLocks.modelCreator.all && newLocks.scene.all) {
          newLocks.global = true;
        }
      }
      return newLocks;
    });
  }, []);

  const handleToggleModelCreatorFieldLock = useCallback((field: keyof Omit<ModelCreatorLocks, 'all'>) => {
    setLocks(prev => {
        const newFieldState = !prev.modelCreator[field];
        const newModelCreatorLocks = { ...prev.modelCreator, [field]: newFieldState };

        if (!newFieldState) {
            newModelCreatorLocks.all = false;
            return { ...prev, global: false, modelCreator: newModelCreatorLocks };
        }

        const allFieldsLocked = Object.keys(newModelCreatorLocks)
            .filter(k => k !== 'all')
            .every(k => newModelCreatorLocks[k as keyof Omit<ModelCreatorLocks, 'all'>]);
        if (allFieldsLocked) {
            newModelCreatorLocks.all = true;
        }
        
        return { ...prev, modelCreator: newModelCreatorLocks };
    });
  }, []);

  const handleToggleModelCreatorMasterLock = useCallback(() => {
    setLocks(prev => {
      const newAllState = !prev.modelCreator.all;
      return {
        ...prev,
        modelCreator: {
          all: newAllState,
          gender: newAllState,
          age: newAllState,
          expression: newAllState,
          description: newAllState,
          outfit: newAllState,
          outfitColor: newAllState,
          pose: newAllState,
          tones: newAllState,
          bodyShape: newAllState,
        }
      };
    });
  }, []);

  const handleToggleSceneFieldLock = useCallback((field: keyof Omit<SceneLocks, 'all'>) => {
    setLocks(prev => {
        const newFieldState = !prev.scene[field];
        const newSceneLocks = { ...prev.scene, [field]: newFieldState };

        if (!newFieldState) { // If unlocking
            newSceneLocks.all = false;
            return { ...prev, global: false, scene: newSceneLocks };
        }

        // If locking, check if all others are locked
        const allFieldsLocked = Object.keys(newSceneLocks)
            .filter(k => k !== 'all')
            .every(k => newSceneLocks[k as keyof Omit<SceneLocks, 'all'>]);
        if (allFieldsLocked) {
            newSceneLocks.all = true;
        }
        
        return { ...prev, scene: newSceneLocks };
    });
  }, []);

  const handleToggleSceneMasterLock = useCallback(() => {
      setLocks(prev => {
          const newAllState = !prev.scene.all;
          return {
              ...prev,
              scene: {
                  all: newAllState,
                  location: newAllState,
                  lighting: newAllState,
                  mood: newAllState,
                  details: newAllState,
              }
          };
      });
  }, []);

  const handleToggleGlobalLock = useCallback(() => {
    setLocks(prev => {
      const newGlobalState = !prev.global;
      return {
        global: newGlobalState,
        generationMode: newGlobalState,
        overallStyle: newGlobalState,
        modelType: newGlobalState,
        country: newGlobalState,
        referencePhoto: newGlobalState,
        overlays: newGlobalState,
        modelCreator: {
          all: newGlobalState,
          gender: newGlobalState,
          age: newGlobalState,
          expression: newGlobalState,
          description: newGlobalState,
          outfit: newGlobalState,
          outfitColor: newGlobalState,
          pose: newGlobalState,
          tones: newGlobalState,
          bodyShape: newGlobalState,
        },
        composition: newGlobalState,
        generationEngine: newGlobalState,
        scene: {
          all: newGlobalState,
          location: newGlobalState,
          lighting: newGlobalState,
          mood: newGlobalState,
          details: newGlobalState,
        },
      };
    });
  }, []);

  useEffect(() => {
    if (reference.usePhoto || !generatedImages || generatedImages.length === 0) {
      setCompositeImage(null);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const loadImage = (src: string): Promise<HTMLImageElement> => 
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = src;
      });

    const drawCompositeImage = async () => {
      try {
        const selectedImage = generatedImages[selectedImageIndex];
        if (!selectedImage) return;

        const baseImg = await loadImage(`data:image/png;base64,${selectedImage}`);
        canvas.width = baseImg.width;
        canvas.height = baseImg.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(baseImg, 0, 0);

        const activeOverlays = overlays.filter(o => o.file && o.preview);
        
        if (activeOverlays.length > 0) {
          const overlayImages = await Promise.all(
            activeOverlays.map(o => loadImage(o.preview!))
          );
          
          overlayImages.forEach((overlayImg, index) => {
            const overlayData = activeOverlays[index];
            const scale = overlayData.scale / 100;
            const w = overlayImg.width * scale;
            const h = overlayImg.height * scale;
            const x = (overlayData.x / 100) * canvas.width - w / 2;
            const y = (overlayData.y / 100) * canvas.height - h / 2;
            ctx.drawImage(overlayImg, x, y, w, h);
          });
        }
        
        setCompositeImage(canvas.toDataURL('image/png'));
      } catch (err) {
        console.error("Error composing image on canvas:", err);
        setError("Failed to load an overlay image. Please try re-uploading it.");
      }
    };

    drawCompositeImage();
  }, [generatedImages, selectedImageIndex, overlays, reference.usePhoto]);

  const handleModelChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const isCheckbox = type === 'checkbox';
    const inputValue = isCheckbox 
      ? (e.target as HTMLInputElement).checked 
      : (name === 'age' ? parseInt(value, 10) : value);
      
    setModel(prev => ({ ...prev, [name]: inputValue }));
  };

  const handleOutfitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = e.target;
    if (value === 'RANDOMIZE_OUTFIT') {
        setError(null);
        const randomData = generateLocalRandomization({ model: ['outfit'], scene: [] }, model, scene, overallStyle);
        if (randomData.outfit) {
            setModel(prev => ({ ...prev, outfit: randomData.outfit }));
        }
    } else {
        setModel(prev => ({ ...prev, outfit: value }));
    }
  };

  const handlePoseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = e.target;
    if (value === 'RANDOMIZE_POSE') {
        setError(null);
        const randomData = generateLocalRandomization({ model: ['pose'], scene: [] }, model, scene, overallStyle);
        if (randomData.pose) {
          setModel(prev => ({ ...prev, pose: randomData.pose }));
        }
    } else {
        setModel(prev => ({ ...prev, pose: value }));
    }
  };

  const handleNationalityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCountry = e.target.value;
    setNationality(newCountry);
  };
  
  const handleCountryRandomizationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsCountryRandom(e.target.checked);
  };

  const handleSceneChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setScene(prev => ({ ...prev, [name]: value }));
  };
  
  const handleScenePresetChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const presetName = e.target.value;
    if (!presetName) return;
  
    e.target.value = "";
  
    if (presetName === 'RANDOMIZE_INDOOR') {
      setError(null);
      const unlockedSceneFields = (Object.keys(locks.scene) as Array<keyof SceneLocks>)
          .filter((key): key is Exclude<keyof SceneLocks, 'all'> => key !== 'all' && !locks.scene[key]);
      
      const fieldsToRandomize: (keyof Omit<SceneLocks, 'all'>)[] = unlockedSceneFields.length > 0 ? unlockedSceneFields : ['location', 'lighting', 'mood', 'details'];
      
      const randomIndoorData = generateLocalRandomization(
          { model: [], scene: fieldsToRandomize },
          model,
          scene,
          overallStyle
      );
      setScene(prev => ({ ...prev, ...randomIndoorData, location: `(Indoor) ${randomIndoorData.location}` }));
      return;
    }
  
    const preset = INDOOR_PRESET_OPTIONS.find(p => p.name === presetName);
    if (!preset) return;
  
    setIsAdaptingScene(true);
    setError(null);
    
    setScene(prev => ({ ...prev, ...preset.data }));
    
    try {
      const adaptedData = await adaptScenePreset(process.env.API_KEY!, preset.data, nationality);
      setScene(prev => ({ ...prev, ...preset.data, ...adaptedData }));
    } catch (err: any) {
      setError(err.message || 'Failed to adapt scene. Using default preset values.');
    } finally {
      setIsAdaptingScene(false);
    }
  };

  const handleReferenceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setReference(prev => {
        const newState = { ...prev, [name]: checked };
        if (name === 'usePhoto' && !checked) {
            newState.photo = null;
            newState.useStyle = false;
            newState.useComposition = false;
            newState.keepOverlays = false;
        }
        return newState;
    });
  };
  
  const handleFileChange = (file: File | null) => {
    setReference(prev => ({...prev, photo: file}));
    if (file) {
      setOverlays([]);
      setCompositeImage(null);
    }
  };

  const handleOverlayFileChange = (id: number, file: File | null) => {
    if (!file) {
      setOverlays(prev => prev.map(o => o.id === id ? { ...o, file: null, preview: null } : o));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setOverlays(prev => prev.map(o => o.id === id ? { ...o, file, preview: reader.result as string } : o));
    };
    reader.readAsDataURL(file);
  };

  const handleOverlayPropChange = (id: number, field: 'x' | 'y' | 'scale', value: string) => {
    setOverlays(prev => prev.map(o => o.id === id ? { ...o, [field]: Number(value) } : o));
  };
  
  const handleAddOverlay = () => {
    if (overlays.length < 5) {
      const newOverlay: OverlayData = {
        id: Date.now(),
        file: null,
        preview: null,
        x: 50,
        y: 50,
        scale: 20,
      };
      setOverlays(prev => [...prev, newOverlay]);
    }
  };

  const handleRandomizeDescription = () => {
    setError(null);
    const randomData = generateLocalRandomization({ model: ['description'], scene: [] }, model, scene, overallStyle);
    if (randomData.description) {
      setModel(prev => ({ ...prev, description: randomData.description }));
    }
  };

  const handleRandomizeModel = async () => {
    setError(null);
    const effectiveCountry = isCountryRandom
      ? NATIONALITY_OPTIONS[Math.floor(Math.random() * NATIONALITY_OPTIONS.length)]
      : nationality;
    
    if (isCountryRandom) {
      setNationality(effectiveCountry);
    }

    const unlockedModelFields = (Object.keys(locks.modelCreator) as Array<keyof ModelCreatorLocks>)
        .filter((key): key is Exclude<keyof ModelCreatorLocks, 'all'> => key !== 'all' && !locks.modelCreator[key]);

    if (unlockedModelFields.length === 0) return;
    
    setIsRandomizingModel(true);
    try {
        const randomData = await generateSmartRandomization(
            process.env.API_KEY!,
            { model: unlockedModelFields, scene: [] },
            model,
            scene,
            effectiveCountry,
            overallStyle,
            modelType
        );
        setModel(prev => ({ ...prev, ...randomData }));
    } catch (err: any) {
        setError(err.message || 'Failed to randomize model.');
    } finally {
        setIsRandomizingModel(false);
    }
  };

  const handleRandomizeScene = async () => {
    setError(null);
    const effectiveCountry = isCountryRandom
      ? NATIONALITY_OPTIONS[Math.floor(Math.random() * NATIONALITY_OPTIONS.length)]
      : nationality;
    
    if (isCountryRandom) {
      setNationality(effectiveCountry);
    }
    
    const unlockedSceneFields = (Object.keys(locks.scene) as Array<keyof SceneLocks>)
      .filter((key): key is Exclude<keyof SceneLocks, 'all'> => key !== 'all' && !locks.scene[key]);
    
    if (unlockedSceneFields.length === 0) return;

    setIsRandomizingScene(true);
    try {
        const randomData = await generateSmartRandomization(
            process.env.API_KEY!,
            { model: [], scene: unlockedSceneFields },
            model,
            scene,
            effectiveCountry,
            overallStyle,
            modelType
        );
        setScene(prev => ({ ...prev, ...randomData }));
    } catch (err: any) {
        setError(err.message || 'Failed to randomize scene.');
    } finally {
        setIsRandomizingScene(false);
    }
  };

  const handleGenerateImage = useCallback(async (numImages: 1 | 4) => {
    if (!process.env.API_KEY) {
        setError("API key is not set. Please configure your environment.");
        return;
    }
    setGeneratingCount(numImages);
    setError(null);
    setGeneratedImages(null);
    setCompositeImage(null);

    if (loadingIntervalRef.current) {
        clearInterval(loadingIntervalRef.current);
    }

    try {
        let modelToUse = model;
        let sceneToUse = scene;
        let countryToUse = nationality;

        if (isCountryRandom) {
            countryToUse = NATIONALITY_OPTIONS[Math.floor(Math.random() * NATIONALITY_OPTIONS.length)];
            setNationality(countryToUse);
        }

        const unlockedModelFields = (Object.keys(locks.modelCreator) as Array<keyof ModelCreatorLocks>)
            .filter((key): key is Exclude<keyof ModelCreatorLocks, 'all'> => key !== 'all' && !locks.modelCreator[key]);
        const unlockedSceneFields = (Object.keys(locks.scene) as Array<keyof SceneLocks>)
            .filter((key): key is Exclude<keyof SceneLocks, 'all'> => key !== 'all' && !locks.scene[key]);

        if (unlockedModelFields.length > 0 || unlockedSceneFields.length > 0) {
            setLoadingMessage("Adding a creative, culturally-aware twist...");
            const randomData = await generateSmartRandomization(
                process.env.API_KEY,
                { model: unlockedModelFields, scene: unlockedSceneFields },
                model,
                scene,
                countryToUse,
                overallStyle,
                modelType
            );

            modelToUse = { ...model, ...randomData };
            sceneToUse = { ...scene, ...randomData };
            setModel(modelToUse);
            setScene(sceneToUse);
        }

        let messageIndex = 0;
        setLoadingMessage(generationLoadingMessages[messageIndex]);
        const intervalId = window.setInterval(() => {
            messageIndex = (messageIndex + 1) % generationLoadingMessages.length;
            setLoadingMessage(generationLoadingMessages[messageIndex]);
        }, 3000);
        loadingIntervalRef.current = intervalId;

        const imagesData = await generateAIImage(process.env.API_KEY, modelToUse, sceneToUse, reference, countryToUse, overallStyle, modelType, aspectRatio, numImages, generationTier);
        setGeneratedImages(imagesData);
        setSelectedImageIndex(0);

    } catch (err: any) {
        setError(err.message || 'An unexpected error occurred.');
    } finally {
        setGeneratingCount(0);
        if (loadingIntervalRef.current) {
            clearInterval(loadingIntervalRef.current);
            loadingIntervalRef.current = null;
        }
    }
}, [model, scene, reference, nationality, isCountryRandom, overallStyle, modelType, aspectRatio, generationTier, locks]);
  
  const handleDownloadImage = () => {
    const selectedImage = generatedImages ? generatedImages[selectedImageIndex] : null;
    const imageToDownload = compositeImage || (selectedImage ? `data:image/png;base64,${selectedImage}` : null);

    if (imageToDownload) {
      const link = document.createElement('a');
      link.href = imageToDownload;
      link.download = 'ai-generated-image.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };
  
  const selectedImage = generatedImages ? generatedImages[selectedImageIndex] : null;
  const finalImage = compositeImage || (selectedImage ? `data:image/png;base64,${selectedImage}` : null);
  const outfitOptions = overallStyle === 'modern' ? MODERN_OUTFITS : AUTHENTIC_OUTFITS;
  const poseOptions = model.isSensual ? SENSUAL_POSES : NON_SENSUAL_POSES;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans p-4 sm:p-6 lg:p-8">
      <style>{`
        .animate-fade-in {
          animation: fadeIn 0.5s ease-in-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .segmented-control button[aria-selected="true"] {
          background-color: #4f46e5;
          color: white;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
        }
        .segmented-control button {
          background-color: #e5e7eb;
          color: #374151;
        }
      `}</style>
      <canvas ref={canvasRef} className="hidden"></canvas>
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900">AI Studio Image Generator</h1>
          <p className="mt-2 text-lg text-gray-600">Generate realistic, studio-style images from your reference photo and descriptions.</p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div className="w-full space-y-8">
            <Card>
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-semibold">Global Settings Lock</h2>
                  <p className="text-sm text-gray-500 mt-1">Lock all settings below to prevent accidental changes.</p>
                </div>
                <button
                  onClick={handleToggleGlobalLock}
                  disabled={anyLoading}
                  className={`p-3 rounded-full transition-all duration-300 ease-in-out transform hover:scale-110 active:scale-95 ${locks.global ? 'bg-indigo-600 text-white shadow-lg' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                  aria-label={locks.global ? 'Unlock all settings' : 'Lock all settings'}
                >
                  {locks.global ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </Card>

            <Card>
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                  <h2 className="text-2xl font-semibold">1. Generation Mode</h2>
                  <LockButton locked={locks.generationMode} onClick={() => handleToggleLock('generationMode')} disabled={anyLoading} />
                </div>
                <div className={`space-y-4 ${locks.generationMode ? 'opacity-50' : ''}`}>
                  <Checkbox 
                    label="Enable Sensual Mode" 
                    id="isSensual" 
                    name="isSensual" 
                    checked={model.isSensual} 
                    onChange={handleModelChange} 
                    disabled={anyLoading || locks.generationMode}
                  />
                </div>
            </Card>

            <Card>
              <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h2 className="text-2xl font-semibold">2. Overall Style</h2>
                <LockButton locked={locks.overallStyle} onClick={() => handleToggleLock('overallStyle')} disabled={anyLoading} />
              </div>
              <div className={locks.overallStyle ? 'opacity-50' : ''}>
                <p className="text-sm text-gray-600 mb-4">Choose the global aesthetic for the clothing, architecture, and mood.</p>
                <div className="flex rounded-lg p-1 bg-gray-200 w-full md:w-auto segmented-control">
                  <button 
                    onClick={() => setOverallStyle('modern')}
                    aria-selected={overallStyle === 'modern'}
                    className="px-4 py-2 text-sm font-semibold rounded-md flex-1 transition-colors"
                    disabled={anyLoading || locks.overallStyle}
                  >
                    Modern
                  </button>
                  <button 
                    onClick={() => setOverallStyle('authentic')}
                    aria-selected={overallStyle === 'authentic'}
                    className="px-4 py-2 text-sm font-semibold rounded-md flex-1 transition-colors"
                    disabled={anyLoading || locks.overallStyle}
                  >
                    Authentic
                  </button>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h2 className="text-2xl font-semibold">3. Model Type</h2>
                 <LockButton locked={locks.modelType} onClick={() => handleToggleLock('modelType')} disabled={anyLoading} />
              </div>
              <div className={locks.modelType ? 'opacity-50' : ''}>
                <p className="text-sm text-gray-600 mb-4">Choose the subject's persona to influence their expression and pose.</p>
                <div className="flex rounded-lg p-1 bg-gray-200 w-full md:w-auto segmented-control">
                  <button 
                    onClick={() => setModelType('professional')}
                    aria-selected={modelType === 'professional'}
                    className="px-4 py-2 text-sm font-semibold rounded-md flex-1 transition-colors"
                    disabled={anyLoading || locks.modelType}
                  >
                    Professional Model
                  </button>
                  <button 
                    onClick={() => setModelType('natural')}
                    aria-selected={modelType === 'natural'}
                    className="px-4 py-2 text-sm font-semibold rounded-md flex-1 transition-colors"
                    disabled={anyLoading || locks.modelType}
                  >
                    Normal Person
                  </button>
                </div>
              </div>
            </Card>

            <Card>
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                  <h2 className="text-2xl font-semibold">4. Country Reference</h2>
                  <LockButton locked={locks.country} onClick={() => handleToggleLock('country')} disabled={anyLoading} />
                </div>
                <div className={`space-y-4 ${locks.country ? 'opacity-50' : ''}`}>
                  <p className="text-sm text-gray-600">Select a country or let the AI choose one randomly. This sets the context for the model's ethnicity and scene's location.</p>
                  <Select 
                    label="Reference Country" 
                    id="nationality" 
                    name="nationality" 
                    value={nationality} 
                    onChange={handleNationalityChange} 
                    options={NATIONALITY_OPTIONS} 
                    disabled={anyLoading || isCountryRandom || locks.country}
                  />
                  <Checkbox
                    label="Randomize Country"
                    id="isCountryRandom"
                    name="isCountryRandom"
                    checked={isCountryRandom}
                    onChange={handleCountryRandomizationChange}
                    disabled={anyLoading || locks.country}
                  />
                </div>
            </Card>

            <Card>
              <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h2 className="text-2xl font-semibold">5. Upload & Settings</h2>
                <LockButton locked={locks.referencePhoto} onClick={() => handleToggleLock('referencePhoto')} disabled={anyLoading} />
              </div>
              <div className={locks.referencePhoto ? 'opacity-50' : ''}>
                <div className="mt-4">
                  <Checkbox id="usePhoto" name="usePhoto" label="Use Reference Photo" checked={reference.usePhoto} onChange={handleReferenceChange} disabled={anyLoading || locks.referencePhoto} />
                </div>
                
                {reference.usePhoto && (
                   <div className="mt-4 animate-fade-in">
                      <ImageUpload onFileChange={handleFileChange} disabled={anyLoading || locks.referencePhoto} />
                      <div className="mt-4 space-y-3">
                        <Checkbox id="useStyle" name="useStyle" label="Use style from this photo" checked={reference.useStyle} onChange={handleReferenceChange} disabled={!reference.photo || anyLoading || locks.referencePhoto} />
                        <Checkbox id="useComposition" name="useComposition" label="Use composition from this photo" checked={reference.useComposition} onChange={handleReferenceChange} disabled={!reference.photo || anyLoading || locks.referencePhoto} />
                        <Checkbox id="keepOverlays" name="keepOverlays" label="Keep overlays (icons, watermarks)" checked={reference.keepOverlays} onChange={handleReferenceChange} disabled={!reference.photo || anyLoading || locks.referencePhoto} />
                      </div>
                   </div>
                )}
              </div>
            </Card>
            
            <Card>
              <div className="flex justify-between items-center mb-6 border-b pb-2">
                  <h2 className="text-2xl font-semibold">6. Manual Overlays</h2>
                  <div className="flex items-center gap-4">
                    <Button onClick={handleAddOverlay} disabled={anyLoading || overlays.length >= 5 || reference.usePhoto || locks.overlays} variant="secondary" className="px-3 py-1 text-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Slot
                    </Button>
                    <LockButton locked={locks.overlays} onClick={() => handleToggleLock('overlays')} disabled={anyLoading} />
                  </div>
              </div>
              <div className={`space-y-4 ${locks.overlays ? 'opacity-50' : ''}`}>
                {overlays.length > 0 ? (
                  overlays.map((overlay) => (
                    <OverlayControl
                      key={overlay.id}
                      overlay={overlay}
                      onFileChange={(file) => handleOverlayFileChange(overlay.id, file)}
                      onPropChange={(field, value) => handleOverlayPropChange(overlay.id, field, value)}
                      disabled={anyLoading || reference.usePhoto || locks.overlays}
                    />
                  ))
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">
                    {reference.usePhoto ? "Manual overlays are disabled when using a reference photo." : "No overlays added. Click 'Add Slot' to add one."}
                  </p>
                )}
              </div>
            </Card>

            <Card>
              <div className="flex justify-between items-center mb-6 border-b pb-2">
                <h2 className="text-2xl font-semibold">7. Model Creator</h2>
                <div className="flex items-center gap-4">
                  <Button onClick={handleRandomizeModel} disabled={anyLoading || locks.modelCreator.all} variant="secondary" className="px-4 py-2 text-sm">
                    {isRandomizingModel ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            Adapting...
                        </>
                    ) : 'Randomize'}
                  </Button>
                  <LockButton locked={locks.modelCreator.all} onClick={handleToggleModelCreatorMasterLock} disabled={anyLoading} />
                </div>
              </div>
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 ${locks.modelCreator.all ? 'opacity-50' : ''}`}>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="gender" className="block text-sm font-medium text-gray-700">Gender</label>
                    <LockButton locked={locks.modelCreator.gender} onClick={() => handleToggleModelCreatorFieldLock('gender')} disabled={anyLoading || locks.modelCreator.all} />
                  </div>
                  <select id="gender" name="gender" value={model.gender} onChange={handleModelChange} disabled={anyLoading || locks.modelCreator.all || locks.modelCreator.gender} className="block w-full pl-3 pr-10 py-2 text-base bg-gray-50 border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md" >
                     {GENDER_OPTIONS.map((option) => ( <option key={option} value={option}> {option} </option>))}
                  </select>
                </div>
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label htmlFor="age" className="block text-sm font-medium text-gray-700">Age</label>
                        <LockButton locked={locks.modelCreator.age} onClick={() => handleToggleModelCreatorFieldLock('age')} disabled={anyLoading || locks.modelCreator.all} />
                    </div>
                    <input id="age" name="age" type="number" value={model.age} onChange={handleModelChange} disabled={anyLoading || locks.modelCreator.all || locks.modelCreator.age} className="block w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="expression" className="block text-sm font-medium text-gray-700">Expression</label>
                    <LockButton locked={locks.modelCreator.expression} onClick={() => handleToggleModelCreatorFieldLock('expression')} disabled={anyLoading || locks.modelCreator.all} />
                  </div>
                   <select id="expression" name="expression" value={model.expression} onChange={handleModelChange} disabled={anyLoading || locks.modelCreator.all || locks.modelCreator.expression} className="block w-full pl-3 pr-10 py-2 text-base bg-gray-50 border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                     {EXPRESSION_OPTIONS.map((option) => ( <option key={option} value={option}> {option} </option>))}
                   </select>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="bodyShape" className="block text-sm font-medium text-gray-700">Body Shape</label>
                    <LockButton locked={locks.modelCreator.bodyShape} onClick={() => handleToggleModelCreatorFieldLock('bodyShape')} disabled={anyLoading || locks.modelCreator.all} />
                  </div>
                  <select id="bodyShape" name="bodyShape" value={model.bodyShape} onChange={handleModelChange} disabled={anyLoading || locks.modelCreator.all || locks.modelCreator.bodyShape} className="block w-full pl-3 pr-10 py-2 text-base bg-gray-50 border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md" >
                     {BODY_SHAPE_OPTIONS.map((option) => ( <option key={option} value={option}> {option} </option>))}
                  </select>
                </div>
                <div className="md:col-span-2">
                    <div className="flex justify-between items-center mb-1">
                        <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={handleRandomizeDescription} disabled={anyLoading || locks.modelCreator.all || locks.modelCreator.description} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1" >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"> <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.934L13.033 17.256A1 1 0 0112 18V2z" clipRule="evenodd" /> </svg>
                                <span>Randomize</span>
                            </button>
                            <LockButton locked={locks.modelCreator.description} onClick={() => handleToggleModelCreatorFieldLock('description')} disabled={anyLoading || locks.modelCreator.all} />
                        </div>
                    </div>
                    <textarea id="description" name="description" value={model.description} onChange={handleModelChange} disabled={anyLoading || locks.modelCreator.all || locks.modelCreator.description} placeholder="e.g., A man with sharp jawline and short, curly hair." rows={4} className="block w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                </div>
                 <div className="md:col-span-2">
                    <div className="flex justify-between items-center mb-1">
                      <label htmlFor="outfit" className="block text-sm font-medium text-gray-700">Outfit</label>
                      <LockButton locked={locks.modelCreator.outfit} onClick={() => handleToggleModelCreatorFieldLock('outfit')} disabled={anyLoading || locks.modelCreator.all} />
                    </div>
                    <select id="outfit" name="outfit" value={model.outfit} onChange={handleOutfitChange} disabled={anyLoading || locks.modelCreator.all || locks.modelCreator.outfit} className="block w-full pl-3 pr-10 py-2 text-base bg-gray-50 border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md" >
                      <option value="RANDOMIZE_OUTFIT">✨ Randomize New Outfit</option>
                      {outfitOptions.map((outfit) => ( <option key={outfit} value={outfit}> {outfit} </option>))}
                      {!outfitOptions.includes(model.outfit) && model.outfit && ( <option key={model.outfit} value={model.outfit}> {model.outfit} </option>)}
                    </select>
                 </div>
                 <div className="md:col-span-2">
                   <div className="flex justify-between items-center mb-1">
                      <label htmlFor="outfitColor" className="block text-sm font-medium text-gray-700">Outfit Color</label>
                      <LockButton locked={locks.modelCreator.outfitColor} onClick={() => handleToggleModelCreatorFieldLock('outfitColor')} disabled={anyLoading || locks.modelCreator.all} />
                   </div>
                   <input id="outfitColor" name="outfitColor" value={model.outfitColor} onChange={handleModelChange} disabled={anyLoading || locks.modelCreator.all || locks.modelCreator.outfitColor} placeholder="e.g., sky blue, charcoal grey, or 'any'" className="block w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                 </div>
                 <div className="md:col-span-2">
                    <div className="flex justify-between items-center mb-1">
                      <label htmlFor="pose" className="block text-sm font-medium text-gray-700">Pose</label>
                      <LockButton locked={locks.modelCreator.pose} onClick={() => handleToggleModelCreatorFieldLock('pose')} disabled={anyLoading || locks.modelCreator.all} />
                    </div>
                    <select id="pose" name="pose" value={model.pose} onChange={handlePoseChange} disabled={anyLoading || locks.modelCreator.all || locks.modelCreator.pose} className="block w-full pl-3 pr-10 py-2 text-base bg-gray-50 border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                      <option value="RANDOMIZE_POSE">✨ Randomize New Pose</option>
                      {poseOptions.map((pose) => ( <option key={pose} value={pose}> {pose} </option>))}
                      {!poseOptions.includes(model.pose) && model.pose && ( <option key={model.pose} value={model.pose}> {model.pose} </option>)}
                    </select>
                 </div>
                 <div className="md:col-span-2">
                   <div className="flex justify-between items-center mb-1">
                      <label htmlFor="tones" className="block text-sm font-medium text-gray-700">Hair/Eye/Skin Tones</label>
                      <LockButton locked={locks.modelCreator.tones} onClick={() => handleToggleModelCreatorFieldLock('tones')} disabled={anyLoading || locks.modelCreator.all} />
                   </div>
                   <input id="tones" name="tones" value={model.tones} onChange={handleModelChange} disabled={anyLoading || locks.modelCreator.all || locks.modelCreator.tones} placeholder="e.g., Brunette hair, hazel eyes, olive skin." className="block w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                 </div>
              </div>
            </Card>
            
             <Card>
                <div className="flex justify-between items-center mb-6 border-b pb-2">
                  <h2 className="text-2xl font-semibold">8. Composition</h2>
                  <LockButton locked={locks.composition} onClick={() => handleToggleLock('composition')} disabled={anyLoading} />
                </div>
                <div className={`space-y-6 ${locks.composition ? 'opacity-50' : ''}`}>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Aspect Ratio
                        </label>
                        <div className={`flex rounded-lg p-1 bg-gray-200 w-full segmented-control ${reference.usePhoto || generationTier === 'standard' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            {ASPECT_RATIO_OPTIONS.map(option => (
                                <button
                                    key={option.value}
                                    onClick={() => setAspectRatio(option.value)}
                                    aria-selected={aspectRatio === option.value}
                                    className="px-4 py-2 text-sm font-semibold rounded-md flex-1 transition-colors"
                                    disabled={anyLoading || reference.usePhoto || generationTier === 'standard' || locks.composition}
                                >
                                    {option.name} ({option.value})
                                </button>
                            ))}
                        </div>
                         {(reference.usePhoto || generationTier === 'standard') && <p className="text-xs text-gray-500 mt-2">{reference.usePhoto ? 'Aspect ratio is determined by the reference photo.' : 'Aspect ratio is fixed for the Standard engine.'}</p>}
                    </div>
                    <Select label="Shot Type" id="shotType" name="shotType" value={scene.shotType} onChange={handleSceneChange} options={SHOT_TYPE_OPTIONS} disabled={anyLoading || locks.composition} />
                </div>
            </Card>

            <Card>
              <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h2 className="text-2xl font-semibold">9. Generation Engine</h2>
                <LockButton locked={locks.generationEngine} onClick={() => handleToggleLock('generationEngine')} disabled={anyLoading} />
              </div>
              <div className={locks.generationEngine ? 'opacity-50' : ''}>
                <p className="text-sm text-gray-600 mb-4">Choose the AI model. Premium offers higher quality and more options but may require billing. Standard is faster and may have a free tier.</p>
                <div className="flex rounded-lg p-1 bg-gray-200 w-full md:w-auto segmented-control">
                  <button 
                    onClick={() => setGenerationTier('premium')}
                    aria-selected={generationTier === 'premium'}
                    className="px-4 py-2 text-sm font-semibold rounded-md flex-1 transition-colors"
                    disabled={anyLoading || reference.usePhoto || locks.generationEngine}
                  >
                    Premium (Imagen 4)
                  </button>
                  <button 
                    onClick={() => setGenerationTier('standard')}
                    aria-selected={generationTier === 'standard'}
                    className="px-4 py-2 text-sm font-semibold rounded-md flex-1 transition-colors"
                    disabled={anyLoading || reference.usePhoto || locks.generationEngine}
                  >
                    Standard (Flash Image)
                  </button>
                </div>
                {reference.usePhoto && <p className="text-xs text-gray-500 mt-2">Engine is automatically selected when using a reference photo.</p>}
              </div>
            </Card>

            <Card>
              <div className="flex flex-wrap justify-between items-center gap-4 mb-6 border-b pb-2">
                <h2 className="text-2xl font-semibold">10. Scene & Background</h2>
                <div className="flex items-center gap-4 flex-wrap">
                  {isAdaptingScene && (
                    <div className="flex items-center text-sm text-gray-500">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Adapting...
                    </div>
                  )}
                  <Button onClick={handleRandomizeScene} disabled={anyLoading || locks.scene.all} variant="secondary" className="px-4 py-2 text-sm">
                     {isRandomizingScene ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            Adapting...
                        </>
                    ) : 'Randomize'}
                  </Button>
                   <LockButton locked={locks.scene.all} onClick={handleToggleSceneMasterLock} disabled={anyLoading} />
                </div>
              </div>
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 ${locks.scene.all ? 'opacity-50' : ''}`}>
                <div className="md:col-span-2">
                   <select
                    onChange={handleScenePresetChange}
                    disabled={anyLoading || locks.scene.all}
                    className="block w-full mb-4 pl-3 pr-10 py-2 text-base bg-gray-50 border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    defaultValue=""
                  >
                    <option value="" disabled>Select an indoor preset...</option>
                    <option value="RANDOMIZE_INDOOR">✨ Randomize New Indoor Scene</option>
                    {INDOOR_PRESET_OPTIONS.map((preset) => (
                      <option key={preset.name} value={preset.name}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="location" className="block text-sm font-medium text-gray-700">Location</label>
                    <LockButton locked={locks.scene.location} onClick={() => handleToggleSceneFieldLock('location')} disabled={anyLoading || locks.scene.all} />
                  </div>
                  <textarea id="location" name="location" value={scene.location} onChange={handleSceneChange} disabled={anyLoading || locks.scene.all || locks.scene.location} placeholder="e.g., Shibuya Crossing at night with neon lights..." rows={4} className="block w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="lighting" className="block text-sm font-medium text-gray-700">Lighting</label>
                    <LockButton locked={locks.scene.lighting} onClick={() => handleToggleSceneFieldLock('lighting')} disabled={anyLoading || locks.scene.all} />
                  </div>
                  <select id="lighting" name="lighting" value={scene.lighting} onChange={handleSceneChange} disabled={anyLoading || locks.scene.all || locks.scene.lighting} className="block w-full pl-3 pr-10 py-2 text-base bg-gray-50 border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md" >
                     {LIGHTING_OPTIONS.map((option) => ( <option key={option} value={option}> {option} </option>))}
                  </select>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="mood" className="block text-sm font-medium text-gray-700">Mood</label>
                    <LockButton locked={locks.scene.mood} onClick={() => handleToggleSceneFieldLock('mood')} disabled={anyLoading || locks.scene.all} />
                  </div>
                  <select id="mood" name="mood" value={scene.mood} onChange={handleSceneChange} disabled={anyLoading || locks.scene.all || locks.scene.mood} className="block w-full pl-3 pr-10 py-2 text-base bg-gray-50 border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md" >
                    {MOOD_OPTIONS.map((option) => ( <option key={option} value={option}> {option} </option>))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="details" className="block text-sm font-medium text-gray-700">Extra Details</label>
                    <LockButton locked={locks.scene.details} onClick={() => handleToggleSceneFieldLock('details')} disabled={anyLoading || locks.scene.all} />
                  </div>
                  <textarea id="details" name="details" value={scene.details} onChange={handleSceneChange} disabled={anyLoading || locks.scene.all || locks.scene.details} placeholder="e.g., Rain-slicked streets, a vintage bicycle..." rows={4} className="block w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                </div>
              </div>
            </Card>

            <div className="space-y-2">
              <Button onClick={() => handleGenerateImage(1)} disabled={anyLoading} className="w-full text-lg">
                {generatingCount === 1 && <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                {generatingCount === 1 ? 'Generating Image...' : 'Generate Image'}
              </Button>
              <Button onClick={() => handleGenerateImage(4)} disabled={anyLoading || reference.usePhoto || generationTier === 'standard'} variant="secondary" className="w-full text-lg">
                {generatingCount === 4 && <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                {generatingCount === 4 ? 'Generating 4 Images...' : 'Generate 4 Images'}
              </Button>
              {(reference.usePhoto || generationTier === 'standard') && (
                  <p className="text-xs text-center text-gray-500">
                      {reference.usePhoto ? 'Generating multiple images is unavailable with a reference photo.' : 'Generating multiple images is unavailable with the Standard engine.'}
                  </p>
              )}
            </div>
          </div>

          <div className="lg:sticky lg:top-8 w-full">
            <Card>
              <h2 className="text-2xl font-semibold mb-4 border-b pb-2">11. Generated Image</h2>
              <div className="mt-4 aspect-square bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200">
                {anyLoading ? (
                  <div className="text-center p-4">
                     <svg className="animate-spin mx-auto h-12 w-12 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <p className="mt-4 text-gray-600 font-semibold">{loadingMessage}</p>
                    <p className="mt-1 text-sm text-gray-500">This can take up to a minute...</p>
                  </div>
                ) : error ? (
                   <div className="text-center text-red-600 p-4 bg-red-50 rounded-lg">
                        <>
                            <h3 className="font-bold mb-2">Error Generating Image</h3>
                            <p className="text-sm">{error}</p>
                        </>
                    </div>
                ) : finalImage ? (
                  <img src={finalImage} alt="Generated AI" className="rounded-lg object-contain h-full w-full" />
                ) : (
                   <div className="text-center p-4 text-gray-500">
                      <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      <p className="mt-2 font-semibold">Your generated image will appear here.</p>
                      <p className="text-sm">Configure the options and click "Generate Image".</p>
                   </div>
                )}
              </div>
              
              {generatedImages && generatedImages.length > 1 && !anyLoading && (
                <div className="mt-4 grid grid-cols-4 gap-2">
                    {generatedImages.map((img, index) => (
                        <button
                            key={index}
                            onClick={() => setSelectedImageIndex(index)}
                            className={`rounded-lg overflow-hidden border-2 transition-colors ${selectedImageIndex === index ? 'border-indigo-600' : 'border-transparent hover:border-gray-300'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
                            aria-label={`Select image variant ${index + 1}`}
                        >
                            <img
                                src={`data:image/png;base64,${img}`}
                                alt={`Variant ${index + 1}`}
                                className="aspect-square object-cover w-full h-full"
                            />
                        </button>
                    ))}
                </div>
              )}

              {finalImage && !anyLoading && (
                <Button onClick={handleDownloadImage} className="w-full mt-6">Download Image</Button>
              )}
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;