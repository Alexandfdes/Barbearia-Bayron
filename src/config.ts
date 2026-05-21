// src/config.ts

// Usando o número de teste conforme solicitado
export const WHATSAPP_NUMBER = "15551547238";

export const TOPSALAO_URL = '/agendar';

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
