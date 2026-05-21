// src/config.ts

// Usando o número de teste conforme solicitado
export const WHATSAPP_NUMBER = "15551547238";

// Link do TopSalão atualizado para usar o número de teste na query (ou mantendo a base)
export const TOPSALAO_URL = `https://topsalao.com/app/index.html?tel=84999051196`;

// Link do Instagram
export const INSTAGRAM_URL = "https://www.instagram.com/barbearia_bayron/";

// Endereço da barbearia
export const ADDRESS = {
  street: "R. Jaen Menescal, 174",
  city: "Mossoró/RN",
};

// Link direto para Google Maps (abre rota no Maps/Waze)
export const GOOGLE_MAPS_URL = "https://www.google.com/maps/dir/?api=1&destination=R.+Jaen+Menescal,+174+-+Mossoró,+RN";

// Função helper para gerar link do WhatsApp com mensagem
export function getWhatsAppUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
