// src/config.ts

// Usando o número de teste conforme solicitado
export const WHATSAPP_NUMBER = "15551547238";

// Link do TopSalão atualizado para usar o número de teste na query (ou mantendo a base)
export const TOPSALAO_URL = `https://topsalao.com/app/index.html?tel=${WHATSAPP_NUMBER}`;

// Link do Instagram
export const INSTAGRAM_URL = "https://www.instagram.com/barbearia_bayron/";

// Função helper para gerar link do WhatsApp com mensagem
export function getWhatsAppUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
