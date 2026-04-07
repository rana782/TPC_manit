import { normalizeCompanyName } from '../utils/companyNormalizer';

describe('companyRating normalization', () => {
  test('normalizes TCS legal suffix', () => {
    expect(normalizeCompanyName('TCS Ltd.')).toBe('tcs');
  });

  test('normalizes Infosys private suffix', () => {
    expect(normalizeCompanyName('Infosys Pvt Ltd')).toBe('infosys');
  });

  test('is case insensitive and trims spaces', () => {
    expect(normalizeCompanyName('  AcCeNtUrE   ')).toBe('accenture');
  });
});

