# Informe de revisión legal preliminar: Reclu (reclu.cl)

**Fecha:** 20-10-2026 (hora de Chile, UTC-3) · **Rama revisada:** `mejoras/integracion`, en el worktree `C:\reclu-work\integracion` (commit b163b33). Ojo: la carpeta `C:\Users\manue\OneDrive\Desktop\reclu` está en `main`, y ahí no existen los docs ni el código v2.
**Método:** solo lectura de docs, código y migraciones. No se modificó nada ni se abrieron archivos `.env` ni de claves.

> **Aviso importante:** este informe es una revisión técnico-legal preliminar hecha por un asistente automatizado. **No reemplaza la asesoría de un abogado** habilitado en Chile. Las referencias legales marcadas con [VERIFICAR] no se confirmaron en una fuente oficial.

## 0. Fuentes legales consultadas (20-10-2026)
| Norma | Link | Qué se verificó |
|---|---|---|
| Ley 21.521 (Fintec) | https://www.bcn.cl/leychile/Navegar?idNorma=1187323 | Art. 3 N°2 define "asesoría de inversión" como "evaluaciones o recomendaciones a terceros respecto de la conveniencia de realizar determinadas inversiones u operaciones en valores de oferta pública, instrumentos financieros…". Art. 3 N°6 define "enrutamiento de órdenes". Art. 5 exige inscripción en el Registro de Prestadores de Servicios Financieros (CMF) para prestar en forma profesional asesoría de inversión, enrutamiento, intermediación y custodia. |
| CMF, Registro de Prestadores | https://www.cmfchile.cl/institucional/estadisticas/seg_rgpsf.php | La sola inscripción no habilita: se necesita una autorización especial. |
| CMF, NCG 502 (12-01-2024) | https://www.cmfchile.cl/normativa/ncg_502_2024.pdf | Se presta servicio "en Chile" cuando la oferta se dirige a residentes en Chile por cualquier medio. Se pide describir la automatización y validar los algoritmos. |
| Ley 21.719 (datos personales, modifica la Ley 19.628) | https://www.bcn.cl/leychile/navegar/imprimir?idNorma=1209272&idVersion=2026-12-01 | La versión vigente rige desde el **01-12-2026**. Arts. 27-28: transferencia internacional (país adecuado, cláusulas contractuales o modelos de certificación; sin ellos, solo transferencias específicas con consentimiento expreso, entre otras causales). |
| Art. 16 (Ley 19.628, texto dado por la 21.719) | mismo link de BCN (resumen secundario en kpc.kromi.cl/ley-21719/articulo-16) | Los datos sensibles exigen, por regla general, consentimiento expreso. |
| Síntesis BCN de la Ley 21.719 | https://obtienearchivo.bcn.cl/obtienearchivo?id=repositorio%2F10221%2F37137%2F1%2FInforme_12_25_Ley_Datos_Personales_rev.pdf | Crea la Agencia de Protección de Datos Personales; transferencias en arts. 27-29. |

**Sin verificar:** si los datos de inversiones o patrimonio caben en la definición legal de "dato sensible" [VERIFICAR: art. 2 letra g, Ley 19.628 modificada]; el régimen especial de datos económicos, financieros y bancarios [VERIFICAR: art. 17]; plazos de respuesta a derechos ARCO+ [VERIFICAR]; multas [VERIFICAR]; Ley 17.336 de propiedad intelectual sobre noticias [VERIFICAR]; Ley 19.496 del consumidor sobre la cláusula de no reembolso y la limitación de responsabilidad [VERIFICAR arts. 3 bis y 16]; NCG 503 [VERIFICAR]. Incluso si las tenencias no fueran "sensibles" por definición, se recomienda tratarlas con ese estándar.

---

## 1. Riesgos ordenados por gravedad

### ALTA

**A1. El chat de IA puede caer en "asesoría de inversión" y no filtra sus respuestas**
- **Qué es:** el system prompt presenta al bot como "experto en inversiones" y se limita a pedirle que no dé consejos personalizados. El filtro de salida `advice-filter.ts` (con el descargo `AI_DISCLAIMER`) **solo lo usa `/api/explain-alert`**. El chat transmite la respuesta del modelo al usuario sin filtrarla (`streamChat`) y sin descargo por respuesta. Un LLM puede generar "te conviene comprar X", que calza con "recomendaciones… sobre la conveniencia de realizar determinadas inversiones" (Ley 21.521, art. 3 N°2). Si eso ocurre de forma habitual y en un plan pagado, puede leerse como prestación profesional sin inscripción (art. 5).
- **Dónde:** `src/app/api/chat/route.ts:15-19,151-162`; `src/lib/advice-filter.ts`; `src/lib/llm.ts`.
- **Qué hacer:** (1) Quitar "experto en inversiones" del prompt y describirlo como un asistente que explica datos públicos. (2) Filtrar la salida del chat también: armar la respuesta completa en un buffer antes de mostrarla, o filtrar por fragmentos y cortar la respuesta si aparece lenguaje de recomendación. (3) Mostrar un descargo fijo en la interfaz bajo cada respuesta. (4) Registrar en logs los casos que el filtro bloquea para revisarlos. (5) Que un abogado confirme el criterio antes de cobrar por el chat.

**A2. "Mi portafolio" con IA y alertas personalizadas (F58+): lo más cercano a asesoría personalizada**
- **Qué es:** el flujo cruza noticias con las tenencias del usuario ("esta noticia toca el 23% de tu cartera"), muestra una dirección del impacto ("positiva/negativa") y manda alertas automáticas por cartera. Analizar la cartera de un tercero y decirle qué efecto puede tener en ella se parece a una "evaluación… a terceros". El propio doc lo reconoce y pide pasar por un abogado.
- **Dónde:** `docs/mi-portafolio-ia.md` §5-§9; `supabase/migrations/050_mi_portafolio.sql`, `051_noticias_impacto.sql`; futuros `src/app/api/impact/*`.
- **Qué hacer:** no lanzarlo sin opinión legal escrita. Mientras tanto: no mostrar "dirección positiva/negativa" asociada a la cartera, no proponer pesos ni acciones, dejar las alertas automáticas apagadas por defecto (opt-in) y aplicar el filtro de salida y el descargo en cada análisis. Alternativa: evaluar la inscripción en la CMF o una alianza con un asesor inscrito.

**A3. Tenencias del usuario sin consentimiento expreso ni base legal efectiva**
- **Qué es:** la migración 050 crea `user_portfolio_settings.consent_at`, pero **ningún archivo en `src/` lo lee ni lo escribe**. `saveUserHoldings` e `importHoldings` guardan la cartera sin pedir consentimiento. Con la Ley 21.719 vigente desde el 01-12-2026, conviene tratar las tenencias como datos sensibles, con consentimiento expreso (art. 16), finalidad informada y prueba del consentimiento.
- **Dónde:** `src/app/actions/holdings.ts`; `supabase/migrations/050_mi_portafolio.sql` (consent_at); `src/app/privacidad/page.tsx`.
- **Qué hacer:** bloquear el guardado o la importación si `consent_at` es nulo. Agregar una casilla, sin marcar por defecto, con el texto de la §2.5. Guardar la versión del texto aceptado (como ya se hace en el newsletter). Permitir retirar el consentimiento, lo que borra los datos.

**A4. La política de privacidad está desactualizada y en parte es inexacta**
- **Qué es:** cita solo la Ley 19.628 (no la 21.719). Dice que a OpenRouter "nunca [se envían] datos personales", pero el chat recibe texto libre del usuario, que puede incluir sus posiciones o datos propios, y los mensajes se **guardan** en `chat_messages` sin plazo de retención declarado. Tampoco menciona: transferencia internacional (Supabase, Vercel, Resend y OpenRouter están fuera de Chile; el proveedor final del modelo también), Telegram, los proveedores de pago (Flow y Mercado Pago), la cookie de referido, la comunidad, la API ni el responsable con su RUT y domicilio. Además, la eliminación de cuenta es solo por correo y en "30 días".
- **Dónde:** `src/app/privacidad/page.tsx`; `src/app/api/chat/route.ts:98` (insert en chat_messages).
- **Qué hacer:** reemplazarla por el borrador de la §2.3. Corregir la frase sobre OpenRouter. Firmar acuerdos de tratamiento de datos (DPA o cláusulas contractuales) con cada proveedor y documentar el mecanismo de los arts. 27-28. Usar en OpenRouter solo proveedores sin retención ni entrenamiento (no modelos `:free`).

**A5. Transferencia internacional a OpenRouter y al proveedor del modelo**
- **Qué es:** OpenRouter enruta las llamadas hacia terceros, como Google y otros. El modelo se elige por la variable de entorno `OPENROUTER_MODEL`, sin restricción en el código, así que podría configurarse un modelo `:free` que use los datos para entrenar.
- **Dónde:** `src/lib/llm.ts` (buildPayload: no envía preferencias de proveedor ni de recolección de datos); `docs/mi-portafolio-ia.md` §9.
- **Qué hacer:** aceptar solo una lista de modelos permitidos en el código y rechazar `:free`. Enviar las preferencias de proveedor de OpenRouter que niegan la recolección de datos [VERIFICAR: nombre exacto del parámetro en la doc de OpenRouter]. Minimizar lo que se envía: pesos en %, sin montos, nombre ni correo. Declarar la transferencia y su mecanismo legal (art. 27).

### MEDIA

**M1. No se puede borrar la cuenta desde la app y no hay retención definida**
- **Dónde:** no existe ninguna acción de borrar cuenta en `src/`. `delete_my_portfolio()` (050) borra solo la cartera. Las FK con `on delete cascade` (004, 009, 037, 038, 040, 050, 051) están bien hechas. `chat_messages`, `payment_events.payload` (cuerpo crudo del webhook, `lib/billing/process.ts:38`) y los registros de servidor no tienen plazo de retención. `user_impact_requests` sí tiene una purga a 90 días.
- **Qué hacer:** agregar "Eliminar mi cuenta" en Ajustes (borrado con service role que dispare los cascade). Publicar una tabla de retención: chat 90 días, eventos de pago según la obligación tributaria [VERIFICAR plazo], logs 30-90 días. Programar las purgas.

**M2. Comunidad de creadores (moderación, Fintec y responsabilidad por contenido)**
- **Qué es:** usuarios que publican carteras, biografías y conflictos de interés. Hay un filtro de imperativos (`containsAdviceImperative`) y moderación manual en `/admin/comunidad`. El flag está apagado, y la doc exige revisión legal antes de encenderlo.
- **Dónde:** `src/lib/community.ts`, `src/app/admin/comunidad/*`, `supabase/migrations/038_comunidad.sql`.
- **Qué hacer:** antes de encenderla, preparar reglas de comunidad (sin recomendaciones, sin promesas de rentabilidad, sin manipulación de mercado, sin pump & dump), un botón para denunciar, revelación obligatoria de conflictos, prohibición de que los creadores cobren dentro de la plataforma y una cláusula de contenido de usuario en los términos (§2.4). Si los creadores ganan dinero por audiencia, el riesgo Fintec sube.

**M3. Ranking y "replicar" carteras**
- **Qué es:** un ranking de rentabilidad con nombre "beat market", más una función para replicar carteras (F41), puede leerse como una recomendación implícita de inversión. Además, el doc de seguridad detecta que el ranking muestra métricas premium sin muro de pago.
- **Dónde:** `src/app/ranking/page.tsx`, `src/lib/ranking.ts`, `src/components/beat-market-ranking.tsx`; `docs/revision-seguridad-2026-10-20.md` §5.
- **Qué hacer:** agregar una metodología visible, el aviso de que la rentabilidad pasada no garantiza resultados, el atraso de divulgación y la nota de que es una simulación (no la cartera real del gestor). Evitar los verbos "copia" y "replica" como llamado a la acción. Confirmar con un abogado la función de replicar.

**M4. Noticias y datos de terceros (derechos de autor y términos de uso)**
- **Qué es:** el plan contempla RSS de Yahoo, Finnhub, DF, La Tercera y Emol, que tienen términos "dudosos" según el propio doc. Los precios vienen de Yahoo chart v8, una API no oficial cuyos términos probablemente prohíben el uso comercial [VERIFICAR]. Hay scraping de Renta 4 (PDF semanal) y de BICE y MBI, y en los términos se menciona Capitol Trades, que está obsoleto. EDGAR (SEC) es dominio público, bien. Para los datos de la CMF, la API pública dice "términos de la CMF pendientes de revisión" con un link truncado.
- **Dónde:** `docs/mi-portafolio-ia.md` §4; `docs/sources.md`; `scrapers/prices.py`; `scrapers/news_edgar.py`; `src/app/api-docs/page.tsx:21-22`; `src/app/terminos/page.tsx` §3.
- **Qué hacer:** armar un registro de fuentes con su licencia y fecha. Guardar solo título, link y un resumen propio (ya está la regla de ≤500 caracteres en `news_items.summary`). No revender por la API datos de terceros sin licencia. Para producción, cambiar a un proveedor de precios licenciado. Pedir permiso a Renta 4, BICE y MBI o limitarse a citarlos con link. Quitar Capitol Trades de los términos.

**M5. La API pública de datos re-licencia datos de terceros y personas**
- **Qué es:** `/api/v1` expone, entre otros, insiders con `owner_name` (personas naturales, Form 4 de la SEC), InfoProbidad y accionistas. La licencia aparece como "pendiente". Republicar en bloque datos de personas naturales es tratamiento de datos personales, aunque la fuente sea pública.
- **Dónde:** `src/app/api/v1/[dataset]/route.ts:310`; `src/lib/api-datasets.ts`; `040_api_claves.sql`; `docs/configuracion-produccion.md` §5.
- **Qué hacer:** términos de API propios (§2.4 B), finalidad informativa, prohibición de reidentificar o perfilar personas, atribución a la fuente. Excluir u ofuscar los nombres de personas naturales chilenas (InfoProbidad y accionistas) y decidir qué pasa con `owner_name`. Mantener el flag apagado hasta tener esto.

**M6. Los términos tienen cláusulas débiles o posiblemente abusivas**
- **Qué es:** "No se realizan reembolsos por períodos parciales" y la limitación de responsabilidad amplia pueden chocar con la Ley 19.496 [VERIFICAR]. Faltan: identificación del proveedor (razón social y RUT), ley aplicable, IA, comunidad, API, referidos, uso aceptable, prohibición de scraping y retracto [VERIFICAR si aplica]. Además, dice que el plan gratuito permite "hasta 2 portafolios", lo que podría no calzar con `plans.ts` [VERIFICAR].
- **Dónde:** `src/app/terminos/page.tsx` §5-§8.
- **Qué hacer:** reemplazarlos por el borrador de la §2.4.

**M7. Programa de referidos**
- **Qué es:** cookie `ref` de 30 días (`src/lib/referrals.ts:14-17`, `proxy.ts:65`) que no se declara en la política, y el código se copia a metadata sin sanear. El premio es 1 mes Pro.
- **Qué hacer:** declarar la cookie, publicar bases del programa (quién califica, cuándo se entrega el premio, sin autorreferidos, posibilidad de terminar el programa) y validar el formato del código.

**M8. `/api/explain-alert` explica contenido que envía el cliente bajo la marca Reclu**
- **Qué es:** se pueden fabricar "explicaciones" falsas con el descargo y la marca de la plataforma, lo que trae riesgo reputacional y de desinformación de mercado.
- **Dónde:** `docs/revision-seguridad-2026-10-20.md` (M8); `src/app/api/explain-alert/route.ts`.
- **Qué hacer:** usar solo alertas reales leídas desde la base.

### BAJA

**B1. Cookies:** la analítica (Plausible) no usa cookies, bien. Existen cookies de sesión de Supabase (necesarias) y la de referido (marketing o atribución), y no hay aviso. → Aviso breve (§2.6) y mención en la política. No se requiere un banner con bloqueo si solo hay cookies necesarias, pero la de referido conviene informarla [VERIFICAR criterio de la Agencia].

**B2. Patrocinios:** `sponsored-slot.tsx` y la migración 042 deben rotular el contenido como "Patrocinado", y los patrocinadores no deben ser emisores de instrumentos recomendados [VERIFICAR: Ley 19.496, publicidad].

**B3. Datos de personas en fuentes públicas** (accionistas de 033/045, OGE, congresistas, wallets de Polymarket): sostener la anonimización con un trigger (M2/M3 del doc de seguridad) y respetar la finalidad del dato público.

**B4. El disclaimer** afirma que Reclu "no está registrada… ante la CMF": es correcto, pero conviene agregar que es un servicio informativo que no requiere registro según su diseño [VERIFICAR con abogado] y enlazarlo desde cada respuesta de IA y cada alerta.

**B5. Seguridad como obligación legal:** la Ley 21.719 incluye un deber de seguridad [VERIFICAR artículo]. El hallazgo A1 del doc de seguridad (`/compare` envía holdings premium al navegador) es más contractual que de datos personales (no son carteras de usuarios), pero conviene corregirlo junto con M6 y M7.

---

## 2. Textos propuestos (borradores para revisión de un abogado)

### 2.1 Descargo general de no asesoría (pie de página, /disclaimer, alertas y correos)
> Reclu (reclu.cl) es un servicio de **información**. Mostramos datos públicos (declaraciones de congresistas de EE.UU., reportes 13F, carteras de ETF y fondos, informes de corredoras y hechos esenciales de la CMF) con el atraso propio de cada fuente. **Nada de lo que publicamos es una recomendación ni asesoría de inversión**, personalizada o general, en los términos de la Ley N° 21.521. No ejecutamos ni enrutamos órdenes, no custodiamos dinero ni instrumentos y no tenemos acceso a tus cuentas. Reclu no está inscrita en el Registro de Prestadores de Servicios Financieros de la CMF. La rentabilidad pasada no garantiza resultados futuros y toda inversión puede generar pérdidas, incluida la del capital completo. Antes de invertir, evalúa tu situación o consulta a un asesor autorizado por la CMF.

### 2.2 Descargo para respuestas de IA (bajo cada respuesta del chat, explicaciones e impacto)
> Respuesta generada automáticamente por inteligencia artificial a partir de datos públicos. **No es una recomendación de compra, venta ni mantención** ni asesoría personalizada. Puede contener errores u omisiones: revisa siempre la fuente citada. Las decisiones de inversión son solo tuyas.

Versión corta (para chips o alertas): *"IA · Información, no recomendación · Puede tener errores."*

### 2.3 Política de privacidad (borrador)
**Política de privacidad de Reclu** · Última actualización: [fecha]

1. **Responsable.** [Razón social], RUT [●], domicilio [●], Chile. Contacto: privacidad@reclu.cl. [Delegado de protección de datos, si se designa.]
2. **Normativa.** Ley N° 19.628 sobre protección de datos personales, con las modificaciones de la Ley N° 21.719 (vigentes desde el 1 de diciembre de 2026).
3. **Datos que tratamos y para qué** (base legal):
   - Cuenta (correo, nombre, proveedor de inicio de sesión): para prestar el servicio (ejecución del contrato).
   - Plan y pagos (estado de suscripción e identificadores del procesador; **no** guardamos datos de tarjetas): ejecución del contrato y obligaciones legales.
   - Preferencias y alertas (carteras seguidas, reglas, canal de correo o Telegram): ejecución del contrato.
   - **Tu cartera** (tickers, pesos y, si los ingresas, cantidad, costo promedio, moneda y corredora): solo con tu **consentimiento expreso**, para comparar tu cartera con otras y mostrarte noticias relacionadas. La tratamos con estándar de dato sensible. Las cartolas que subas se procesan en memoria y no se guardan.
   - Conversaciones con el asistente de IA: para responder y para prevenir abusos (interés legítimo o ejecución del contrato). Te recomendamos no incluir datos personales en tus preguntas.
   - Newsletter: consentimiento.
   - Comunidad (alias, biografía, carteras publicadas): consentimiento. El contenido es público.
   - Datos técnicos (IP, registros): seguridad (interés legítimo).
   - Referidos: el código que te invitó, para asignar el beneficio.
4. **IA.** Para generar respuestas enviamos tu pregunta y, cuando corresponde, los **pesos porcentuales** de tu cartera (nunca tu nombre, correo ni montos) a OpenRouter Inc. (EE.UU.), que la dirige al proveedor del modelo [nombre, país]. Configuramos proveedores que no usan los datos para entrenar ni los retienen más allá de lo necesario [VERIFICAR contrato].
5. **Encargados y transferencias internacionales.** Supabase (base de datos, [región]), Vercel (hosting, EE.UU.), Resend (correo, EE.UU.), OpenRouter y el proveedor del modelo (EE.UU.), Telegram (si lo activas), Flow y Mercado Pago (pagos), Plausible (analítica sin cookies, UE). Algunos están fuera de Chile. Las transferencias se amparan en [cláusulas contractuales tipo / garantías adecuadas] conforme a los artículos 27 y 28 de la ley [VERIFICAR mecanismo con cada proveedor]. No vendemos tus datos.
6. **Retención.** Cuenta: mientras esté activa. Cartera: hasta que la borres, retires el consentimiento o elimines tu cuenta. Chat: [90] días. Registros de impacto de IA: 90 días. Registros técnicos: [30-90] días. Pagos: el plazo que exija la ley tributaria [VERIFICAR]. Después se eliminan o anonimizan.
7. **Tus derechos.** Acceso, rectificación, supresión, oposición, portabilidad y bloqueo, y a no ser objeto de decisiones basadas solo en tratamiento automatizado [VERIFICAR alcance]. Puedes borrar tu cartera y **eliminar tu cuenta desde Ajustes**, o escribir a privacidad@reclu.cl. Responderemos dentro del plazo legal [VERIFICAR]. Puedes retirar tu consentimiento en cualquier momento, sin efecto retroactivo. Si no quedas conforme, puedes recurrir a la Agencia de Protección de Datos Personales.
8. **Seguridad.** Cifrado TLS, control de acceso por usuario (RLS), mínimo privilegio y minimización de lo que se envía a la IA. Si hay una vulneración, notificaremos según la ley.
9. **Cookies.** Ver el aviso de cookies.
10. **Menores.** El servicio no está dirigido a menores de 18 años.
11. **Cambios.** Avisaremos por correo los cambios relevantes.

### 2.4 Términos y condiciones (borrador)
**A. Términos de uso de Reclu** · Última actualización: [fecha]
1. **Partes.** [Razón social], RUT [●] ("Reclu") y tú, el usuario. Usarlo requiere ser mayor de 18 años.
2. **Servicio.** Información y herramientas sobre carteras públicas, alertas y asistente de IA. **No es asesoría de inversión** (ver el Descargo, que forma parte de estos términos). No ejecutamos órdenes ni custodiamos activos.
3. **IA.** Las respuestas son automáticas, pueden ser inexactas y no deben ser la base única de una decisión. Está prohibido intentar que la IA genere recomendaciones o contenido ilícito.
4. **Datos de terceros.** Los datos vienen de fuentes públicas, citadas en cada caso y con su atraso. No garantizamos que sean exactos ni oportunos.
5. **Planes y pagos.** Precios en CLP con IVA incluido [VERIFICAR]. Renovación automática y cancelación en cualquier momento desde Ajustes: mantienes el acceso hasta el fin del período pagado. Esto no limita los derechos irrenunciables que te da la Ley N° 19.496 [VERIFICAR retracto y reembolsos].
6. **Contenido de usuarios (Comunidad).** Eres responsable de lo que publicas. Está prohibido: recomendar comprar o vender, prometer rentabilidades, difundir información falsa o privilegiada, manipular precios, hacer spam, promocionar servicios financieros no autorizados y publicar datos de terceros. Debes declarar tus conflictos de interés. Podemos moderar, ocultar o eliminar contenido y suspender cuentas; puedes denunciar contenido y apelar en [canal]. Nos otorgas una licencia no exclusiva para mostrar tu contenido en el servicio.
7. **Referidos.** Según las bases publicadas en [link]. Reclu puede modificar o terminar el programa, respetando los beneficios ya ganados.
8. **Uso aceptable.** Prohibido el scraping, la reventa de datos, eludir el muro de pago o los límites y el uso automatizado fuera de la API.
9. **Propiedad intelectual.** La marca, el diseño, los textos y la selección de datos son de Reclu. Los datos públicos y el contenido de terceros pertenecen a sus titulares.
10. **Responsabilidad.** Reclu no responde por decisiones de inversión que tomes con base en el servicio. Nada en estos términos excluye la responsabilidad que la ley no permite excluir [VERIFICAR].
11. **Cambios.** Avisaremos con 15 días de anticipación los cambios sustanciales.
12. **Ley y jurisdicción.** Ley chilena; tribunales de [Santiago], sin perjuicio de los derechos del consumidor.

**B. Términos de la API de datos (anexo)**
Las claves son personales. Los límites de uso dependen del plan. Los datos se entregan para uso informativo, con obligación de atribuir a Reclu y a la fuente original. Se prohíbe reidentificar, perfilar o contactar a personas naturales que aparezcan en los datos, y usar los datos para dar asesoría. No hay garantía de disponibilidad. Las licencias de cada dataset se indican en la respuesta. Podemos revocar claves si se incumplen estos términos.

### 2.5 Consentimiento para datos de portafolio y transferencia internacional (casilla sin marcar, obligatoria para guardar la cartera)
> ☐ **Autorizo a [Razón social] (Reclu)** a tratar los datos de mi cartera que ingrese o importe (instrumentos, pesos y, si los agrego, cantidades, costo promedio, moneda y corredora) con el único fin de mostrarme comparaciones, la exposición de mi cartera a noticias y, si las activo, alertas. Entiendo que: (i) estos datos se tratan como datos sensibles; (ii) para responder preguntas con IA se envían a OpenRouter Inc. y al proveedor del modelo, en EE.UU., **solo los pesos porcentuales, sin mi nombre, correo ni montos**, y que los datos se alojan en proveedores fuera de Chile, según la [Política de privacidad]; (iii) Reclu no me da recomendaciones de inversión; (iv) puedo retirar este consentimiento y borrar mi cartera en cualquier momento desde Ajustes. *Versión del texto: v1, [fecha].*

(Guardar `consent_at` y la versión del texto. Las alertas automáticas van en una casilla aparte, también opt-in.)

### 2.6 Aviso de cookies (banner discreto o sección de la política)
> Usamos solo cookies **necesarias**: sesión e inicio de sesión (Supabase) y seguridad. Si llegas con un enlace de invitación, guardamos durante 30 días una cookie con el código del referido para asignar el beneficio. Medimos visitas con Plausible, que **no usa cookies** ni te identifica. No usamos cookies publicitarias ni de terceros para seguimiento. Más información en la [Política de privacidad]. [Entendido]

---

## 3. Checklist antes de lanzar (por prioridad)
1. Filtro de salida y descargo en el chat; quitar "experto en inversiones" (A1).
2. Opinión legal escrita sobre Fintec para el chat, Mi portafolio, el ranking, replicar y la comunidad (A1-A2, M2-M3).
3. Consentimiento efectivo con `consent_at` + nueva política de privacidad + DPA y cláusulas con los proveedores + bloquear modelos `:free` (A3-A5).
4. Botón para eliminar la cuenta y tabla de retención con purgas (M1).
5. Licencias de fuentes (Yahoo, Renta 4, BICE, MBI y medios) y términos de la API (M4-M5).
6. Nuevos términos, bases de referidos y aviso de cookies (M6-M7, B1).

*Este documento no constituye asesoría legal. Debe revisarlo un abogado chileno con experiencia en regulación financiera (CMF/Fintec) y protección de datos antes de publicar cualquiera de estos textos o lanzar las funciones señaladas.*
