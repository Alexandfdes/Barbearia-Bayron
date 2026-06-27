/**
 * Configuração do "Combo Boris" — constantes puras, seguras pra client e server.
 *
 * Combo = um serviço Cabelo+Barba elegível + um produto Boris à escolha,
 * com COMBO_DISCOUNT_PCT de desconto aplicado sobre o serviço E sobre o produto.
 * Pagamento é presencial; o produto é retirado na barbearia.
 *
 * A LISTA de produtos agora vem do banco (tabela products), exposta em
 * /api/products. Por isso este arquivo NÃO importa mais data/products — assim
 * continua importável no bundle do cliente (wizard) sem puxar dependências de Node.
 */

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

/** Aplica um desconto percentual (0–100) a um valor em centavos (arredonda pro centavo). */
export function applyDiscountPct(cents: number, pct: number): number {
  return Math.round(cents * (1 - pct / 100));
}
