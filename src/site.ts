export const SITE = {
  name: 'The Paper Trail',
  url: 'https://papertrailwealth.com',
  email: 'hello@papertrailwealth.com',
  tagline: 'Plain-English money guides for real families.',
};
export const CATEGORIES = ['Budgeting', 'Saving', 'Bills', 'Investing', 'Retirement', 'Money History'] as const;
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
export const TONES: Record<string, [string, string]> = {
  'Budgeting': ['#E7F3EC', '#1F7A4D'],
  'Saving': ['#EEF2FF', '#4338CA'],
  'Bills': ['#FEF3C7', '#B45309'],
  'Investing': ['#E0F2FE', '#0369A1'],
  'Retirement': ['#E7F3EC', '#1F7A4D'],
  'Money History': ['#F3EEE4', '#6B4F2A'],
};
