export interface ModelData {
  description: string;
  gender: string;
  age: number;
  expression: string;
  outfit: string;
  outfitColor: string;
  tones: string;
  isSensual: boolean;
  pose: string;
  bodyShape: string;
}

export interface SceneData {
  location: string;
  lighting: string;
  mood: string;
  details: string;
  shotType: string;
}

export interface ReferenceData {
  photo: File | null;
  usePhoto: boolean;
  useStyle: boolean;
  useComposition: boolean;
  keepOverlays: boolean;
}

export interface OverlayData {
  id: number;
  file: File | null;
  preview: string | null;
  x: number;
  y: number;
  scale: number;
}

export type CreationMode = 'auto' | 'manual';

export interface ModelCreatorLocks {
  all: boolean;
  gender: boolean;
  age: boolean;
  expression: boolean;
  description: boolean;
  outfit: boolean;
  outfitColor: boolean;
  pose: boolean;
  tones: boolean;
  bodyShape: boolean;
}

export interface SceneLocks {
  all: boolean;
  location: boolean;
  lighting: boolean;
  mood: boolean;
  details: boolean;
}

export interface LocksState {
  global: boolean;
  generationMode: boolean;
  overallStyle: boolean;
  modelType: boolean;
  country: boolean;
  referencePhoto: boolean;
  overlays: boolean;
  modelCreator: ModelCreatorLocks;
  composition: boolean;
  generationEngine: boolean;
  scene: SceneLocks;
}