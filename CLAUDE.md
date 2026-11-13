# CLAUDE.md — Dashboard de Tráfego Pago · Live Style

> Lido automaticamente pelo Claude Code ao abrir o repositório. Carrega todo o
> contexto para continuar o trabalho sem depender de conversas anteriores.
> Mantenha-o atualizado.

Estrutura e layout copiados do modelo `scale-ag/dash-lucas-nigro-ral` (menu por
seção, funil vertical, gráfico diário, tabela diária com heatmap, hierarquia
Campanha → Conjunto → Anúncio com filtro cruzado, seletor de período, tema
claro/escuro, imposto), sem a página Relatório. **Nenhuma regra de negócio do Lucas** (CRM comercial,
vendas, ChatGPT Ads, metas de CPMQL/CAC, Insights por IA) foi trazida.

## O que é

App de BI estático (HTML/CSS/JS + Chart.js via CDN) publicado no **GitHub Pages**.
Build 100% no **GitHub Actions**, disparado a cada **2 h** pelo cron-job.org
(+ `schedule` de backup). **Somente leitura** das planilhas — nunca escrever nelas.

- **URL pública:** https://scale-ag.github.io/dash-livestyle/
- **Cliente:** Live Style — agência musical que recruta cantores para fazer lives no TikTok.
- **Sem metas de CAC/ROAS** (não há venda nem receita neste projeto).

## Menu

| Seção | Página (`#hash`) | O que mostra |
|---|---|---|
| Geral | Visão Geral (`#geral`) | Soma de todas as campanhas: investimento total (Cantores / Evento / Seguidores), leads de cantores + evento com CPL, taxa de qualificação (cantores), seguidores e custo por seguidor |
| Captação de Cantores | Funil de Cantores — LSC (`#lsc`) | Gasto, leads, CPL, MQLs, desqualificados, não avaliados, removidos/arquivados, taxa de qualificação, CPMQL, quente × frio |
| Evento Presencial | Funil Evento SP — EVT (`#evt`) | Progresso da meta (150), gasto, inscrições, CPL |
| Seguidores | Seguidores Instagram (`#seg`) | Gasto, seguidores (coluna H), custo por seguidor, por anúncio e por dia |

Cada página abre com uma faixa de **cards de destaque** (métricas principais:
leads, CPL, taxa de qualificação nos cantores; seguidores e custo por seguidor).
Nas tabelas, Gasto + resultado + custo vêm logo à esquerda (visíveis sem rolar);
métricas de mídia (impressões, CPM, cliques, page views) ficam no fim.

A página **Relatório** do modelo foi **removida a pedido do cliente** (09/11/2026).
O **Evento não tem taxa de qualificação/MQL** (confirmado pelo cliente).
Não adicionar métricas, páginas ou gráficos que o cliente não tem. Coluna sem
fonte de dado não entra.

## Fontes de dados (Google Sheets, SOMENTE LEITURA)

Lidas pelo **nome da aba** via gviz:
`https://docs.google.com/spreadsheets/d/<ID>/gviz/tq?tqx=out:csv&headers=<N>&sheet=<nome>`
— **sem o `&headers=`** o Google funde o cabeçalho com a 1ª linha. IDs e nomes
de aba ficam em `build/config.py`.

| Planilha | ID | Aba | headers | Uso |
|---|---|---|---|---|
| Dash LiveStyle (Adveronix) | `1McCzHKKJzcF3oeQ4c580qG1L16TI8NRrv0OAhL-MRm4` | `Página1` | 1 | Tráfego de **cantores** |
| | | `EVT Presencial SP` | 1 | Tráfego do **evento** |
| | | `Seguidores ` (**espaço no final**) | 1 | Campanha de **seguidores** |
| Leads - LiveStyle | `1JTMI-ZJFRcmk2nh8_AQrMzGzAwsX7LMyY8dCF1kUv8M` | `Leads` | **2** | Cadastros de cantores (linha 1 só agrupa colunas) |
| Artista Ilimitado | `14FFjNMUcnruhXgIqwwuzc0UDX3CP7GSO8T6vXgMyzvQ` | `Leads Jornada` | 1 | Inscrições do evento (**`Leads Ilimitados` NÃO entra** — outro fluxo) |

**Colunas**
- `Página1` / `EVT Presencial SP`: Day · Campaign Name · Ad Set Name · Ad Name · Impressions · Link Clicks · Landing Page Views · Amount Spent · Leads. **A coluna Leads são eventos da Meta — nunca usar como resultado.**
- `Seguidores `: Day · Campaign Name · Ad Set Name · Ad Name · Impressions · Link Clicks · Amount Spent · **Seguidores (coluna H, à mão)** · Custo por seguidor (**ignorada**; a dash calcula). Célula vazia em H = não preenchido (≠ 0).
- `Leads` (cantores): A ID · B data de entrada · **D Etapa atual** · N E-mail · O WhatsApp · Q utm_source · R utm_medium · S utm_campaign · T utm_content · U utm_term · Y Embaixador · Z Página de entrada.
- `Leads Jornada` (evento): A ID · B Entrada · D Etapa · G WhatsApp · H E-mail · T Como chegou · U Quem indicou · V utm_source · W utm_medium · X utm_campaign · Y utm_term · Z utm_content · AC Página de entrada.

O `build.py` casa as colunas pelo nome (aliases) com a posição acima como reserva.

## Regras de negócio

- **Resultado = cadastro real** na base de leads (cantores) ou de inscrições
  (evento), **só com `utm_source` da Meta**. Normalização: `Meta Ads`, `Meta-Ads`,
  `Meta+Ads+`, `META` → Meta (comparação sem acento/caixa/símbolos). Gasto vem da
  extração do Facebook; **CPL = gasto da extração ÷ cadastros da planilha de leads**.
- **Não usar "Como chegou"** (Live do Samuel, Instagram, convite etc.) para
  classificar: só conta Meta Ads (pela UTM). Cadastro sem `utm_source` da Meta
  fica fora da contagem ("sem origem Meta Ads").
- **Testes** (separados): `utm_source = teste_gtm` ou Como chegou = `Outro: Teste técnico interno`.
- **Duplicados**: WhatsApp normalizado (sem DDI 55, DDD + últimos 8 dígitos →
  igual com/sem 9º dígito), fallback no e-mail. Fica o cadastro mais antigo.
- **MQL (só cantores)** = lead que **teve reunião com o CEO marcada**:
  - coluna H **"Reunião CEO em" preenchida**, ou
  - coluna D *Etapa atual* = `Reunião CEO` ou etapa posterior do CRM (`Contato inicial`,
    `Aguardando live teste`, `Live teste`, `Cadastro Backstage`, `Backstage`, `Ativo` —
    lista em `ETAPAS_POS_CEO`, `build/config.py`).
  - **Correção de 13/11/2026:** antes a dash usava só a Etapa atual = `Reunião CEO`. Quando o
    CRM avançou leads para `Ativo`/`Cadastro Backstage` (e arquivou um após a reunião), eles
    saíram da contagem de MQL (12 na dash × 21 reais em 05–12/11). A coluna "Etapa mais
    longe" da planilha NÃO é confiável (fica em "Formulário preenchido" para quem teve reunião).
  - Sem reunião com o CEO, vale a Etapa atual: `Rejeitado` = **Desqualificado**,
    `Formulário preenchido` = **Ainda não avaliado**, `Removido` / `Arquivado` = contam no
    total de leads, **fora** da classificação (mostrados à parte).
  - Qualquer outro valor: aparece como aviso na dash e no log do build → **avisar o gestor**
    (e, se for etapa posterior à reunião, incluir em `ETAPAS_POS_CEO`).
- **Taxa de qualificação** = MQLs ÷ (MQLs + desqualificados), com o denominador
  visível. Não avaliados ficam fora do denominador.
- **CPMQL** = gasto ÷ MQLs do mesmo escopo (campanha/criativo) e período.
- **Evento:** sem MQL (a coluna Etapa do evento não é usada). Meta de **150
  inscrições** na captação de **06 a 18/11/2026** (progresso independe do período
  selecionado).
- **Seguidores:** custo por seguidor = gasto ÷ seguidores **só nas linhas com a
  coluna H preenchida** (0 conta; vazio não). O gasto das linhas não preenchidas
  aparece num aviso.
- **Imposto Meta 13,85%**: gasto × `1.1385`, botão "Imposto Meta" **ligado por
  padrão**; desligado mostra o bruto. Vale para todos os custos (CPL, CPMQL, C/Seguidor).
- **Custos** sempre com gasto e resultado do mesmo período e escopo.
- **Datas:** a data de entrada dos cadastros vem sem fuso (`dd/mm/aaaa HH:MM`) e já é
  horário de São Paulo; timestamps ISO com fuso são convertidos para
  `America/Sao_Paulo` antes de agrupar por dia. O "hoje" do build é o de São
  Paulo (o runner roda em UTC) e a dash sinaliza **"Hoje parcial · dados até HH:MM"**.
- **Início dos painéis:** cantores a partir de 05/11/2026 (`LSC_START`), evento a
  partir de 06/11/2026 (`EVT_START`). Cadastros anteriores ficam fora.

### Atribuição (cadastro → linha do Meta) — verificado nos dados em 09/11/2026

`utm_campaign` = Campaign Name · **`utm_medium` = Ad Set Name** · `utm_content` = Ad Name.

Atenção: nos dados reais o **`utm_term` traz o ID do conjunto** (ex.:
`120248166204570317`), não o nome — por isso o conjunto vem do `utm_medium`. O
`utm_term` é usado só como reserva: o build aprende ID → (campanha, conjunto)
nos cadastros completos e aplica quando campanha/medium vêm vazios.

Ordem de tentativa (`build.py::build_leads`):
1. Colunas UTM; campo vazio ou com macro não substituída (`{{campaign.name}}`) é
   lido da **URL da Página de entrada** (vários cadastros de cantores vêm só com
   a URL preenchida).
2. Comparação normalizada (o `+` de "IG + Engajamento" às vezes vira espaço).
3. Reserva pelo ID do conjunto (`utm_term`); depois campanha + anúncio quando
   houver uma única linha do Meta compatível.
4. Sem match → entra no total como **"(sem campanha)"** e a dash avisa quantos
   ficaram sem vínculo (ex.: LS-106D9A, UTMs `{{...}}` não substituídas pela Meta).

### Convenções de campanha (Live Style)
- Cantores: `LSC | E2-CAP | P1-QUENTE | LEAD | ABO | 2026-11-05 | Teste de criativos`
  (quente = engajamento IG, conjunto `AUTO | ALL | 20 a 40 | BR | IG + Engajamento`)
  e `LSC | E2-CAP | P2-FRIO | ...` (frio = Lookalike, conjunto `... | LAL`).
  Quente × frio é identificado por `QUENTE`/`FRIO` no nome da campanha.
  Anúncios: `AD 04 - TRANSFORMAR VOZ EM RENDA`, `AD 05 - ...`, `AD 06 - ...`.
- Evento: `EVT | E2-CAP | P2-FRIO| LEAD | ABO | 2026-11-06 | Teste de criativos`;
  conjuntos `... | VÍDEOS` (anúncios `VID-IMG_xxxx`) e `... | ESTÁTICOS`.
- Seguidores: `LIVE | E1-DIST | P2-FRIO | TRFG | ABO | 2026-11-05 | Impulsionar seguidores`.

### Orçamento na última conferência (09/11/2026)
Cantores R$ 80/dia (R$ 40 quente + R$ 40 frio) · Evento R$ 250/dia (vídeos; estáticos
R$ 75/dia pausado) · Seguidores R$ 10/dia · **total R$ 340/dia**. Serve só para
conferir o gasto dos últimos dias (não é métrica da dash). Em 08/11 o gasto
bruto foi R$ 586,53 (estáticos ainda gastando; cantores R$ 134).

## Arquitetura / arquivos

```
build/config.py             # CONFIG DO CLIENTE: planilhas, abas, janelas, etapas, imposto
build/build.py              # ENGINE: lê as 5 abas (read-only), atribui/deduplica, emite registros brutos e costura os arquivos
build/template.html         # esqueleto HTML (placeholders __STYLES__/__APP_JS__/__DATA_JSON__/__BUILD_ID__/__CLIENT_NAME__)
build/identidade-visual.css # TODAS as cores (temas claro/escuro, paleta, heatmap) — mesmo do modelo
build/estilos.css           # layout/componentes
build/app.js                # lógica + renderização (client-side)
.github/workflows/deploy.yml # build + publicação no Pages (workflow_dispatch / schedule 2 h / push)
SETUP-CRON.md               # valores do cron-job.org
dist/index.html             # saída (gitignored)
```

Dados emitidos pelo build (`DATA`): `meta_lsc[]`, `meta_evt[]` (`{d,camp,adset,ad,sp,im,cl,pv}`),
`seg[]` (`{d,camp,adset,ad,sp,im,cl,seg|null}`), `leads_lsc[]` (`{d,camp,adset,ad,v,st[,et]}`
com `st` = mql|dq|na|fora|outra), `leads_evt[]` (`{d,camp,adset,ad,v}`), `sep_lsc[]`/`sep_evt[]`
(`{d,g}` com g = teste|duplicado|nao_meta). Nenhum dado pessoal (nome, e-mail, telefone) vai para a página pública.

**Teste local** (CSVs baixados via gviz — não commitar):
```
python build/build.py --meta-lsc-file lsc_meta.csv --meta-evt-file evt_meta.csv \
  --seg-file seg.csv --leads-lsc-file leads_lsc.csv --leads-evt-file leads_evt.csv --out dist/index.html
```
O log do build (stderr) mostra totais, cadastros sem vínculo (com ID) e etapas desconhecidas.

## Publicação — problemas conhecidos

1. **cron-job.org só funciona na `main`**: `workflow_dispatch` existe só na branch padrão.
2. **Pages liga sozinho**: `actions/configure-pages` com `enablement: true`. Se não ligar,
   Settings → Pages → Source: **GitHub Actions**.
3. **Token**: fine-grained, só este repo, *Actions: Read and write*; cadastrado **apenas no
   cron-job.org**, nunca em arquivo do repo. Token exposto em chat/log → revogar e gerar outro.
4. **"Não atualiza"**: a página não recarrega sozinha; consulta o build publicado
   (`<meta name="build">`, `cache:'no-store'`) e mostra "Novos dados publicados · Atualizar agora".
   Build na tela: rodapé do menu e "Última atualização" na topbar.
5. **Lead sem campanha**: conferir no log do build os IDs "sem vínculo" e comparar as
   UTMs/URL da página de entrada com Campaign/Ad Set/Ad Name da extração.
