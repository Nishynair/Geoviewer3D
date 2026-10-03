import NativePlace from './assets/sampleJSON/native-place.json';
import OpenRingRepair from './assets/sampleJSON/open-ring-repair.json';

export interface CuratedExample {
  name: string;
  rawText: string;
}

export const CURATED_EXAMPLES: readonly CuratedExample[] = [
  {
    name: 'open-ring-repair.geojson',
    rawText: JSON.stringify(OpenRingRepair, null, 2),
  },
  {
    name: 'native-place.jsonfg',
    rawText: JSON.stringify(NativePlace, null, 2),
  },
];
