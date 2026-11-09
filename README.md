# Dashboard de Tráfego Pago · Live Style

Dashboard estático (HTML/CSS/JS + Chart.js) publicado no GitHub Pages:
**https://scale-ag.github.io/dash-livestyle/**

Cruza a extração da Meta Ads (Adveronix) com os cadastros reais das bases de leads
da Live Style em três painéis — **Captação de Cantores (LSC)**, **Evento Presencial SP
(EVT)** e **Seguidores Instagram** — mais a Visão Geral e o Relatório (melhores e
piores criativos).

- Atualização: GitHub Actions a cada 2 h, disparado pelo cron-job.org (ver `SETUP-CRON.md`).
- Planilhas: somente leitura (IDs e abas em `build/config.py`).
- Regras de negócio, fontes e atribuição: `CLAUDE.md`.

## Teste local

```bash
python build/build.py --meta-lsc-file lsc_meta.csv --meta-evt-file evt_meta.csv \
  --seg-file seg.csv --leads-lsc-file leads_lsc.csv --leads-evt-file leads_evt.csv \
  --out dist/index.html
```

Sem os `--*-file`, o build lê as planilhas direto do Google (gviz).
