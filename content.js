// Marca cada resultado da busca do Google com um selo de verificação.
(async () => {
  const { marcarGoogle, cardBusca } = await chrome.storage.sync.get(["marcarGoogle", "cardBusca"]);
  if (cardBusca !== false) iniciarCard();
  if (marcarGoogle === false) return;


  /* ---------- Card no topo: checagem do que foi digitado na busca ---------- */

  function iniciarCard() {
    const params = new URLSearchParams(location.search);
    const texto = (params.get("q") || "").replace(/\s+/g, " ").trim();
    if (["isch", "vid", "shop", "lcl"].includes(params.get("tbm"))) return;
    if (texto.split(" ").length < 3) return; // buscas de 1-2 palavras geram ruído e gastam cota

    let host = null;
    let resposta = null;

    function inserir() {
      if (host?.isConnected || !resposta) return;
      const alvo = document.querySelector("#rso");
      if (!alvo?.parentElement) return;
      host = document.createElement("div");
      host.id = "vf-card-host";
      host.style.cssText = "display:block;margin:0 0 16px;max-width:652px;";
      montarCard(host.attachShadow({ mode: "open" }), texto, resposta);
      alvo.parentElement.insertBefore(host, alvo);
    }

    chrome.runtime.sendMessage({ type: "buscar", texto }, (res) => {
      if (chrome.runtime.lastError || !res) return;
      if (res.status === "error") return console.warn("[Verificador] erro da API:", res.code, res.msg);
      if (res.status !== "google" && res.status !== "outras") return; // nada a mostrar
      resposta = res;
      inserir();
      // O Google monta a página aos poucos; tenta de novo até o card entrar.
      const obs = new MutationObserver(() => {
        inserir();
        if (host?.isConnected) obs.disconnect();
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => obs.disconnect(), 10000);
    });
  }

  const NOME = { true: "Verdadeiro", mixed: "Parcial", false: "Falso", unknown: "Sem nota" };
  const TITULO = {
    true: "Checadores apontam verdadeiro",
    mixed: "Checadores apontam incompleto ou enganoso",
    false: "Checadores apontam falso",
    unknown: "Checadores não deram nota clara",
  };

  function h(tag, cls, txt) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined) n.textContent = txt;
    return n;
  }

  function link(txt, url) {
    const a = h("a", "", txt);
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }

  function montarCard(raiz, texto, res) {
    const estilo = document.createElement("style");
    estilo.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; }
      .card { font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #0e1a2b; background: #fff;
        border: 1px solid #d6dde5; border-radius: 12px; padding: 14px 16px; }
      .topo { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
      .rotulo { font: 11px ui-monospace, Menlo, monospace; color: #5b6878; text-transform: uppercase; letter-spacing: .06em; }
      .titulo { margin-top: 2px; font: 700 17px/1.3 ui-serif, "Iowan Old Style", Georgia, serif; }
      .sub { margin-top: 2px; color: #5b6878; font-size: 12.5px; }
      .stamp { flex: none; padding: 2px 9px 3px; border: 2px solid currentColor; border-radius: 4px; transform: rotate(-2deg);
        font: 700 11px/1.2 ui-monospace, Menlo, monospace; letter-spacing: .06em; text-transform: uppercase; }
      .true { color: #0e7c5f; background: #dff3ec; } .mixed { color: #b87800; background: #fbefd0; }
      .false { color: #c5352b; background: #fbe3e0; } .unknown { color: #6b7788; background: #e6eaef; }
      .barra { display: flex; gap: 3px; height: 8px; margin-top: 12px; }
      .barra i { display: block; border-radius: 4px; min-width: 6px; }
      .barra .true { background: #0e7c5f; } .barra .mixed { background: #b87800; } .barra .false { background: #c5352b; } .barra .unknown { background: #6b7788; }
      .alegacao { position: relative; margin-top: 12px; padding: 4px 0 4px 14px; }
      .alegacao::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 4px; border-radius: 2px; background: var(--c); }
      .alegacao.true { --c: #0e7c5f; background: none; } .alegacao.mixed { --c: #b87800; background: none; }
      .alegacao.false { --c: #c5352b; background: none; } .alegacao.unknown { --c: #6b7788; background: none; }
      .texto { font: 15px/1.4 ui-serif, "Iowan Old Style", Georgia, serif; }
      .rev { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 8px; }
      .rev .stamp { transform: none; font-size: 10.5px; }
      .explica { margin-top: 4px; color: #5b6878; font-size: 12.5px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      .stamp { max-width: 100%; overflow-wrap: anywhere; }
      .fonte { color: #5b6878; font: 11.5px ui-monospace, Menlo, monospace; }
      a { color: #2447d8; font-weight: 600; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .rev a::after, .rodape a::after { content: " ↗"; font-weight: 400; }
      .aviso { margin-top: 8px; padding: 8px 10px; border-radius: 8px; background: #e4eafc; font-size: 12.5px; }
      .rodape { display: flex; justify-content: space-between; gap: 12px; margin-top: 14px; padding-top: 10px; border-top: 1px solid #d6dde5; font-size: 12.5px; color: #5b6878; }
      @media (prefers-color-scheme: dark) {
        .card { color: #e7edf5; background: #131d2e; border-color: #26344a; }
        .rotulo, .sub, .fonte, .rodape, .explica { color: #93a1b4; }
        .true { color: #4fd1a5; background: #12362c; } .mixed { color: #f2b83d; background: #3a2d0c; }
        .false { color: #ff8a7f; background: #3d1a17; } .unknown { color: #9aa7b8; background: #1f2b3d; }
        .barra .true { background: #4fd1a5; } .barra .mixed { background: #f2b83d; } .barra .false { background: #ff8a7f; } .barra .unknown { background: #9aa7b8; }
        .alegacao.true { --c: #4fd1a5; } .alegacao.mixed { --c: #f2b83d; } .alegacao.false { --c: #ff8a7f; } .alegacao.unknown { --c: #9aa7b8; }
        a { color: #8aa4ff; } .aviso { background: #1c2a4d; } .rodape { border-color: #26344a; }
      }
    `;
    raiz.appendChild(estilo);

    const card = h("section", "card");
    card.setAttribute("aria-label", "Verificador de Alegações");
    const topo = h("div", "topo");
    const tx = h("div");
    tx.appendChild(h("div", "rotulo", "Verificador · checagens para sua busca"));

    if (res.status === "google") {
      const notas = res.claims.flatMap((c) => c.reviews.map((r) => r.nota));
      const geral = veredito(notas);
      tx.appendChild(h("div", "titulo", TITULO[geral]));
      tx.appendChild(h("div", "sub", `${notas.length} checagem(ns) em ${res.claims.length} alegação(ões) sobre “${texto}”`));
      topo.append(tx, h("span", `stamp ${geral}`, NOME[geral]));
      card.appendChild(topo);

      const cont = { true: 0, mixed: 0, false: 0, unknown: 0 };
      notas.forEach((n) => cont[n]++);
      const barra = h("div", "barra");
      for (const t of ["false", "mixed", "true", "unknown"]) {
        if (!cont[t]) continue;
        const seg = h("i", t);
        seg.style.flex = String(cont[t]);
        seg.title = `${NOME[t]}: ${cont[t]}`;
        barra.appendChild(seg);
      }
      card.appendChild(barra);

      for (const c of res.claims) {
        const box = h("div", `alegacao ${veredito(c.reviews.map((r) => r.nota))}`);
        box.appendChild(h("div", "texto", `“${c.text}”`));
        for (const r of c.reviews) {
          const lin = h("div", "rev");
          lin.appendChild(h("span", `stamp ${r.nota}`, carimbo(r.rating, r.nota)));
          lin.appendChild(h("span", "fonte", r.publisher));
          if (/^https?:\/\//i.test(r.url)) lin.appendChild(link(r.title || "Ver checagem", r.url));
          box.appendChild(lin);
          if (notaLonga(r.rating)) box.appendChild(h("div", "explica", notaLonga(r.rating)));
        }
        card.appendChild(box);
      }
    } else {
      tx.appendChild(h("div", "titulo", "Outras agências têm checagens parecidas"));
      tx.appendChild(h("div", "sub", `O Google não achou nada sobre “${texto}”. A nota não é confirmada: abra para conferir.`));
      topo.appendChild(tx);
      card.appendChild(topo);
      for (const it of res.itens) {
        const box = h("div", "alegacao unknown");
        box.appendChild(h("div", "texto", it.titulo));
        const lin = h("div", "rev");
        lin.appendChild(h("span", "fonte", it.agencia));
        lin.appendChild(link("Ler checagem", it.url));
        box.appendChild(lin);
        card.appendChild(box);
      }
    }

    const rodape = h("div", "rodape");
    rodape.appendChild(h("span", "", "Só aparecem alegações que algum checador já analisou."));
    rodape.appendChild(link("Mais no Fact Check Explorer", `https://toolbox.google.com/factcheck/explorer/search/${encodeURIComponent(texto)}`));
    card.appendChild(rodape);
    raiz.appendChild(card);
  }

  const ROTULOS = {
    true: "Checadores classificaram como verdadeiro",
    mixed: "Checadores classificaram como incompleto / enganoso",
    false: "Checadores classificaram como falso",
    none: "Nenhuma checagem encontrada para este título",
    outras: "Sem checagem no Google, mas há uma em outra agência (a nota não é confirmada). Clique para abrir",
    error: "Não foi possível consultar a API (veja o console da página: [Verificador])",
    nokey: "Configure sua chave de API em Configurações da extensão para ver os selos",
  };
  const SIMBOLOS = { true: "✓", mixed: "!", false: "✕", none: "?", outras: "↗", error: "×", nokey: "⚙" };

  const css = document.createElement("style");
  css.textContent = `
    .vf-selo { position:absolute; z-index:5; display:flex; align-items:center; justify-content:center;
      width:28px; height:28px; border-radius:50%; font:700 15px/1 system-ui,sans-serif; color:#fff;
      border:2px solid #fff; box-shadow:0 1px 5px rgba(0,0,0,.35); transition:transform .15s; text-decoration:none !important; cursor:default; }
    .vf-selo[href] { cursor:pointer; } .vf-selo[href]:hover { transform:scale(1.12); }
    .vf-true { background:#0e7c5f; } .vf-mixed { background:#f2b83d; color:#202124; }
    .vf-false { background:#c5352b; } .vf-none, .vf-error, .vf-nokey { background:#80868b; opacity:.7; }
    .vf-outras { background:#fff; color:#2447d8; border-color:#2447d8; }
    .vf-load { background:#80868b; opacity:.35; }
  `;
  document.documentElement.appendChild(css);

  // À direita do card se houver espaço na janela; senão, sobre o canto do card.
  const selos = []; // { selo, card, h } — reposicionados quando o layout muda

  // Alinha o selo ao título do resultado (o card começa na linha do nome do site, ~38px acima).
  // À direita do card se houver espaço na janela; senão, sobre o canto do card.
  function posicionar({ selo, card, h }) {
    if (!card.isConnected || !h.isConnected) return;
    const rc = card.getBoundingClientRect();
    const rh = h.getBoundingClientRect();
    const topo = Math.max(0, rh.top - rc.top + rh.height / 2 - 16);
    selo.style.top = `${Math.round(topo)}px`;
    if (rc.right + 44 <= document.documentElement.clientWidth) {
      selo.style.left = "calc(100% + 12px)";
      selo.style.right = "auto";
    } else {
      selo.style.left = "auto";
      selo.style.right = "6px";
    }
  }
  const reposicionar = () => selos.forEach(posicionar);
  window.addEventListener("resize", reposicionar);
  window.addEventListener("load", reposicionar);

  const SELETOR = 'a h3, a [role="heading"], [role="heading"][aria-level="3"]';
  const naoCabecalho = (h) => !h.closest("header, form, [role='navigation'], [role='search']");

  function criarSelo() {
    const s = document.createElement("a");
    s.className = "vf-selo vf-load";
    s.textContent = "…";
    s.title = "Verificando…";
    s.addEventListener("click", (e) => {
      e.stopPropagation(); // não abre o resultado do Google
      if (!s.href) e.preventDefault();
    });
    return s;
  }

  function preencher(selo, res) {
    const status = res?.status;
    if (!ROTULOS[status]) {
      selo.remove();
      return;
    }
    selo.className = `vf-selo vf-${status}`;
    selo.textContent = SIMBOLOS[status];

    const linhas = [ROTULOS[status]];
    for (const r of res.reviews || []) {
      linhas.push(`• ${r.rating || "Sem nota"} — ${r.publisher}`);
    }
    selo.title = linhas.join("\n");

    const url = res.reviews?.find((r) => /^https?:\/\//i.test(r.url))?.url;
    if (url) {
      selo.href = url;
      selo.target = "_blank";
      selo.rel = "noopener noreferrer";
    }
  }

  const vistos = new Set();

  function processar() {
    for (const h of document.querySelectorAll(SELETOR)) {
      if (h.dataset.vf || !naoCabecalho(h)) continue;
      const texto = h.textContent.trim();
      if (texto.split(/\s+/).length < 3) continue;
      h.dataset.vf = "1";

      // O selo fica ao lado do card inteiro (contêiner do resultado), não dentro do título.
      // Na aba Notícias um único .MjjYud envolve vários cards; nesse caso o card é o pai do link.
      let card = h.closest(".MjjYud");
      const titulosNoCard = card ? [...card.querySelectorAll(SELETOR)].filter(naoCabecalho).length : 0;
      if (!card || titulosNoCard > 1) card = h.closest("a")?.parentElement;
      if (!card || card.dataset.vfCard) continue;
      // Um selo por resultado: ignora títulos repetidos (ex.: versão traduzida) e cards aninhados.
      if (card.closest("[data-vf-card]") || card.querySelector("[data-vf-card]")) continue;
      const chave = h.closest("a")?.href || texto;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      card.dataset.vfCard = "1";

      const selo = criarSelo();
      if (getComputedStyle(card).position === "static") card.style.position = "relative";
      card.appendChild(selo);
      const item = { selo, card, h };
      selos.push(item);
      posicionar(item);

      chrome.runtime.sendMessage({ type: "verificar", titulo: texto }, (res) => {
        if (chrome.runtime.lastError || !res) {
          console.warn("[Verificador] sem resposta do service worker:", chrome.runtime.lastError?.message);
          return preencher(selo, { status: "error" });
        }
        if (res.status === "error") console.warn("[Verificador] erro da API:", res.code, res.msg);
        preencher(selo, res);
      });
    }
  }

  let timer;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => { processar(); reposicionar(); }, 300);
  }).observe(document.body, { childList: true, subtree: true });

  console.debug("[Verificador] content script ativo");
  processar();
})();
