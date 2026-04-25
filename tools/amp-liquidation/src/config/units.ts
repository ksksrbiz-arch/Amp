export interface Unit {
  slug: 'compressor' | 'pump' | 'generator' | 'fourfront';
  brand: string;
  model: string;
  modelNumber: string;
  msrp: number;
  targetPrice: number;
  floorPrice: number;
  weightLbs: number;
  dimensionsIn: string;
  engineSpec: string;
  keyFeatures: string[];
  channels: Array<'ebay' | 'fb' | 'cl' | 'offerup' | 'mercari'>;
  serial?: string;
}

export const UNITS: Unit[] = [
  {
    slug: 'compressor',
    brand: 'AMP / Kohler',
    model: '8-Gallon Twin Tank Gas Air Compressor',
    modelNumber: 'AKAC120',
    msrp: 1599,
    targetPrice: 899,
    floorPrice: 640,
    weightLbs: 161,
    dimensionsIn: '42x18x25',
    engineSpec: 'Kohler SH265 OHV 6.5HP gas',
    keyFeatures: [
      'Belt-driven full cast iron single-stage pump',
      'V-type cylinder design for superior cooling',
      'Crankshaft bearings on both ends',
      '14 CFM @ 40 PSI',
    ],
    channels: ['fb', 'cl', 'offerup', 'mercari'],
  },
  {
    slug: 'pump',
    brand: 'AMP / Kohler',
    model: '3-inch Semi-Trash Water Pump',
    modelNumber: 'AKWP30',
    msrp: 975,
    targetPrice: 599,
    floorPrice: 390,
    weightLbs: 84,
    dimensionsIn: '24x20x22',
    engineSpec: 'Kohler RH265 6.5HP gas',
    keyFeatures: [
      'Cast iron impeller and volute',
      'Silicon carbide mechanical seal',
      '3" inlet/outlet, passes 3/4" soft solids',
      'Includes strainer kit + wrench',
    ],
    channels: ['fb', 'cl', 'offerup', 'mercari'],
  },
  {
    slug: 'generator',
    brand: 'AMP / Kohler',
    model: '10,000W Portable Gas Generator',
    modelNumber: 'AK10KRS',
    msrp: 3250,
    targetPrice: 1895,
    floorPrice: 1300,
    weightLbs: 330,
    dimensionsIn: '40x28x30',
    engineSpec: 'Kohler Command PRO 14HP OHV',
    keyFeatures: [
      '7,500W rated / 10,000W surge',
      'Remote control electric start',
      '12V battery + maintenance kit included',
      'Rally-style all-terrain wheels',
      'Stabilizing feet',
    ],
    channels: ['fb', 'cl', 'offerup', 'mercari'],
  },
  {
    slug: 'fourfront',
    brand: 'AMP / Kohler',
    model: 'FOURFRONT 9250 4-in-1',
    modelNumber: 'FOURFRONT 9250',
    msrp: 13795,
    targetPrice: 6500,
    floorPrice: 4800,
    weightLbs: 420,
    dimensionsIn: '52x30x36',
    engineSpec: 'Kohler Command PRO 20HP OHV',
    keyFeatures: [
      '9,250W generator (7,500W rated)',
      '200A AC/DC welder with wire-feed',
      '10-gallon twin-tank air compressor (30 CFM)',
      '50A battery charger / jump-starter',
      'Remote start, hour meter, GFCI outlets',
    ],
    channels: ['ebay', 'fb', 'cl', 'offerup', 'mercari'],
  },
];
