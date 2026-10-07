importScripts("shared.js");

const API_URL = "https://factchecktools.googleapis.com/v1alpha1/claims:search";
const MIN_SOBREPOSICAO = 0.5; // quanto do título deve aparecer na alegação para contar
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_PARALELO = 3;

// Cria o item no menu de contexto (botão direito sobre texto selecionado)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "verificar-alegacao",
    title: "Verificar alegação: “%s”",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "verificar-alegacao" || !info.selectionText) return;

  await chrome.storage.session.set({ pendingText: info.selectionText.trim() });

  try {
    // Abre o popup da extensão (Chrome 127+)
    await chrome.action.openPopup();
  } catch (e) {
    // Fallback: sinaliza no ícone que há uma consulta pendente
    chrome.action.setBadgeText({ text: "1" });
    chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
  }
});

/* ---------- Verificação de títulos vindos da página de busca do Google ---------- */

let ativas = 0;
const fila = [];

function limitar(tarefa) {
  return new Promise((resolve, reject) => {
    fila.push({ tarefa, resolve, reject });
    proxima();
  });
}

function proxima() {
  while (ativas < MAX_PARALELO && fila.length) {
    const { tarefa, resolve, reject } = fila.shift();
    ativas++;
    tarefa().then(resolve, reject).finally(() => {
      ativas--;
      proxima();
    });
  }
}

async function consultar(titulo) {
  const cfg = await chrome.storage.sync.get(["apiKey", "lang"]);
  if (!cfg.apiKey) return { status: "nokey" };

  const query = encurtar(titulo);
  const lang = cfg.lang ?? "pt";
  const chave = `fc:${lang}:${query}`;

  const em = await chrome.storage.session.get(chave);
  const hit = em[chave];
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) return hit.r;

  const params = new URLSearchParams({ query, pageSize: "5", key: cfg.apiKey });
  if (lang) params.set("languageCode", lang);

  const resp = await fetch(`${API_URL}?${params}`);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return { status: "error", code: resp.status, msg: data?.error?.message };

  // Só vale checagem cuja alegação realmente se parece com o título.
  const relevantes = (data.claims || []).filter(
    (c) => sobreposicao(titulo, c.text || "") >= MIN_SOBREPOSICAO
  );
  const reviews = relevantes.flatMap((c) =>
    (c.claimReview || []).map((r) => ({
      nota: classificar(r.textualRating),
      rating: r.textualRating || "",
      publisher: r.publisher?.name || r.publisher?.site || "",
      url: r.url || "",
      alegacao: c.text || "",
    }))
  );

  const v = veredito(reviews.map((r) => r.nota));
  let r;
  if (reviews.length) {
    r = { status: v === "unknown" ? "mixed" : v, reviews: reviews.slice(0, 3) };
  } else {
    // Sem checagem no Google: procura nos sites de outras agências (nota não inferida no selo).
    const { itens, falhou } = await buscarEmAgencias(titulo).catch(() => ({ itens: [], falhou: true }));
    if (falhou) return { status: "none" }; // não guarda no cache: pode ser falha passageira
    r = itens.length
      ? {
          status: "outras",
          reviews: itens.slice(0, 3).map((i) => ({ rating: i.titulo, publisher: i.agencia, url: i.url })),
        }
      : { status: "none" };
  }

  await chrome.storage.session.set({ [chave]: { t: Date.now(), r } });
  return r;
}

/* ---------- Card no topo da busca do Google: checagem do que o usuário digitou ---------- */

async function consultarBusca(texto) {
  const cfg = await chrome.storage.sync.get(["apiKey", "lang"]);
  if (!cfg.apiKey) return { status: "nokey" };

  const query = encurtar(texto);
  const lang = cfg.lang ?? "pt";
  const chave = `bq:${lang}:${query}`;
  const em = await chrome.storage.session.get(chave);
  const hit = em[chave];
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) return hit.r;

  // Consulta completa; se vier vazia e for longa, tenta só as 8 primeiras palavras.
  const palavrasQ = query.split(" ");
  const tentativas = [query];
  if (palavrasQ.length > 8) tentativas.push(palavrasQ.slice(0, 8).join(" "));

  let claims = [];
  for (const q of tentativas) {
    const params = new URLSearchParams({ query: q, pageSize: "3", key: cfg.apiKey });
    if (lang) params.set("languageCode", lang);
    const resp = await fetch(`${API_URL}?${params}`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { status: "error", code: resp.status, msg: data?.error?.message };
    claims = data.claims || [];
    if (claims.length) break;
  }

  let r;
  if (claims.length) {
    r = {
      status: "google",
      claims: claims.slice(0, 3).map((c) => ({
        text: c.text || "",
        claimant: c.claimant || "",
        reviews: (c.claimReview || []).slice(0, 3).map((x) => ({
          rating: x.textualRating || "",
          nota: classificar(x.textualRating),
          publisher: x.publisher?.name || x.publisher?.site || "",
          title: x.title || "",
          url: x.url || "",
        })),
      })),
    };
  } else {
    const { itens, falhou } = await buscarEmAgencias(texto).catch(() => ({ itens: [], falhou: true }));
    if (falhou) return { status: "none" };
    r = itens.length ? { status: "outras", itens: itens.slice(0, 3) } : { status: "none" };
  }
  await chrome.storage.session.set({ [chave]: { t: Date.now(), r } });
  return r;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "verificar" || !msg.titulo) return;
  limitar(() => consultar(msg.titulo))
    .then(sendResponse)
    .catch(() => sendResponse({ status: "error" }));
  return true; // resposta assíncrona
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "buscar" || !msg.texto) return;
  limitar(() => consultarBusca(msg.texto))
    .then(sendResponse)
    .catch(() => sendResponse({ status: "error" }));
  return true;
});
