// src/config.ts

// Número oficial da Barbearia Bayron — formato wa.me (55 + DDD + número).
// ⚠️ CONFIRME este número antes de publicar: veio do README do projeto
// (+55 84 99905-1196). Era um número de teste (15551547238).
export const WHATSAPP_NUMBER = "15551547238";

export const TOPSALAO_URL = '/agendar';

// Domínio oficial em produção — fonte única para canonical, og:url e a imagem de preview.
export const SITE_URL = "https://bayron.alexandrefdev.tech";

// Link do Instagram
export const INSTAGRAM_URL = "https://www.instagram.com/barbearia_bayron/";

// Endereço da barbearia
export const ADDRESS = {
  street: "R. Jaen Menescal, 174",
  city: "Mossoró/RN",
};

// Link direto para Google Maps (abre rota no Maps/Waze)
export const GOOGLE_MAPS_URL = "https://www.google.com/maps/dir/?api=1&destination=R.+Jaen+Menescal,+174+-+Mossoró,+RN";

// Horário de funcionamento — fonte única, consumida pelo Footer e pela Localização
export const BUSINESS_HOURS = [
  { label: "Segunda — Sexta", hours: "09:00 — 20:00", closed: false },
  { label: "Sábado",          hours: "09:00 — 18:00", closed: false },
  { label: "Domingo",         hours: "Fechado",       closed: true  },
];

// Função helper para gerar link do WhatsApp com mensagem
export function getWhatsAppUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
