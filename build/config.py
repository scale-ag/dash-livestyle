# -*- coding: utf-8 -*-
"""
Configuração do cliente Live Style — lida por build/build.py.

Tudo que é específico do cliente fica aqui (planilhas, abas, janelas dos
painéis, imposto, rótulos). A engine (build.py, app.js, template.html, CSS)
não deve precisar de edição para mudar esses valores.

As planilhas são SOMENTE LEITURA: o build só lê via gviz (CSV), nunca escreve.
"""

# --------------------------------------------------------------------------- #
# Rótulos
# --------------------------------------------------------------------------- #
CLIENT_NAME = "Live Style"
CLIENT_SUB = "Cantores · Evento SP · Seguidores"

# --------------------------------------------------------------------------- #
# Planilhas (lidas pelo NOME da aba via gviz, com &headers=N)
# --------------------------------------------------------------------------- #
# Dash LiveStyle (tráfego, extração Adveronix)
SPREADSHEET_ID_TRAFEGO = "1McCzHKKJzcF3oeQ4c580qG1L16TI8NRrv0OAhL-MRm4"
SHEET_META_LSC = "Página1"            # tráfego de cantores
SHEET_META_EVT = "EVT Presencial SP"  # tráfego do evento
SHEET_SEG = "Seguidores "             # ATENÇÃO: o nome da aba tem um espaço no final

# Leads - LiveStyle (cadastros de cantores). Linha 1 só agrupa colunas; o
# cabeçalho real está na linha 2 -> headers=2 (o gviz junta as duas linhas, por
# isso o build casa as colunas pela POSIÇÃO, com o nome só como conferência).
SPREADSHEET_ID_LSC = "1JTMI-ZJFRcmk2nh8_AQrMzGzAwsX7LMyY8dCF1kUv8M"
SHEET_LEADS_LSC = "Leads"
HEADERS_LEADS_LSC = 2

# Artista Ilimitado (inscrições do evento). Só a aba "Leads Jornada";
# "Leads Ilimitados" é outro fluxo e NÃO entra.
SPREADSHEET_ID_EVT = "14FFjNMUcnruhXgIqwwuzc0UDX3CP7GSO8T6vXgMyzvQ"
SHEET_LEADS_EVT = "Leads Jornada"
HEADERS_LEADS_EVT = 1

# --------------------------------------------------------------------------- #
# Painéis
# --------------------------------------------------------------------------- #
# Captação de Cantores (LSC): funil contínuo, iniciado em 05/11/2026.
LSC_START = "2026-11-05"
# Evento Presencial SP (EVT): captação de 06 a 18/11/2026, meta de 150 inscrições.
EVT_START = "2026-11-06"
EVT_END = "2026-11-18"
EVT_GOAL = 150

# Classificação de MQL (só cantores) pela coluna D "Etapa atual" (valor EXATO).
# Decisão do cliente (13/11/2026): qualificado = SÓ quem está HOJE em "Reunião CEO".
# Quem avançou no CRM (Ativo, Cadastro Backstage...) NÃO conta como MQL: fica em
# "Outras etapas", junto com Removido/Arquivado (no total de leads, fora da taxa).
# Qualquer valor fora das listas abaixo é avisado no log do build e na dash.
ETAPA_MQL = "Reunião CEO"
ETAPAS_POS_CEO = ("Contato inicial", "Aguardando live teste", "Live teste", "Cadastro Backstage",
                  "Backstage", "Ativo")
ETAPA_DESQUALIFICADO = "Rejeitado"
ETAPA_NAO_AVALIADO = "Formulário preenchido"
ETAPAS_FORA = ("Removido", "Arquivado") + ETAPAS_POS_CEO   # no total de leads, fora da classificação

# --------------------------------------------------------------------------- #
# Regras
# --------------------------------------------------------------------------- #
# Imposto de 13,85% sobre o gasto da Meta (toggle "Imposto Meta", ligado por padrão).
TAX_FACTOR = 1.1385

# utm_source que contam como Meta Ads (comparação sem acento/caixa/símbolos:
# "Meta Ads", "Meta-Ads", "Meta+Ads+", "META" -> "metaads"/"meta").
META_SOURCES = ("metaads", "meta")
# utm_source de teste (separado, nunca conta como resultado de anúncio).
TEST_SOURCES = ("testegtm",)
# "Como chegou" de teste técnico (só a base do evento tem essa coluna).
TEST_COMO_CHEGOU = ("Outro: Teste técnico interno",)
