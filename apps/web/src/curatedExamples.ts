import NativePlace from './assets/sampleJSON/native-place.json';
import KlccFlat from './assets/sampleJSON/klcc-flat.json';
import OpenRingRepair from './assets/sampleJSON/open-ring-repair.json';
import Clean3DBuildings from './assets/sampleJSON/clean-3d-buildings.json';
import BrokenGeometry from './assets/sampleJSON/broken-geometry.json';
import ElevationTerrain from './assets/sampleJSON/elevation-terrain.json';

export type CuratedDemoName = 'Clean3DBuildings' | 'BrokenGeometry' | 'ElevationTerrain';

export interface CuratedDemoPresentation {
  autoRotate: boolean;
  colorByElevation: boolean;
  verticalExaggeration: number;
}

export interface CuratedDemo {
  name: CuratedDemoName;
  fileName: `${CuratedDemoName}.geojson`;
  rawText: string;
  description: string;
  initialFeatureIndex: number | null;
  presentation: CuratedDemoPresentation;
}

export interface CuratedExample {
  name: string;
  rawText: string;
  demo?: CuratedDemo;
}

export const CLEAN_STARTER_DEMO: CuratedDemo = {
  name: 'Clean3DBuildings',
  fileName: 'Clean3DBuildings.geojson',
  rawText: JSON.stringify(Clean3DBuildings, null, 2),
  description: 'Valid XYZ building forms with varying Z values.',
  initialFeatureIndex: null,
  presentation: {
    autoRotate: false,
    colorByElevation: true,
    verticalExaggeration: 1.5,
  },
};

export const CURATED_DEMOS: readonly CuratedDemo[] = [
  CLEAN_STARTER_DEMO,
  {
    name: 'BrokenGeometry',
    fileName: 'BrokenGeometry.geojson',
    rawText: JSON.stringify(BrokenGeometry, null, 2),
    description: 'Inspect duplicate, mixed-dimension, and out-of-range findings.',
    initialFeatureIndex: 1,
    presentation: {
      autoRotate: false,
      colorByElevation: false,
      verticalExaggeration: 1,
    },
  },
  {
    name: 'ElevationTerrain',
    fileName: 'ElevationTerrain.geojson',
    rawText: JSON.stringify(ElevationTerrain, null, 2),
    description: 'Review Z profiles and request a terrain comparison.',
    initialFeatureIndex: 1,
    presentation: {
      autoRotate: false,
      colorByElevation: true,
      verticalExaggeration: 2,
    },
  },
];

export const CURATED_EXAMPLES: readonly CuratedExample[] = [
  ...CURATED_DEMOS.map((demo) => ({
    name: demo.fileName,
    rawText: demo.rawText,
    demo,
  })),
  {
    name: 'klcc-flat.json',
    rawText: JSON.stringify(KlccFlat, null, 2),
  },
  {
    name: 'open-ring-repair.geojson',
    rawText: JSON.stringify(OpenRingRepair, null, 2),
  },
  {
    name: 'native-place.jsonfg',
    rawText: JSON.stringify(NativePlace, null, 2),
  },
];
