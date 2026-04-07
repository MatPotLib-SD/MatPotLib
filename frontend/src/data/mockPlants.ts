export type Plant = {
  id: string;
  name: string;
  species: string;
  status: 'healthy' | 'needs-attention';
  moisture: number;
  temperature: number;
  light: number;
  humidity: number;
  lastUpdated: string;
};

export const mockPlants: Plant[] = [
  {
    id: '1',
    name: 'Rick',
    species: 'Pothos',
    status: 'healthy',
    moisture: 42,
    temperature: 22.5,
    light: 320,
    humidity: 55,
    lastUpdated: 'Just now',
  },
  {
    id: '2',
    name: 'Morty',
    species: 'Basil',
    status: 'needs-attention',
    moisture: 18,
    temperature: 24.1,
    light: 580,
    humidity: 40,
    lastUpdated: '1h ago',
  },
  {
    id: '3',
    name: 'Lebron',
    species: 'Boston Fern',
    status: 'healthy',
    moisture: 61,
    temperature: 21.2,
    light: 180,
    humidity: 68,
    lastUpdated: '3m ago',
  },
];
