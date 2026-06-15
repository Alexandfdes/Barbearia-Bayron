/**
 * Configuração do "Combo Boris" — fonte única de verdade (client + server).
 *
 * Combo = um serviço Cabelo+Barba elegível + um produto Boris à escolha,
 * com COMBO_DISCOUNT_PCT de desconto aplicado sobre o serviço E sobre o produto.
 * Pagamento é presencial; o produto é retirado na barbearia.
 *
 * Sem dependências de banco/Node de propósito, pra poder ser importado tanto
 * no endpoint (servidor) quanto no script do wizard (cliente).
 */
import { products } from '../data/products.js';

/** Desconto do Combo Boris (10%). */
export const COMBO_DISCOUNT_PCT = 0.10;

/**
 * Slugs de serviços elegíveis ao combo (Cabelo + Barba).
 * Precisam bater com os slugs do catálogo (scripts/seed.mjs).
 */
export const COMBO_ELIGIBLE_SLUGS: readonly string[] = [
  'degrade-barba',
  'social-barba',
  'navalhado-barba',
];

export function isComboEligibleSlug(slug: string): boolean {
  return COMBO_ELIGIBLE_SLUGS.includes(slug);
}

/** Aplica o desconto do combo a um valor em centavos (arredonda pro centavo). */
export function applyComboDiscount(cents: number): number {
  return Math.round(cents * (1 - COMBO_DISCOUNT_PCT));
}

export interface ComboProduct {
  slug: string;
  name: string;
  priceCents: number;
}

/** Produtos Boris disponíveis no combo, com preço em centavos. */
export function comboProducts(): ComboProduct[] {
  return products.map((p) => ({
    slug: p.slug,
    name: p.name,
    priceCents: Math.round(p.priceValue * 100),
  }));
}

export function findComboProduct(slug: string): ComboProduct | null {
  return comboProducts().find((p) => p.slug === slug) ?? null;
}
