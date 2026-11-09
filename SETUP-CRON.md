# cron-job.org — disparo do build a cada 2 h

O cron-job.org chama a API do GitHub, que roda o workflow **Build & Deploy Dashboard**
(`.github/workflows/deploy.yml`) na `main`. O workflow também tem um `schedule` de
backup a cada 2 h.

| Campo | Valor |
|---|---|
| URL | `https://api.github.com/repos/scale-ag/dash-livestyle/actions/workflows/deploy.yml/dispatches` |
| Método | `POST` |
| Agendamento | a cada 2 horas (minuto 0) |
| Corpo | `{"ref":"main"}` |

Headers (nome → valor):

| Nome | Valor |
|---|---|
| `Accept` | `application/vnd.github+json` |
| `Authorization` | `Bearer TOKEN_AQUI` |
| `X-GitHub-Api-Version` | `2022-11-28` |
| `Content-Type` | `application/json` |

`TOKEN_AQUI` = token **fine-grained** do GitHub, só para o repositório
`scale-ag/dash-livestyle`, permissão **Actions: Read and write**. Fica cadastrado
**apenas no cron-job.org** — nunca em arquivo deste repositório. Se o token aparecer
em chat, log ou commit, revogue e gere outro.

Resposta esperada do GitHub: **204 No Content**. Confira a execução em Actions.
