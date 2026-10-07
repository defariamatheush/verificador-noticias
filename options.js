const API_URL = "https://factchecktools.googleapis.com/v1alpha1/claims:search";

const $key = document.getElementById("apiKey");
const $lang = document.getElementById("lang");
const $age = document.getElementById("maxAgeDays");
const $size = document.getElementById("pageSize");
const $msg = document.getElementById("msg");

function aviso(texto, tipo = "ok", ms = 3000) {
  $msg.textContent = texto;
  $msg.className = tipo;
  if (ms) setTimeout(() => ($msg.textContent = ""), ms);
}

chrome.storage.sync
  .get(["apiKey", "lang", "maxAgeDays", "pageSize", "marcarGoogle", "cardBusca"])
  .then(({ apiKey, lang, maxAgeDays, pageSize, marcarGoogle, cardBusca }) => {
    document.getElementById("cardBusca").checked = cardBusca !== false;
    document.getElementById("marcarGoogle").checked = marcarGoogle !== false;
    if (apiKey) $key.value = apiKey;
    if (lang !== undefined) $lang.value = lang;
    if (maxAgeDays) $age.value = String(maxAgeDays);
    if (pageSize) $size.value = String(pageSize);
  });

document.getElementById("salvar").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    apiKey: $key.value.trim(),
    lang: $lang.value,
    maxAgeDays: $age.value ? Number($age.value) : 0,
    pageSize: Number($size.value),
    marcarGoogle: document.getElementById("marcarGoogle").checked,
    cardBusca: document.getElementById("cardBusca").checked,
  });
  aviso("Alterações salvas.");
});

document.getElementById("testar").addEventListener("click", async (e) => {
  const key = $key.value.trim();
  if (!key) return aviso("Digite a chave primeiro.", "err");

  e.target.disabled = true;
  aviso("Testando…", "ok", 0);
  try {
    const params = new URLSearchParams({ query: "vacina", pageSize: "1", key });
    const resp = await fetch(`${API_URL}?${params}`);
    const data = await resp.json().catch(() => ({}));
    if (resp.ok) aviso("Chave válida.");
    else aviso(data?.error?.message || `Erro HTTP ${resp.status}`, "err", 6000);
  } catch {
    aviso("Sem conexão com a API.", "err", 6000);
  } finally {
    e.target.disabled = false;
  }
});

const $ver = document.getElementById("ver");
$ver.addEventListener("click", () => {
  const mostrar = $key.type === "password";
  $key.type = mostrar ? "text" : "password";
  $ver.textContent = mostrar ? "Ocultar" : "Mostrar";
  $ver.setAttribute("aria-pressed", String(mostrar));
});
