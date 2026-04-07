"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const companyNormalizer_1 = require("../utils/companyNormalizer");
describe('companyRating normalization', () => {
    test('normalizes TCS legal suffix', () => {
        expect((0, companyNormalizer_1.normalizeCompanyName)('TCS Ltd.')).toBe('tcs');
    });
    test('normalizes Infosys private suffix', () => {
        expect((0, companyNormalizer_1.normalizeCompanyName)('Infosys Pvt Ltd')).toBe('infosys');
    });
    test('is case insensitive and trims spaces', () => {
        expect((0, companyNormalizer_1.normalizeCompanyName)('  AcCeNtUrE   ')).toBe('accenture');
    });
});
