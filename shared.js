// Funções compartilhadas entre popup, service worker e content script.

function normalizar(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Classifica a nota do checador: "true" | "mixed" | "false" | "unknown". */
function classificar(rating) {
  const t = normalizar(rating || "");
  if (!t) return "unknown";
  if (/\b(nao|not)\b.*\b(verdade|verdadeiro|true|real|correto|correct)\b/.test(t)) return "false";
  if (/(parcial|enganos|distorc|descontextual|exagerad|impreciso|sem contexto|misleading|mixed|mixture|partly|partially|half|nao comprovado|unproven|unsupported|sem evidencia|needs context|missing context)/.test(t))
    return "mixed";
  if (/(falso|false|fake|mentira|mentiroso|incorret|errad|incorrect|wrong|golpe|boato|hoax|fraud|pants on fire|satira|satire)/.test(t))
    return "false";
  if (/\b(verdade|verdadeiro|true|correto|correct|accurate|exato|comprovado|real|fato|verdadera|cierto)\b/.test(t))
    return "true";
  return "unknown";
}

/** Corta em limite de palavra, sem passar de max. */
function encurtar(texto, max = 200) {
  const t = texto.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const i = corte.lastIndexOf(" ");
  return (i > max * 0.6 ? corte.slice(0, i) : corte).trim();
}

/** Palavras significativas de um texto (para comparar títulos com alegações). */
function palavras(texto) {
  return new Set(normalizar(texto).split(/[^a-z0-9]+/).filter((w) => w.length > 3));
}

/** Fração das palavras do menor texto que aparece no outro (0 a 1). */
function sobreposicao(a, b) {
  const A = palavras(a), B = palavras(b);
  if (!A.size || !B.size) return 0;
  let comuns = 0;
  for (const w of A) if (B.has(w)) comuns++;
  return comuns / Math.min(A.size, B.size);
}

/** Veredito agregado de várias checagens. */
function veredito(notas) {
  const c = { true: 0, mixed: 0, false: 0 };
  for (const n of notas) if (c[n] !== undefined) c[n]++;
  if (!c.true && !c.mixed && !c.false) return "unknown";
  if (c.false > c.true && c.false >= c.mixed) return "false";
  if (c.true > c.false && c.true >= c.mixed) return "true";
  return "mixed";
}

/* ---------- Outras agências (busca de reserva) ---------- */

// Agências com API WordPress aberta. Não trazem veredito estruturado: só título e link.
const AGENCIAS = [
  { nome: "Boatos.org", url: "https://www.boatos.org/wp-json/wp/v2/posts" },
  { nome: "Agência Lupa", url: "https://www.agencialupa.org/wp-json/wp/v2/posts" },
];

/** Até 5 palavras significativas: a busca do WordPress falha com frases longas. */
function termosDeBusca(texto) {
  const uteis = encurtar(texto).split(/\s+/).filter((w) => w.replace(/\W/g, "").length > 3);
  return uteis.slice(0, 5).join(" ");
}

/** Decodifica entidades HTML dos títulos (sem DOM, para funcionar no service worker). */
function decodificar(html) {
  const nomes = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => nomes[n.toLowerCase()] ?? m)
    .trim();
}

/** Só infere nota quando o título afirma isso de forma explícita ("É falso que…"). */
const PADRAO_NOTA = /\b(e|sao|foi|eram)\s+(falso|falsa|falsos|falsas|fake|enganos[oa]s?|verdadeir[oa]s?)\b|nao e verdade|^(falso|enganoso|verdade)\b|\bfake\b|e mentira/;
function inferirNota(titulo) {
  return PADRAO_NOTA.test(normalizar(titulo)) ? classificar(titulo) : "unknown";
}

/**
 * Descarta resultados que só compartilham um nome ou tema com o trecho buscado.
 * Exige ao menos 2 palavras em comum e metade das (até 6) palavras do trecho.
 */
function relevante(titulo, texto) {
  const A = palavras(texto), B = palavras(titulo);
  let comuns = 0;
  for (const w of A) if (B.has(w)) comuns++;
  return comuns >= Math.min(2, A.size) && comuns >= 0.5 * Math.min(A.size, 6);
}

async function consultarAgencia(ag, termos, signal) {
  const params = new URLSearchParams({ search: termos, per_page: "3", _fields: "title,link,date" });
  const resp = await fetch(`${ag.url}?${params}`, { signal });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const posts = await resp.json();
  return posts
    .filter((p) => /^https?:\/\//i.test(p.link))
    .map((p) => ({ agencia: ag.nome, titulo: decodificar(p.title?.rendered), url: p.link, data: p.date }));
}

/** Consulta todas as agências. Retorna { itens, falhou } (falhou = todas deram erro). */
async function buscarEmAgencias(texto, signal) {
  const termos = termosDeBusca(texto);
  if (!termos) return { itens: [], falhou: false };
  const resultados = await Promise.allSettled(AGENCIAS.map((a) => consultarAgencia(a, termos, signal)));
  const itens = resultados
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((it) => relevante(it.titulo, texto));
  return { itens, falhou: resultados.every((r) => r.status === "rejected") };
}

/* ---------- Notas longas ---------- */

const NOTA_CURTA = { true: "Verdadeiro", mixed: "Parcial", false: "Falso", unknown: "Sem nota" };
const NOTA_MAX = 24;

/** Texto do carimbo: a nota do checador se for curta; senão, o rótulo da classificação. */
function carimbo(rating, nota) {
  const t = (rating || "").trim();
  return t && t.length <= NOTA_MAX ? t : NOTA_CURTA[nota] || "Sem nota";
}

/** Nota longa (uma frase inteira) vai como explicação abaixo do carimbo. Vazio se cabe no carimbo. */
function notaLonga(rating) {
  const t = (rating || "").trim();
  return t.length > NOTA_MAX ? t : "";
}
