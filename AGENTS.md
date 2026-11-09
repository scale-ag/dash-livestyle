# AGENTS.md — Dashboard de Tráfego Pago · Live Style

Resumo para agentes (Codex etc.). O contexto completo está em `CLAUDE.md`.

## Projeto
- **Cliente:** Live Style (agência musical; recruta cantores para lives no TikTok).
- **Painéis:** Captação de Cantores (LSC) · Evento Presencial SP (EVT, meta 150, 06–18/11/2026) · Seguidores Instagram.
- **URL pública:** https://scale-ag.github.io/dash-livestyle/
- **Build:** GitHub Actions (`.github/workflows/deploy.yml`) a cada 2 h via cron-job.org → GitHub Pages.

## Regras que não podem quebrar
1. Planilhas são **somente leitura**.
2. Resultado = cadastro real nas bases de leads com `utm_source` Meta; **nunca** a coluna Leads da extração.
3. MQL = Etapa atual `Reunião CEO` (só cantores). Taxa = MQL ÷ (MQL + Rejeitado).
4. Custo por seguidor só com a coluna H preenchida.
5. Imposto 13,85% (×1,1385) ligado por padrão em todos os custos.
6. Nenhum token/segredo em arquivo do repositório.
7. Não adicionar métricas/páginas sem fonte de dado.

## Arquivos
- `build/config.py` (config do cliente) · `build/build.py` (engine) · `build/app.js` (lógica no navegador)
- `build/template.html` · `build/identidade-visual.css` (cores) · `build/estilos.css` (layout)
