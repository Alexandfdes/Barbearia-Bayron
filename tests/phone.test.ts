import { describe, it, expect } from 'vitest';
import { normalizePhone } from '../src/lib/phone';

describe('normalizePhone', () => {
  it('remove máscara de celular', () => {
    expect(normalizePhone('(84) 99665-8951')).toBe('84996658951');
  });
  it('remove máscara de fixo', () => {
    expect(normalizePhone('(84) 3333-4444')).toBe('8433334444');
  });
  it('remove DDI 55 (13 dígitos)', () => {
    expect(normalizePhone('+55 84 99665-8951')).toBe('84996658951');
  });
  it('remove DDI 55 (12 dígitos, fixo)', () => {
    expect(normalizePhone('55 84 3333-4444')).toBe('8433334444');
  });
  it('mantém número já normalizado', () => {
    expect(normalizePhone('84996658951')).toBe('84996658951');
  });
  it('rejeita curto demais (<10 dígitos)', () => {
    expect(normalizePhone('996658951')).toBe('');
    expect(normalizePhone('8499')).toBe('');
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
  });
  it('ignora letras e símbolos', () => {
    expect(normalizePhone('tel: 84 9.9665-8951!')).toBe('84996658951');
  });
});
