import { normalizeCompanyName } from '../utils/companyNormalizer';

describe('companyNormalizer', () => {
  test('normalizes tcs ltd', () => {
    expect(normalizeCompanyName('TCS Ltd.')).toBe('tcs');
  });

  test('normalizes infosys pvt ltd', () => {
    expect(normalizeCompanyName('Infosys Pvt Ltd')).toBe('infosys');
  });

  test('keeps company-name-only stable', () => {
    expect(normalizeCompanyName('Google India')).toBe('google india');
  });
});

