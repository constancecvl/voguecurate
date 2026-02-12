
export interface CollectionImage {
  id: string;
  url: string;
  base64?: string;
}

export interface ExhibitionStrategy {
  themeName: string;
  conceptDescription: string;
  lightingStrategy: string;
  musicAtmosphere: string;
  spatialArrangement: string;
  materialsUsed: string[];
}

export interface Collection {
  id: string;
  name: string;
  season: string;
  description: string;
  images: CollectionImage[];
  strategy?: ExhibitionStrategy;
  visualConceptUrl?: string;
  createdAt: number;
}

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  EDITOR = 'EDITOR',
  VIEWER = 'VIEWER'
}
