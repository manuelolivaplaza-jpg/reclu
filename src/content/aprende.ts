/**
 * Fichas cortas de /aprende.
 * Cada afirmación del cuerpo sale de `fuentes` (ver scrapers/data/v2/F48/fuentes.md
 * y los textos oficiales que esas URLs apuntan). No agregar cifras que ninguna
 * fuente citada diga.
 *
 * TODO(F16): cuando exista src/components/legal/legal-notice.tsx, las páginas
 * deben renderizarlo en lugar de AVISO_APRENDE. No crear ese archivo desde aquí.
 * TODO(F16): src/lib/public-disclosure.ts tampoco está en este worktree. La
 * política de mostrar los informes del 5 U.S.C. § 13107 sin muro queda escrita
 * en el aviso y en la ficha PTR, no en ese módulo.
 */

export type FuenteAprende = {
  titulo: string;
  url: string;
};

export type FichaAprende = {
  slug: string;
  titulo: string;
  resumen: string;
  cuerpo: readonly string[];
  fuentes: readonly FuenteAprende[];
};

/** Aviso visible al pie de /aprende. Ver TODO(F16) arriba. */
export const AVISO_APRENDE =
  "Estas fichas resumen fuentes públicas y tienen fines solo informativos. No son asesoría de inversión, tributaria, legal ni contable, ni una recomendación personalizada de compra o venta. Reclu no ejecuta órdenes, no las enruta y no gestiona carteras. Los informes de funcionarios de Estados Unidos que cubre el 5 U.S.C. § 13107 se muestran sin muro de pago. Los datos personales que ya traen las fuentes se usan al mínimo y solo para explicar esa información pública (leyes 19.628 y 21.719).";

export const FICHAS_APRENDE: readonly FichaAprende[] = [
  {
    slug: "13f",
    titulo: "Formulario 13F",
    resumen:
      "Los fondos grandes informan a la SEC, cada trimestre, las acciones y valores relacionados que tienen. El informe sale hasta 45 días después del cierre y no es la cartera completa.",
    cuerpo: [
      "El informe de WhaleWisdom sobre backtesting con 13F describe esos filings como la divulgación trimestral que la SEC exige a los fondos grandes: posiciones en acciones y valores relacionados con acciones. Ese texto fija el umbral de un declarante 13F en US$100 millones de valor de mercado, y dice que el informe se publica 45 días después del cierre del trimestre.",
      "En el mismo texto, las posiciones cortas, la renta fija, las materias primas y otros valores no aparecen en el 13F. Copiar el informe no reproduce la estrategia completa del fondo. El atraso también cuenta: quien ajusta la cartera cuando el 13F ya salió puede estar actuando sobre información vieja. El ejemplo de ese informe rebalancea al día siguiente del plazo, 46 días después del cierre.",
      "WhaleWisdom advierte que no hay garantía de que elegir gestores para clonar con 13F resulte rentable en el futuro. Los envíos se consultan en la SEC, incluidos los que publica data.sec.gov/submissions.",
    ],
    fuentes: [
      {
        titulo: "WhaleWisdom — Creating 13F-based strategies (backtesting whitepaper, 16 de marzo de 2017)",
        url: "https://whalewisdom.com/help/backtesting_whitepaper",
      },
      {
        titulo: "SEC — sitio oficial (envíos en data.sec.gov/submissions)",
        url: "https://www.sec.gov/",
      },
    ],
  },
  {
    slug: "form-4",
    titulo: "Formulario 4",
    resumen:
      "Directores, altos ejecutivos y accionistas de 10% o más informan a la SEC la mayoría de sus operaciones. El Form 4 vence antes del cierre del segundo día hábil siguiente.",
    cuerpo: [
      "La página de conjuntos de datos de transacciones de insiders de la SEC dice que la sección 16 de la Securities Exchange Act de 1934 obliga a altos ejecutivos, directores y accionistas de 10% o más (“insiders”) a presentar informes iniciales y periódicos sobre sus tenencias en acciones de la compañía, incluida la mayoría de sus operaciones. Esos conjuntos salen de la parte XML de los Formularios 3, 4 y 5, tal como se presentaron, y se actualizan cada trimestre. Lo presentado después de las 17:30 hora del Este del último día hábil del trimestre entra en la publicación del trimestre siguiente.",
      "En la norma de la SEC de agosto de 2002, el Form 4 es el informe del cambio de titularidad. La Sarbanes-Oxley Act exige presentarlo antes del fin del segundo día hábil siguiente al día en que se ejecutó la operación, salvo cuando las reglas de la sección 16 dispongan otra cosa. La propia SEC ilustra el plazo: una operación ejecutada un martes 3 de septiembre vencía el jueves 5 de septiembre, al cierre (17:30 hora del Este).",
      "La SEC advierte que el conjunto de datos no garantiza exactitud, puede arrastrar errores de quien declaró o de la extracción, y no reemplaza el filing completo. Hay que leer el documento presentado antes de cualquier decisión de inversión.",
    ],
    fuentes: [
      {
        titulo: "SEC — Insider Transactions Data Sets",
        url: "https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets",
      },
      {
        titulo:
          "SEC — Ownership Reports and Trading by Officers, Directors and Principal Security Holders (27 de agosto de 2002)",
        url: "https://www.sec.gov/rules-regulations/2002/08/ownership-reports-trading-officers-directors-principal-security-holders",
      },
    ],
  },
  {
    slug: "ptr-stock-act",
    titulo: "PTR y la STOCK Act",
    resumen:
      "La STOCK Act de 2012 obliga a los miembros del Congreso a informar sus operaciones en acciones. Unusual Whales recoge un plazo de 30 a 45 días, y la ley ordena que esos informes sean públicos.",
    cuerpo: [
      "Unusual Whales resume la STOCK Act de 2012 así: los miembros del Congreso deben informar sus operaciones en acciones dentro de 30 a 45 días, aunque algunos presentan en 24 a 48 horas. El aviso sale cuando el documento ya está publicado, de modo que la operación ocurrió días o semanas antes. El mismo texto describe montos por tramos (US$1.000–15.000, US$15.000–50.000, US$50.000–100.000 y siguientes) y si la operación fue compra o venta. Esas declaraciones periódicas de transacciones son las que aquí llamamos PTR.",
      "El 5 U.S.C. § 13107 ordena que el Clerk de la Cámara de Representantes, el Secretario del Senado y las oficinas de ética pongan a disposición del público cada informe presentado bajo ese subcapítulo, con excepciones puntuales de inteligencia y de ciertos informes judiciales. En general, la inspección o la copia debe ofrecerse dentro de los 30 días desde que reciben el informe. Una nota de la STOCK Act publicada en esa misma página (la Representative Louise McIntosh Slaughter Stop Trading on Congressional Knowledge Act, Pub. L. 112-105) exige que los formularios de los miembros del Congreso, de los candidatos y del personal del Congreso queden en los sitios oficiales a más tardar 30 días después de presentarse. El informe de un miembro sigue público hasta seis años después de que deja el cargo.",
      "La misma sección permite un cargo razonable por el costo de reproducir o enviar una copia, y prohíbe obtener o usar un informe para un fin comercial, salvo los medios de noticias y comunicaciones cuando lo difunden al público general. En reclu estos informes se muestran sin muro de pago.",
      "Unusual Whales informa, en su reporte de trading del Congreso de 2024, que un 32,2% le ganó al mercado. Es una cifra de ese sitio, no un censo oficial. El atraso y los tramos de monto hacen que una PTR no sea la cartera real de la persona ni una instrucción para copiarla.",
    ],
    fuentes: [
      {
        titulo: "Unusual Whales — Congressional trade alerts (STOCK Act, plazo de 30 a 45 días)",
        url: "https://unusualwhales.com/lp/congressional-trade-alerts-subscription",
      },
      {
        titulo: "5 U.S.C. § 13107 — Custody of and public access to reports (Cornell LII)",
        url: "https://www.law.cornell.edu/uscode/text/5/13107",
      },
    ],
  },
  {
    slug: "oge-278-t",
    titulo: "OGE Form 278-T",
    resumen:
      "Quienes declaran patrimonio público en el poder ejecutivo de EE.UU. informan ciertas compras y ventas con dos plazos: 30 días desde que se enteran, y nunca más de 45 días después de la operación.",
    cuerpo: [
      "La guía de la Office of Government Ethics describe el OGE Form 278-T como el Periodic Transaction Report. Hay que presentarlo si la persona está en un cargo sujeto a declaración pública de patrimonio, si sirvió o se espera que sirva más de 60 días en ese cargo, y si tuvo una operación que debe informarse. Si no hubo operaciones informables, no se presenta un informe en blanco.",
      "El plazo, según esa guía y la Ethics in Government Act, es doble: dentro de los 30 días desde que la persona recibe aviso de la operación, y a más tardar 45 días después de la operación. La guía para oficiales de ética de la OGE, que cita el 5 U.S.C. § 13105(l), dice que se informan compras, ventas o canjes del declarante, del cónyuge o de un hijo dependiente, en acciones, bonos, futuros de materias primas y otros valores, cuando el monto superó US$1.000.",
      "La OGE indica que el formulario lo usan empleados del poder ejecutivo obligados a estas declaraciones periódicas públicas. En su sistema en línea están las copias de los informes de líderes cuyo sueldo corresponde a los niveles I y II del Executive Schedule. Otros informes públicos certificados por la OGE se piden con el OGE Form 201.",
    ],
    fuentes: [
      {
        titulo: "OGE — Form 278-T (guía: quién presenta y cuándo)",
        url: "https://www.oge.gov/web/278eGuide.nsf/Form_278-T",
      },
      {
        titulo: "OGE — guía para oficiales de ética (5 U.S.C. § 13105(l); umbral de US$1.000)",
        url: "https://oge.gov/web/278eGuide.nsf/For_Ethics_Officials",
      },
      {
        titulo: "OGE Form 278-T (versión Excel de febrero de 2024)",
        url: "https://www.oge.gov/Web/OGE.nsf/Resources/OGE+Form+278-T+(February+2024+Excel+version)",
      },
      {
        titulo: "OGE — informes públicos de líderes del ejecutivo (niveles I y II)",
        url: "https://extapps2.oge.gov/201/Presiden.nsf/",
      },
    ],
  },
  {
    slug: "hecho-esencial",
    titulo: "Hecho esencial",
    resumen:
      "En Chile, un hecho esencial es información relevante sobre un emisor y sus negocios. La CMF lo recibe y lo publica tal como llega, sin responder por su veracidad.",
    cuerpo: [
      "El glosario de CMF Educa define el hecho esencial como información relevante sobre la situación de un emisor y de sus negocios. Los ejemplos que da son aumentos de capital, citación a juntas de accionistas, pago de dividendos y contingencias.",
      "El buscador institucional permite consultar los hechos que, según la normativa del mercado de valores y de seguros, son esenciales o relevantes para la entidad fiscalizada. La CMF recibe y reproduce esa información. El propio sitio aclara que eso no implica responsabilidad del Servicio sobre la veracidad del contenido.",
      "La CMF publica, aparte, un índice de dividendos de acciones. Un dividendo puede aparecer como hecho esencial y, además, en esa estadística.",
    ],
    fuentes: [
      {
        titulo: "CMF Educa — glosario, hechos esenciales",
        url: "https://www.cmfchile.cl/educa/600/w3-propertyvalue-740.html",
      },
      {
        titulo: "CMF — buscador de hechos esenciales",
        url: "https://www.cmfchile.cl/institucional/hechos/hechos.php",
      },
      {
        titulo: "CMF — índice de dividendos de acciones",
        url: "https://www.cmfchile.cl/institucional/estadisticas/acc_dividendos_index.php",
      },
    ],
  },
  {
    slug: "afp-multifondos",
    titulo: "AFP y multifondos",
    resumen:
      "Una AFP administra cuentas individuales de capitalización. Los cinco fondos se distinguen por cuánta renta variable pueden tener: el A es el más expuesto y el E el más conservador.",
    cuerpo: [
      "Para la Superintendencia de Pensiones, AFP significa Administradora de Fondos de Pensiones, según el D.L. 3.500 de 1980. En el sistema de capitalización individual, cada afiliado tiene una cuenta donde se depositan sus cotizaciones. Las AFP invierten esos recursos para obtener una rentabilidad. Al pensionarse, ese saldo —cotizaciones más rentabilidad— es la base de la pensión.",
      "Los fondos de pensiones invierten en renta fija y en renta variable. La Superintendencia explica que se diferencian por la proporción invertida en títulos de renta variable, que describe como de mayor riesgo y mayor rentabilidad esperada. Esa proporción es más alta en el Fondo A y baja de forma progresiva en el B, el C, el D y el E.",
      "Los límites que publica la Superintendencia, en instrumentos de renta variable, son estos. Fondo A, más riesgoso: máximo 80% y mínimo 40%. Fondo B, riesgoso: máximo 60% y mínimo 25%. Fondo C, intermedio: máximo 40% y mínimo 15%. Fondo D, conservador: máximo 20% y mínimo 5%. Fondo E, más conservador: máximo 5% y mínimo 0%.",
    ],
    fuentes: [
      {
        titulo: "Superintendencia de Pensiones — definición de AFP (D.L. 3.500)",
        url: "https://www.spensiones.cl/portal/institucional/594/w3-article-6301.html",
      },
      {
        titulo: "Superintendencia de Pensiones — capitalización individual y AFP",
        url: "https://www.spensiones.cl/portal/institucional/594/w3-article-2818.html",
      },
      {
        titulo: "Superintendencia de Pensiones — diferencias entre tipos de fondo",
        url: "https://www.spensiones.cl/portal/institucional/594/w3-article-2835.html",
      },
    ],
  },
  {
    slug: "infoprobidad",
    titulo: "InfoProbidad",
    resumen:
      "El Consejo para la Transparencia y la Contraloría publican, como datos abiertos, declaraciones de probidad de autoridades. La licencia es CC BY 4.0 y los catálogos se actualizan los martes y los viernes.",
    cuerpo: [
      "InfoProbidad es una iniciativa del Consejo para la Transparencia y de la Contraloría General de la República. Publica catálogos CSV de datos abiertos asociados a la ley de probidad en la función pública y prevención de los conflictos de intereses. La licencia indicada en el catálogo es Creative Commons 4.0 (CC BY 4.0).",
      "Los catálogos cubren declaraciones y la autoridad respectiva, actividades paralelas, bienes inmuebles, bienes muebles declarados por la autoridad, su cónyuge u otro familiar, acciones o derechos en Chile y en el extranjero, valores transables o no en bolsa, y pasivos por deudas superiores a cien unidades tributarias mensuales. La actualización es semanal, los martes y los viernes, según las declaraciones recibidas. La fecha de publicación del dataset en el catálogo es el 5 de septiembre de 2016.",
      "Esas declaraciones incluyen datos de la autoridad y, en el catálogo de bienes muebles, de su cónyuge u otros familiares. Reclu las usa solo para mostrar lo que la fuente ya publicó, con esa finalidad, y no pide datos personales adicionales. El tratamiento se limita a lo necesario para esa finalidad (leyes 19.628 y 21.719).",
    ],
    fuentes: [
      {
        titulo: "InfoProbidad — catálogos de datos abiertos (CC BY 4.0)",
        url: "https://www.infoprobidad.cl/DatosAbiertos/Catalogos",
      },
    ],
  },
  {
    slug: "sesgos",
    titulo: "Sesgos: atraso y supervivencia",
    resumen:
      "Un informe público llega después de la operación. Una lista de estrategias que siguen vivas omite las que se cerraron, como el ETF Inverse Cramer (SJIM), liquidado en 2024.",
    cuerpo: [
      "El atraso está en las propias reglas. Un 13F se publica hasta 45 días después del cierre del trimestre, y WhaleWisdom señala que clonar con ese informe puede significar actuar sobre información vieja. Las operaciones del Congreso bajo la STOCK Act se informan en 30 a 45 días, según Unusual Whales, que además dice que el aviso nunca corresponde al mismo día de la operación. El OGE Form 278-T puede llegar hasta 45 días después de la operación. Mirar el rendimiento desde la publicación no es mirar el rendimiento desde el día de la compra.",
      "El sesgo de supervivencia es otro corte. El 25 de enero de 2024, el directorio del Northern Lights Fund Trust IV autorizó liquidar de forma ordenada el Inverse Cramer Tracker ETF (ticker SJIM). El comunicado dice que el último día de cotización en Cboe BZX sería el 13 de febrero de 2024, y que el fondo esperaba cesar operaciones, liquidar sus activos y repartir el producto a los accionistas el 23 de febrero de 2024. Una estrategia que se cierra deja de estar entre lo que todavía se puede consultar.",
      "Por eso un catálogo de lo que sigue publicado no es el universo de lo que existió. El atraso cambia la fecha desde la que se puede medir, y las bajas sacan estrategias de la lista.",
    ],
    fuentes: [
      {
        titulo: "WhaleWisdom — atraso de 45 días del 13F",
        url: "https://whalewisdom.com/help/backtesting_whitepaper",
      },
      {
        titulo: "Unusual Whales — plazo de 30 a 45 días de la STOCK Act",
        url: "https://unusualwhales.com/lp/congressional-trade-alerts-subscription",
      },
      {
        titulo: "OGE — Form 278-T, plazo máximo de 45 días",
        url: "https://www.oge.gov/web/278eGuide.nsf/Form_278-T",
      },
      {
        titulo:
          "Nasdaq — The Inverse Cramer Tracker ETF to be Closed and Liquidated (25 de enero de 2024)",
        url: "https://www.nasdaq.com/press-release/the-inverse-cramer-tracker-etf-to-be-closed-and-liquidated-2024-01-25",
      },
    ],
  },
  {
    slug: "ley-fintec",
    titulo: "Ley Fintec: por qué no te decimos qué comprar",
    resumen:
      "La Ley N° 21.521 define la asesoría de inversión como evaluar o recomendar si a un tercero le conviene una operación. Reclu no hace eso: no recomienda, no ejecuta órdenes y no las enruta.",
    cuerpo: [
      "CMF Educa explica que, con la promulgación de la Ley N° 21.521 el 4 de enero de 2023, la asesoría de inversión quedó regulada como servicio basado en tecnología y fiscalizado por la CMF. El número 2 del artículo 3 la define como la prestación de evaluaciones o recomendaciones a terceros sobre la conveniencia de realizar determinadas inversiones u operaciones en valores de oferta pública, instrumentos financieros o proyectos de inversión.",
      "Para prestar ese servicio, la misma ficha de la CMF dice que hay que estar inscrito en el Registro de Prestadores de Servicios Financieros y contar con autorización, según la Norma de Carácter General N° 502 de 2024. La ficha exceptúa a entidades que la Comisión ya fiscaliza: intermediarios de valores de la ley N° 18.045, administradoras generales de fondos y administradores de carteras de la ley N° 20.712, bancos, compañías de seguros y reaseguros, y corredores de productos de la ley N° 19.220.",
      "Reclu no evalúa si a una persona le conviene comprar o vender un instrumento. No da una recomendación personalizada. No ejecuta órdenes ni las enruta a un intermediario. Publica información de fuentes públicas para que cada cual la lea. Leer una cartera ajena no es una invitación a copiarla.",
    ],
    fuentes: [
      {
        titulo: "CMF Educa — asesores de inversión y Ley N° 21.521",
        url: "https://www.cmfchile.cl/educa/621/w3-propertyvalue-48194.html",
      },
      {
        titulo: "Biblioteca del Congreso Nacional — Ley N° 21.521",
        url: "https://www.bcn.cl/leychile/Navegar?idNorma=1187323",
      },
    ],
  },
  {
    slug: "dj-1929",
    titulo: "Declaración jurada 1929",
    resumen:
      "La DJ 1929 informa al SII las operaciones en el exterior. No es el Formulario 22, no es asesoría tributaria, y quien empezó a invertir en 2026 la presenta en 2027.",
    cuerpo: [
      "Las instrucciones del SII para el año tributario 2025 titulan la DJ 1929 como la declaración jurada anual sobre operaciones en el exterior. La sección A identifica al declarante y la sección B informa las operaciones. Deben informarla, entre otros, los contribuyentes con domicilio o residencia en Chile que invierten en el exterior, aunque la inversión no haya generado rentas. Las administradoras de fondos de pensiones no informan las inversiones ni las rentas de los fondos que administran; sí informan sus inversiones y rentas propias. Las rentas del exterior se informan aunque no se hayan remitido a Chile.",
      "Para acciones y ETF, el resumen verificado de esas instrucciones y las guías de Fintual y Racional usan estos códigos de operación: 10, dividendos de una entidad extranjera no controlada; 11, intereses; 13, ganancias de capital; 21, otras rentas. También se informan el nombre o razón social, el Tax-ID, el país, la participación, el monto actualizado al 31 de diciembre, las rentas del exterior y los impuestos pagados o retenidos en el exterior.",
      "La guía de Fintual dice que la DJ 1929 con las operaciones de 2025 se presenta antes del 30 de junio de 2026, y recomienda completarla antes del Formulario 22, cuyo plazo en esa guía llega al 30 de abril. Quien empezó a invertir en 2026 declara en 2027, según Fintual y Racional. La guía de Racional, cuando hubo rentas del exterior positivas, indica en el Formulario 22 la fila 12 código 1104 (“Otras rentas de fuente extranjera afectas al IGC o IA”), la fila 14 código 748 y la fila 49 código 746. En esa guía, el monto de las filas 14 y 49 es el mismo y no puede superar la renta de la fila 12.",
      "Esta ficha no es asesoría tributaria, legal ni contable. Los montos y el archivo que acepta el SII salen de las instrucciones oficiales y, si corresponde, del reporte de quien custodia las acciones. Reclu no reemplaza ese archivo.",
    ],
    fuentes: [
      {
        titulo: "SII — instrucciones DJ 1929, año tributario 2025 (PDF)",
        url: "https://www.sii.cl/declaraciones_juradas/suplemento/2025/instruccionesDJ1929.pdf",
      },
      {
        titulo: "Fintual — guía para completar la declaración 1929",
        url: "https://ayuda.fintual.cl/es/articles/7010875-guia-paso-a-paso-para-completar-la-declaracion-1929",
      },
      {
        titulo: "Racional — DJ 1929 y Formulario 22",
        url: "https://ayuda.racional.cl/es/articles/6010953-paso-a-paso-para-declarar-mis-stocks-al-sii-dj-1929-y-formulario-22",
      },
    ],
  },
];

export function fichaPorSlug(slug: string): FichaAprende | undefined {
  return FICHAS_APRENDE.find((ficha) => ficha.slug === slug);
}
