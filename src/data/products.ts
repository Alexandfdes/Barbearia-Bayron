export interface ProductData {
  slug: string;
  name: string;
  price: string;
  priceValue: number;
  shortDesc: string;
  fullDesc: string;
  imgFile: string;
  whatsappMsg: string;
  benefits: string[];
}

export const products: ProductData[] = [
  {
    slug: "oleo-mentolado-boris",
    name: "Óleo Mentolado Boris",
    price: "R$ 45",
    priceValue: 45,
    shortDesc: "Garante brilho e proteção todos os dias. Nutre, hidrata e protege cada fio da sua barba.",
    fullDesc: "O Óleo Mentolado Boris é a base do cuidado diário para quem leva a barba a sério. Sua fórmula exclusiva combina óleos vegetais com extrato mentolado, criando uma camada protetora em cada fio sem deixar aquela sensação pesada ou oleosa. Ideal tanto para barbas curtas quanto para barbas longas, ele age desde a raiz até as pontas, prevenindo ressecamento, coceira e frizz. O aroma mentolado suave garante frescor ao longo de todo o dia.",
    imgFile: "oleo-mentolado6.jpeg",
    whatsappMsg: "Olá! Quero saber mais sobre o Óleo Mentolado Boris.",
    benefits: [
      "Hidratação profunda sem deixar resíduo gorduroso",
      "Controla o frizz e alinha os fios naturalmente",
      "Aroma mentolado suave e duradouro",
      "Indicado para barbas curtas e longas",
      "Previne coceira e ressecamento da pele",
    ],
  },
  {
    slug: "balm-classic-boris",
    name: "Balm Classic Boris",
    price: "R$ 49",
    priceValue: 49,
    shortDesc: "Fórmula rica em ativos hidratantes. Reduz oleosidade, acalma a pele e mantém a barba alinhada.",
    fullDesc: "O Balm Classic Boris foi formulado para os homens que querem manter a barba no lugar durante o dia todo sem abrir mão do conforto. Com textura leve e absorção rápida, ele nutre a pele por baixo da barba — região frequentemente esquecida e responsável pela coceira e descamação. Sua composição equilibrada reduz a oleosidade excessiva enquanto fornece a hidratação necessária, deixando a barba maleável, com aspecto cuidado e cheiro agradável.",
    imgFile: "balm-classic4.jpeg",
    whatsappMsg: "Olá! Quero saber mais sobre o Balm Classic Boris.",
    benefits: [
      "Mantém a barba alinhada e modelada",
      "Acalma a pele e reduz coceira",
      "Absorção rápida, sem sensação pegajosa",
      "Equilibra a oleosidade natural da pele",
      "Hidratação de longa duração",
    ],
  },
  {
    slug: "tonico-boris",
    name: "Tônico Boris",
    price: "R$ 89",
    priceValue: 89,
    shortDesc: "Desenvolvido para falhas na barba e calvície. Estimula o crescimento e dá volume aos fios.",
    fullDesc: "O Tônico Boris é o produto mais avançado da linha, desenvolvido em parceria com dermatologistas para atuar diretamente no folículo capilar. Sua fórmula com ativos estimulantes aumenta a circulação local, reativa folículos inativos e fortalece os fios existentes, resultando em uma barba mais densa e volumosa em semanas de uso contínuo. Indicado especialmente para regiões com falhas, barba rala ou início de calvície, ele age tanto na face quanto no couro cabeludo.",
    imgFile: "tonico4.jpeg",
    whatsappMsg: "Olá! Quero saber mais sobre o Tônico Boris.",
    benefits: [
      "Estimula o crescimento em áreas com falhas",
      "Fortalece os fios e reduz a queda",
      "Ativa a circulação no folículo capilar",
      "Funciona na barba e no couro cabeludo",
      "Resultados visíveis a partir de 3 semanas",
    ],
  },
];
