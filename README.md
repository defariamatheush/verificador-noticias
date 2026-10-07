# Verificador de Alegações

Extensão para navegadores Chromium que mostra, direto na busca do Google, se algum checador de fatos já analisou aquilo que você pesquisou.

- **Card no topo da busca:** resume o que os checadores disseram sobre o que você digitou, com o veredito geral e links para cada checagem.
- **Selo ao lado de cada resultado:** indica se existe checagem sobre aquele título e qual foi o veredito.
- **Popup:** cole ou selecione um trecho de notícia e verifique. Também funciona pelo clique direito sobre um texto selecionado.

> O projeto ainda está em desenvolvimento.

## De onde vêm as checagens

A extensão não decide o que é verdade. Ela só mostra o que checadores já publicaram, consultando 3 fontes:

1. **Fact Check Tools API, do Google:** fonte principal, com nota estruturada de cada checador.
2. **Boatos.org:** consultado quando o Google não encontra nada.
3. **Agência Lupa:** consultada junto com o Boatos.org, pelo mesmo motivo.

As duas últimas não trazem uma nota estruturada, só o título e o link da checagem. Por isso, nelas a extensão não dá veredito: o selo é azul e apenas avisa que há uma checagem em outra agência.

## Como instalar

Você precisa de um navegador Chromium (Chrome, Edge, Brave) e de uma chave gratuita da API do Google.

### 1. Baixe o projeto

Em "Code" > "Download ZIP" e descompacte a pasta. Ou, com git:

```bash
git clone https://github.com/defariamatheush/verificador-noticias.git
```

### 2. Carregue a extensão

1. Abra `chrome://extensions`.
2. Ative o **Modo do desenvolvedor**, no canto superior direito.
3. Clique em **Carregar sem compactação** e selecione a pasta do projeto (a que contém o `manifest.json`).

### 3. Crie a chave da API

1. Acesse [console.cloud.google.com](https://console.cloud.google.com) e crie um projeto (ou use um existente).
2. Em "APIs e serviços", ative a **Fact Check Tools API**.
3. Em "Credenciais", clique em "Criar credenciais" > "Chave de API".

### 4. Configure a extensão

1. Clique no ícone da extensão e abra **Configurações** (a engrenagem).
2. Cole a chave em **Chave da API**, clique em **Testar** para conferir e depois em **Salvar alterações**.

### 5. Teste

Pesquise no Google, na aba **Tudo**, por exemplo `Cloroquina cura a covid`. O card deve aparecer acima dos resultados. Na aba **Notícias**, cada resultado recebe um selo.

## Como usar

### Na busca do Google

| Selo | Significado |
|---|---|
| Verde ✓ | Checadores classificaram como verdadeiro |
| Amarelo ! | Incompleto ou enganoso |
| Vermelho ✕ | Falso |
| Azul ↗ | O Google não tem checagem, mas há uma em outra agência (Boatos.org ou Lupa). A nota não é confirmada. |
| Cinza ? | Nenhuma checagem encontrada |

Passe o mouse sobre o selo para ver quais checadores avaliaram. Clique para abrir a checagem.

O card só aparece em buscas com **3 ou mais palavras**, nas abas Tudo e Notícias (não em Imagens, Vídeos nem Shopping), e só quando alguma fonte achou algo.

### No popup

Clique no ícone da extensão, cole um trecho e clique em **Verificar** (ou use `Ctrl`+`Enter`). Se houver texto selecionado na página, ele é preenchido sozinho. O popup também abre pelo menu de contexto: selecione um texto, clique com o botão direito e escolha **Verificar alegação**.

## Limites das checagens

Leia isto antes de confiar em um resultado.

- **Só aparecem alegações que algum checador já analisou.** Uma notícia recente, local ou de nicho pode não ter checagem nenhuma.
- **Selo cinza não quer dizer que a notícia é verdadeira.** Quer dizer que nenhuma fonte consultada tem checagem sobre ela.
- **O selo vale para o tema, não para a página.** A nota é da alegação checada. Uma página que desmente um boato pode receber selo vermelho, e uma página que o defende pode receber selo amarelo, porque existe uma checagem sobre o mesmo assunto. Abra a checagem para entender.
- **A correspondência é por palavras, não por sentido.** A extensão compara palavras do título ou da busca com as alegações checadas. Pode ligar uma checagem a um texto que trata de outro assunto parecido, ou deixar de achar uma que existe. Frases curtas e diretas, de 3 a 8 palavras, costumam funcionar melhor.
- **A nota vem do checador e nem sempre é padronizada.** A extensão classifica o texto da nota (por exemplo, "Falso", "Enganoso", "Distorcido") em verdadeiro, parcial ou falso. Notas fora do padrão podem aparecer como "Sem nota".
- **Boatos.org e Lupa não têm nota estruturada.** Nelas, a extensão só mostra o título da checagem e, quando ele afirma isso de forma explícita (como "É falso que…"), um carimbo com interrogação.
- **A cobertura depende das agências.** Cada checador escolhe o que verifica, e a base brasileira é menor que a em inglês. O Google informou que está [descontinuando o suporte a `ClaimReview` na Busca](https://developers.google.com/search/docs/appearance/structured-data/factcheck), mas a ferramenta Fact Check Explorer continua a aceitá-lo. Isso pode mudar o que a API devolve no futuro.
- **A API do Google tem cota diária.** Cada busca com o card ligado usa uma consulta, e cada título marcado com selo usa outra. Quando o Google não acha nada, a extensão ainda faz mais duas consultas aos sites do Boatos.org e da Lupa, que não usam a sua cota. Se a cota do Google acabar, a extensão avisa. Você pode desligar o card e os selos em Configurações.

## Configurações

Em **Configurações** da extensão:

- **Chave da API.**
- **Idioma das alegações:** português, inglês, espanhol ou qualquer idioma.
- **Idade máxima das checagens:** sem limite, 30 dias, 90 dias ou 1 ano.
- **Resultados por página** no popup.
- **Marcar resultados com selos** e **Mostrar card de checagem no topo:** cada um pode ser ligado ou desligado.

## Privacidade e permissões

- A chave fica salva no seu navegador, em `chrome.storage.sync`, e é sincronizada com a sua conta do Chrome, se você usa sincronização. Ela nunca é enviada a outro destino além da API do Google.
- O texto que você pesquisa ou verifica é enviado à Fact Check Tools API. Quando ela não acha nada, as mesmas palavras também são enviadas a `boatos.org` e `agencialupa.org`.
- Os títulos dos resultados do Google (para os selos) também são consultados nessas fontes. Eles ficam em cache por 6 horas, só na sessão do navegador.
- Não há servidor próprio nem coleta de dados.

Permissões usadas: `contextMenus` (item "Verificar alegação"), `storage` (suas configurações), `activeTab` e `scripting` (ler o texto selecionado ao abrir o popup) e acesso aos domínios `factchecktools.googleapis.com`, `www.boatos.org` e `www.agencialupa.org`. O script que adiciona o card e os selos roda apenas nas páginas de busca do Google (`google.com`, `google.com.br` e `google.pt`).

## Estrutura

| Arquivo | Função |
|---|---|
| `manifest.json` | Configuração da extensão (Manifest V3) |
| `popup.html` / `popup.js` | Popup de verificação |
| `options.html` / `options.js` | Página de configurações |
| `content.js` | Card e selos na busca do Google |
| `background.js` | Consultas à API, cache e menu de contexto |
| `shared.js` | Classificação das notas e busca nas outras agências |
| `theme.css` | Cores e estilos compartilhados |

## Contribuindo

Sugestões e correções são bem-vindas por Pull Request. Todo PR é revisado antes de entrar na `main`. Ao reportar um problema de resultado, informe a busca que você fez e o que esperava ver.
