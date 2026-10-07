const API_URL = "https://factchecktools.googleapis.com/v1alpha1/claims:search";
const TIMEOUT_MS = 10000;
const MAX_QUERY = 200;

const $query = document.getElementById("query");
const $buscar = document.getElementById("buscar");
const $status = document.getElementById("status");
const $resultados = document.getElementById("resultados");
const $mais = document.getElementById("mais");
const $resumo = document.getElementById("resumo");
const $agencias = document.getElementById("agencias");


const ROTULO = { true: "Verdadeiro", mixed: "Parcial", false: "Falso", unknown: "Sem nota" };
const TITULO = {
  true: "Checadores apontam verdadeiro",
  mixed: "Checadores apontam incompleto ou enganoso",
  false: "Checadores apontam falso",
  unknown: "Checadores não deram nota clara",
};

/** Atualiza a linha de status. tipo: "" | "erro" | "carregando". */
function setStatus(texto, tipo = "") {
  $status.textContent = texto;
  $status.className = tipo;
}

let controller = null; // permite cancelar a busca anterior
let estado = { query: "", usada: "", pageToken: "" };
let todas = []; // todas as alegações exibidas

document.getElementById("opcoes").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

$buscar.addEventListener("click", () => buscar($query.value));
$mais.addEventListener("click", carregarMais);
$query.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) buscar($query.value);
});

/* ---------- Texto inicial ---------- */

async function textoInicial() {
  // 1) Texto vindo do menu de contexto
  const { pendingText } = await chrome.storage.session.get("pendingText");
  if (pendingText) {
    await chrome.storage.session.remove("pendingText");
    chrome.action.setBadgeText({ text: "" });
    return pendingText;
  }
  // 2) Texto atualmente selecionado na aba ativa
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return "";
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => String(window.getSelection() || ""),
    });
    return (res?.result || "").trim();
  } catch {
    return ""; // páginas internas do navegador não permitem scripts
  }
}

/* ---------- Utilidades ---------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatarData(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("pt-BR");
}

/** Variantes da consulta, da mais específica para a mais ampla. */
function variantes(texto) {
  const completo = encurtar(texto);
  const primeiraFrase = encurtar(texto.split(/(?<=[.!?])\s+/)[0] || "");
  const palavras = completo.split(" ");
  const curta = palavras.length > 8 ? palavras.slice(0, 8).join(" ") : "";
  return [...new Set([completo, primeiraFrase, curta].filter(Boolean))];
}

function mensagemErro(err, status) {
  if (err.name === "AbortError") return "A consulta demorou demais. Tente novamente.";
  if (status === 429) return "Cota diária da API esgotada. Tente novamente mais tarde.";
  if (status === 400 && /key/i.test(err.message)) return "Chave de API inválida. Confira em “Configurações”.";
  if (status === 403) return "Chave sem permissão. Ative a “Fact Check Tools API” no seu projeto do Google Cloud.";
  if (err instanceof TypeError) return "Sem conexão com a API. Verifique sua internet.";
  return err.message;
}

/* ---------- API ---------- */

async function chamarApi({ query, pageToken, config, lang, signal }) {
  const params = new URLSearchParams({
    query,
    pageSize: String(config.pageSize || 10),
    key: config.apiKey,
  });
  if (lang) params.set("languageCode", lang);
  if (pageToken) params.set("pageToken", pageToken);
  if (config.maxAgeDays) params.set("maxAgeDays", String(config.maxAgeDays));

  const timer = setTimeout(() => controller?.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${API_URL}?${params}`, { signal });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const e = new Error(data?.error?.message || `Erro HTTP ${resp.status}`);
      e.status = resp.status;
      throw e;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function lerConfig() {
  const cfg = await chrome.storage.sync.get(["apiKey", "lang", "pageSize", "maxAgeDays"]);
  return { ...cfg, lang: cfg.lang ?? "pt" };
}

function iniciarBusca() {
  controller?.abort();
  controller = new AbortController();
  $buscar.disabled = true;
  $mais.hidden = true;
  return controller.signal;
}

async function buscar(texto) {
  texto = texto.trim();
  $resultados.textContent = "";
  $resumo.hidden = true;
  $agencias.hidden = true;
  $mais.hidden = true;

  if (!texto) {
    setStatus("Digite ou selecione um trecho para verificar.", "erro");
    return;
  }
  const config = await lerConfig();
  if (!config.apiKey) {
    setStatus("Configure sua chave de API em Configurações (ícone de engrenagem).", "erro");
    return;
  }

  const signal = iniciarBusca();
  setStatus("Consultando checadores…", "carregando");

  try {
    // Tenta variantes cada vez mais curtas; por último, sem filtro de idioma.
    const tentativas = variantes(texto).map((q) => ({ q, lang: config.lang }));
    if (config.lang) tentativas.push({ q: tentativas[tentativas.length - 1].q, lang: "" });

    let data = { claims: [] };
    let usada = tentativas[0].q;
    for (const t of tentativas) {
      data = await chamarApi({ query: t.q, config, lang: t.lang, signal });
      usada = t.q;
      if (data.claims?.length) break;
    }

    estado = { query: texto, usada, pageToken: data.nextPageToken || "" };
    renderizar(data.claims || [], false);
    if (usada !== encurtar(texto)) {
      setStatus(`Busca ampliada para: “${usada}”.`);
    }
    $mais.hidden = !estado.pageToken;
    salvarEstado();
    if (!data.claims?.length) buscarAgencias(texto, signal);
  } catch (err) {
    if (signal.aborted && err.name === "AbortError" && controller.signal !== signal) return;
    setStatus(`Falha na consulta: ${mensagemErro(err, err.status)}`, "erro");
  } finally {
    if (controller.signal === signal) $buscar.disabled = false;
  }
}

async function carregarMais() {
  const config = await lerConfig();
  const signal = iniciarBusca();
  $mais.disabled = true;
  try {
    const data = await chamarApi({
      query: estado.usada,
      pageToken: estado.pageToken,
      config,
      lang: config.lang,
      signal,
    });
    estado.pageToken = data.nextPageToken || "";
    renderizar(data.claims || [], true);
    $mais.hidden = !estado.pageToken;
    salvarEstado();
  } catch (err) {
    setStatus(`Falha ao carregar mais: ${mensagemErro(err, err.status)}`, "erro");
    $mais.hidden = false;
  } finally {
    $mais.disabled = false;
    $buscar.disabled = false;
  }
}

/* ---------- Último resultado (sobrevive ao fechar o popup) ---------- */

function salvarEstado() {
  return chrome.storage.session.set({ ultimo: { ...estado, claims: todas } });
}

async function restaurar() {
  const { ultimo } = await chrome.storage.session.get("ultimo");
  if (!ultimo?.claims?.length) return false;
  estado = { query: ultimo.query, usada: ultimo.usada, pageToken: ultimo.pageToken };
  $query.value = ultimo.query;
  renderizar(ultimo.claims, false);
  $mais.hidden = !estado.pageToken;
  return true;
}

/* ---------- Renderização ---------- */

function notasDe(claim) {
  return (claim.claimReview || []).map((r) => classificar(r.textualRating));
}

function renderizarResumo() {
  const contagem = { true: 0, mixed: 0, false: 0, unknown: 0 };
  let total = 0;
  for (const claim of todas) {
    for (const nota of notasDe(claim)) { contagem[nota]++; total++; }
  }
  $resumo.textContent = "";
  if (!total) { $resumo.hidden = true; return; }

  const geral = veredito(todas.flatMap(notasDe));
  const topo = el("div", "resumo-topo");
  const textos = el("div");
  textos.appendChild(el("div", "resumo-titulo", TITULO[geral]));
  textos.appendChild(el("div", "resumo-sub", `${total} checagem(ns) em ${todas.length} alegação(ões)`));
  topo.appendChild(textos);
  topo.appendChild(el("span", `stamp ${geral}`, ROTULO[geral]));
  $resumo.appendChild(topo);

  const barra = el("div", "barra");
  const legenda = el("div", "legenda");
  for (const tipo of ["false", "mixed", "true", "unknown"]) {
    if (!contagem[tipo]) continue;
    const seg = el("i", tipo);
    seg.style.flex = String(contagem[tipo]);
    seg.title = `${ROTULO[tipo]}: ${contagem[tipo]}`;
    barra.appendChild(seg);
    const item = el("span", "", `${contagem[tipo]} ${ROTULO[tipo].toLowerCase()}`);
    item.style.setProperty("--c", `var(--${tipo})`);
    legenda.appendChild(item);
  }
  $resumo.append(barra, legenda);
  $resumo.hidden = false;
}

function renderizar(claims, anexar) {
  const antes = anexar ? $resultados.children.length : 0;
  todas = anexar ? [...todas, ...claims] : [...claims];
  if (!anexar) $resultados.textContent = "";

  if (!anexar && !claims.length) {
    $resumo.hidden = true;
    setStatus("");
    const vazio = el("div", "vazio");
    vazio.appendChild(el("b", "", "Nenhuma checagem encontrada"));
    vazio.appendChild(el("span", "", "Tente um trecho mais curto ou com outras palavras."));
    $resultados.appendChild(vazio);
    return;
  }
  setStatus("");

  claims.forEach((claim, i) => {
    const cartao = criarCartao(claim);
    cartao.style.setProperty("--i", String(Math.min(i, 8)));
    $resultados.appendChild(cartao);
  });
  renderizarResumo();
  if (anexar && antes) $resultados.children[antes]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function criarCartao(claim) {
  const box = el("article", `claim ${veredito(notasDe(claim))}`);
  box.appendChild(el("div", "text", claim.text || "(sem texto)"));

  const meta = [claim.claimant && `Por: ${claim.claimant}`, formatarData(claim.claimDate)]
    .filter(Boolean)
    .join(" · ");
  if (meta) box.appendChild(el("div", "meta", meta));

  const lista = el("div", "reviews");
  for (const r of claim.claimReview || []) {
    const rev = el("div", "review");
    const tipo = classificar(r.textualRating);
    rev.appendChild(el("span", `stamp ${tipo}`, carimbo(r.textualRating, tipo)));

    const fonte = [r.publisher?.name || r.publisher?.site, formatarData(r.reviewDate)]
      .filter(Boolean)
      .join(" · ");
    rev.appendChild(el("div", "fonte", fonte));

    if (r.url && /^https?:\/\//i.test(r.url)) {
      const a = el("a", "", r.title || "Ver checagem");
      a.href = r.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      rev.appendChild(a);
    }
    if (notaLonga(r.textualRating)) rev.appendChild(el("div", "explica", notaLonga(r.textualRating)));
    lista.appendChild(rev);
  }
  box.appendChild(lista);
  return box;
}

/* ---------- Outras agências (quando o Google não acha nada) ---------- */

async function buscarAgencias(texto, signal) {
  const { itens, falhou } = await buscarEmAgencias(texto, signal);
  if (signal.aborted) return;
  renderizarAgencias(itens, falhou);
}

function renderizarAgencias(itens, falhou) {
  $agencias.textContent = "";
  if (falhou) return; // sem rede: o aviso "nenhuma checagem" já basta
  $agencias.appendChild(el("h2", "", "Outras agências"));
  $agencias.appendChild(
    el("p", "", itens.length
      ? "O Google não achou nada. Estas checagens vieram dos sites das agências. A nota é inferida do título."
      : "Boatos.org e Agência Lupa também não têm checagem com essas palavras.")
  );
  const lista = el("div", "lista");
  for (const it of itens) {
    const box = el("article", "item");
    const topo = el("div", "topo");
    const tipo = inferirNota(it.titulo);
    topo.appendChild(el("span", `stamp ${tipo}`, tipo === "unknown" ? "Ler checagem" : `${ROTULO[tipo]}?`));
    topo.appendChild(el("span", "fonte", [it.agencia, formatarData(it.data)].filter(Boolean).join(" · ")));
    box.appendChild(topo);
    const a = el("a", "", it.titulo || "Ver checagem");
    a.href = it.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    box.appendChild(a);
    lista.appendChild(box);
  }
  $agencias.appendChild(lista);
  $agencias.hidden = false;
}

/* ---------- Início ---------- */

(async () => {
  const inicial = await textoInicial();
  if (inicial) {
    $query.value = inicial;
    buscar(inicial);
  } else {
    await restaurar();
  }
})();
