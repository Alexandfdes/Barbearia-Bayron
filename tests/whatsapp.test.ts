import { describe, it, expect } from 'vitest';
import { waPhone, waLink, addMinutesToHm, buildWaMessages, firstName } from '../src/lib/whatsapp';

describe('waPhone', () => {
  it('aceita celular 11 dígitos com máscara', () => {
    expect(waPhone('(84) 99665-8951')).toBe('5584996658951');
  });
  it('aceita fixo 10 dígitos', () => {
    expect(waPhone('8433334444')).toBe('558433334444');
  });
  it('remove DDI 55 quando prefixo (13 dígitos)', () => {
    expect(waPhone('+55 84 99665-8951')).toBe('5584996658951');
  });
  it('remove DDI 55 quando prefixo (12 dígitos, fixo)', () => {
    expect(waPhone('558433334444')).toBe('558433334444');
  });
  it('NÃO remove 55 de número com DDD 55 (Santa Maria)', () => {
    expect(waPhone('55996658951')).toBe('5555996658951');
  });
  it('rejeita número curto', () => {
    expect(waPhone('996658951')).toBeNull();
    expect(waPhone('8499')).toBeNull();
    expect(waPhone('')).toBeNull();
    expect(waPhone(null)).toBeNull();
  });
  it('rejeita número longo demais', () => {
    expect(waPhone('5584996658951999')).toBeNull();
  });
  it('rejeita DDD inválido (<11)', () => {
    expect(waPhone('0199665895')).toBeNull();
    expect(waPhone('10996658951')).toBeNull();
  });
  it('rejeita 11 dígitos sem 9 inicial', () => {
    expect(waPhone('84896658951')).toBeNull();
  });
});

describe('waLink', () => {
  it('gera link com mensagem url-encoded', () => {
    const url = waLink('5584996658951', 'Olá João!');
    expect(url).toBe('https://wa.me/5584996658951?text=Ol%C3%A1%20Jo%C3%A3o!');
  });
  it('gera link sem mensagem', () => {
    expect(waLink('5584996658951')).toBe('https://wa.me/5584996658951');
  });
});

describe('addMinutesToHm', () => {
  it('soma simples', () => expect(addMinutesToHm('14:30', 15)).toBe('14:45'));
  it('vira a hora', () => expect(addMinutesToHm('14:50', 15)).toBe('15:05'));
  it('trava em 23:59', () => expect(addMinutesToHm('23:55', 15)).toBe('23:59'));
  it('entrada inválida retorna como veio', () => expect(addMinutesToHm('abc', 15)).toBe('abc'));
});

describe('buildWaMessages', () => {
  const msgs = buildWaMessages('João da Silva', '14:30', 'hoje');
  it('usa só o primeiro nome', () => {
    expect(msgs.lembrete).toContain('Olá João,');
    expect(msgs.clienteAtrasado).toContain('Fala, João!');
  });
  it('cliente atrasado menciona o horário original', () => {
    expect(msgs.clienteAtrasado).toContain('às 14:30');
  });
  it('barbeiro atrasado propõe +15min', () => {
    expect(msgs.barbeiroAtrasado).toContain('às 14:45');
  });
  it('nome vazio vira "cliente"', () => {
    expect(firstName('')).toBe('cliente');
    expect(firstName('  ')).toBe('cliente');
  });
});
