"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const companyNormalizer_1 = require("../utils/companyNormalizer");
describe('companyNormalizer', () => {
    test('normalizes tcs ltd', () => {
        expect((0, companyNormalizer_1.normalizeCompanyName)('TCS Ltd.')).toBe('tcs');
    });
    test('normalizes infosys pvt ltd', () => {
        expect((0, companyNormalizer_1.normalizeCompanyName)('Infosys Pvt Ltd')).toBe('infosys');
    });
    test('keeps company-name-only stable', () => {
        expect((0, companyNormalizer_1.normalizeCompanyName)('Google India')).toBe('google india');
    });
});
