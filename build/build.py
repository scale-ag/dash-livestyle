#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera a dashboard estática (dist/index.html) da Live Style a partir de 5 abas em
3 planilhas (todas SOMENTE LEITURA — o build só lê via gviz/CSV):

  Planilha "Dash LiveStyle" (tráfego, Adveronix):
    - "Página1"            -> gasto/impressões/cliques/page views dos CANTORES (LSC)
    - "EVT Presencial SP"  -> idem do EVENTO presencial SP (EVT)
    - "Seguidores "        -> campanha de seguidores do Instagram (coluna H à mão)
    A coluna "Leads" da extração são eventos da Meta e NÃO é usada como resultado.

  Planilha "Leads - LiveStyle", aba "Leads"            -> cadastros de cantores
  Planilha "Artista Ilimitado", aba "Leads Jornada"    -> inscrições do evento

Resultado de anúncio = cadastro REAL na base de leads com utm_source da Meta
(Meta Ads / Meta-Ads / Meta+Ads+ / META), deduplicado por WhatsApp (com/sem DDI
55, com/sem 9º dígito) com fallback no e-mail. Testes (utm_source teste_gtm /
"Outro: Teste técnico interno") e cadastros sem origem Meta ficam separados e
não contam como resultado de anúncio.

Atribuição (cadastro -> linha do Meta): utm_campaign = Campaign Name,
utm_medium = Ad Set Name, utm_content = Ad Name. Nos dados reais o utm_term
traz o ID do conjunto (não o nome) — usado só como reserva para recuperar o
conjunto quando utm_campaign/utm_medium vêm vazios. Quando as colunas UTM vêm
vazias, os valores são lidos da URL da "Página de entrada". Sem match: o
cadastro entra no total, sem campanha ("sem vínculo").

O build NÃO agrega: exporta registros brutos e toda a lógica (período, filtros,
imposto, KPIs, tabelas, gráficos) roda no navegador (app.js).

Teste local (CSVs baixados das abas; não commitar):
  python build/build.py --meta-lsc-file lsc_meta.csv --meta-evt-file evt_meta.csv \
      --seg-file seg.csv --leads-lsc-file leads_lsc.csv --leads-evt-file leads_evt.csv \
      --out dist/index.html
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C  # noqa: E402

SP = ZoneInfo("America/Sao_Paulo")
EXPORT_URL = "https://docs.google.com/spreadsheets/d/{sid}/gviz/tq?tqx=out:csv&headers={h}&sheet={sheet}"
SEM = {"camp": "(sem campanha)", "adset": "(sem conjunto)", "ad": "(sem anúncio)"}


# --------------------------------------------------------------------------- #
# Leitura
# --------------------------------------------------------------------------- #
def fetch_csv(url: str) -> list[list[str]]:
    req = urllib.request.Request(url, headers={"User-Agent": "dash-bot/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    return list(csv.reader(io.StringIO(raw)))


def read_csv_file(path: str) -> list[list[str]]:
    with open(path, "r", encoding="utf-8", errors="replace", newline="") as f:
        return list(csv.reader(f))


def load(sid: str, sheet: str, headers: int, local: str | None) -> list[list[str]]:
    if local:
        return read_csv_file(local)
    return fetch_csv(EXPORT_URL.format(sid=sid, h=headers, sheet=urllib.parse.quote(sheet)))


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def norm(s: str | None) -> str:
    return strip_accents((s or "").strip().lower())


def key(s: str | None) -> str:
    """Chave de comparação de UTM x Meta: decodifica %XX e '+', tira acento,
    caixa e tudo que não for letra/número. Assim "IG + Engajamento",
    "IG   Engajamento" (o '+' virou espaço na URL) e "IG+%2B+Engajamento" batem."""
    return re.sub(r"[^a-z0-9]", "", norm(urllib.parse.unquote_plus(s or "")))


def to_float(v) -> float:
    s = re.sub(r"[^\d,.\-]", "", str(v or "").strip())
    if not s:
        return 0.0
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_day(v: str) -> str | None:
    """Data pura (coluna Day do Meta, já no fuso da conta)."""
    s = (v or "").strip()
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return None


def parse_ts_sp(v: str) -> tuple[str | None, str]:
    """Data/hora de entrada do cadastro -> (dia em São Paulo, chave de ordenação).
    Timestamp com fuso (ISO com Z/+00:00) é CONVERTIDO para São Paulo antes de
    extrair o dia. Sem fuso ("dd/mm/aaaa HH:MM", como vem das planilhas) já é
    horário local de São Paulo."""
    s = (v or "").strip()
    if not s:
        return None, ""
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            dt = dt.astimezone(SP)
        return dt.strftime("%Y-%m-%d"), dt.strftime("%Y-%m-%d %H:%M:%S")
    except ValueError:
        pass
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?", s)
    if m:
        d = f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
        hh, mm, ss = int(m.group(4) or 0), int(m.group(5) or 0), int(m.group(6) or 0)
        return d, f"{d} {hh:02d}:{mm:02d}:{ss:02d}"
    d = parse_day(s)
    return d, (d or "")


def canon_phone(p: str) -> str:
    """WhatsApp canônico p/ deduplicar: tira DDI 55 e usa DDD + últimos 8 dígitos
    (igual com ou sem o 9º dígito). Números curtos voltam vazios (não deduplicam)."""
    d = re.sub(r"\D", "", p or "")
    if len(d) > 11 and d.startswith("55"):
        d = d[2:]
    if len(d) >= 10:
        return d[:2] + d[-8:]
    return ""


def cell(row, i):
    if i is None or i < 0 or i >= len(row):
        return ""
    return (row[i] or "").strip()


def header_index(header, wanted, fallback):
    """Casa cada alias com uma coluna do cabeçalho (exato > substring); sem
    match usa a posição conhecida (fallback)."""
    hn = [norm(h) for h in header]
    idx = {}
    for k, aliases in wanted.items():
        found = None
        for a in map(norm, aliases):
            found = next((i for i, h in enumerate(hn) if h == a), None)
            if found is not None:
                break
        if found is None:
            for a in map(norm, aliases):
                found = next((i for i, h in enumerate(hn) if a and a in h), None)
                if found is not None:
                    break
        idx[k] = found if found is not None else fallback.get(k)
    return idx


def is_macro(s: str) -> bool:
    return not s or "{{" in s


def utm_from_url(url: str) -> dict:
    q = urllib.parse.urlparse(url or "").query
    return {k: v[0] for k, v in urllib.parse.parse_qs(q).items() if v}


# --------------------------------------------------------------------------- #
# Meta Ads (Página1 / EVT Presencial SP)
# --------------------------------------------------------------------------- #
def build_meta(rows, label):
    idx = header_index(
        rows[0] if rows else [],
        {"day": ["day"], "camp": ["campaign name"], "adset": ["ad set name"], "ad": ["ad name"],
         "im": ["impressions"], "cl": ["link clicks"], "pv": ["landing page views"], "sp": ["amount spent"]},
        {"day": 0, "camp": 1, "adset": 2, "ad": 3, "im": 4, "cl": 5, "pv": 6, "sp": 7},
    )
    out = []
    for row in rows[1:]:
        d = parse_day(cell(row, idx["day"]))
        if not d:
            continue
        sp, im = round(to_float(cell(row, idx["sp"])), 4), to_float(cell(row, idx["im"]))
        cl, pv = to_float(cell(row, idx["cl"])), to_float(cell(row, idx["pv"]))
        if not (sp or im or cl or pv):
            continue
        out.append({"d": d, "camp": cell(row, idx["camp"]) or SEM["camp"],
                    "adset": cell(row, idx["adset"]) or SEM["adset"], "ad": cell(row, idx["ad"]) or SEM["ad"],
                    "sp": sp, "im": im, "cl": cl, "pv": pv})
    print(f"  meta {label}: {len(out)} linhas | gasto bruto R$ {sum(r['sp'] for r in out):,.2f}", file=sys.stderr)
    return out


def build_followers(rows):
    """Aba "Seguidores ": seg = coluna H (à mão). Vazio = não preenchido (None),
    diferente de 0. A coluna "Custo por seguidor" é ignorada (a dash calcula)."""
    idx = header_index(
        rows[0] if rows else [],
        {"day": ["day"], "camp": ["campaign name"], "adset": ["ad set name"], "ad": ["ad name"],
         "im": ["impressions"], "cl": ["link clicks"], "sp": ["amount spent"], "seg": ["seguidores"]},
        {"day": 0, "camp": 1, "adset": 2, "ad": 3, "im": 4, "cl": 5, "sp": 6, "seg": 7},
    )
    out = []
    for row in rows[1:]:
        d = parse_day(cell(row, idx["day"]))
        if not d:
            continue
        raw = cell(row, idx["seg"])
        seg = int(round(to_float(raw))) if raw else None
        sp, im = round(to_float(cell(row, idx["sp"])), 4), to_float(cell(row, idx["im"]))
        if not sp and not im and not seg:
            continue
        out.append({"d": d, "camp": cell(row, idx["camp"]) or SEM["camp"],
                    "adset": cell(row, idx["adset"]) or SEM["adset"], "ad": cell(row, idx["ad"]) or SEM["ad"],
                    "sp": sp, "im": im, "cl": to_float(cell(row, idx["cl"])), "seg": seg})
    print(f"  seguidores: {len(out)} linhas | gasto R$ {sum(r['sp'] for r in out):,.2f} | "
          f"seguidores {sum(r['seg'] or 0 for r in out)} | linhas sem preencher {sum(1 for r in out if r['seg'] is None)}",
          file=sys.stderr)
    return out


# --------------------------------------------------------------------------- #
# Leads (cantores / evento)
# --------------------------------------------------------------------------- #
LEAD_COLS = {
    # Cantores: A id · B entrada · D etapa · N e-mail · O WhatsApp · Q-U UTMs · Z página
    "lsc": ({"id": ["id do lead"], "dt": ["entrou em"], "etapa": ["etapa atual"], "email": ["e-mail"],
             "wa": ["whatsapp"], "src": ["utm_source"], "med": ["utm_medium"], "camp": ["utm_campaign"],
             "cont": ["utm_content"], "term": ["utm_term"], "pg": ["pagina de entrada"]},
            {"id": 0, "dt": 1, "etapa": 3, "email": 13, "wa": 14, "src": 16, "med": 17, "camp": 18,
             "cont": 19, "term": 20, "pg": 25}),
    # Evento: A id · B entrada · D etapa · G WhatsApp · H e-mail · T como chegou · V-Z UTMs · AC página
    "evt": ({"id": ["id"], "dt": ["entrada"], "etapa": ["etapa"], "wa": ["whatsapp"], "email": ["e-mail"],
             "como": ["como chegou"], "src": ["utm_source"], "med": ["utm_medium"], "camp": ["utm_campaign"],
             "term": ["utm_term"], "cont": ["utm_content"], "pg": ["pagina de entrada"]},
            {"id": 0, "dt": 1, "etapa": 3, "wa": 6, "email": 7, "como": 19, "src": 21, "med": 22, "camp": 23,
             "term": 24, "cont": 25, "pg": 28}),
}


def classify_lsc(etapa: str) -> str:
    """MQL = Etapa atual exatamente "Reunião CEO" (decisão do cliente, 13/11/2026)."""
    if etapa == C.ETAPA_MQL:
        return "mql"
    if etapa == C.ETAPA_DESQUALIFICADO:
        return "dq"
    if etapa == C.ETAPA_NAO_AVALIADO:
        return "na"
    if etapa in C.ETAPAS_FORA:
        return "fora"
    return "outra"


def build_leads(rows, meta, panel, start):
    """Cadastros -> (leads[], separados[], diagnóstico).
    leads[]     : 1 por cadastro de anúncio Meta deduplicado
                  {d, camp, adset, ad, v (1=atribuído a uma linha do Meta), st?/et? (cantores)}
    separados[] : {d, g} com g in teste | duplicado | nao_meta (contagem por período)."""
    wanted, fb = LEAD_COLS[panel]
    idx = header_index(rows[0] if rows else [], wanted, fb)

    combos = {(key(m["camp"]), key(m["adset"]), key(m["ad"])): m for m in meta}
    by_camp_ad = defaultdict(set)
    for m in meta:
        by_camp_ad[(key(m["camp"]), key(m["ad"]))].add((m["camp"], m["adset"], m["ad"]))

    recs = []
    for row in rows[1:]:
        lid = cell(row, idx["id"])
        if not lid:
            continue
        d, ts = parse_ts_sp(cell(row, idx["dt"]))
        r = {k: cell(row, idx[k]) for k in idx}
        pg = utm_from_url(r["pg"]) if "?" in r["pg"] else {}
        for col, q in (("camp", "utm_campaign"), ("med", "utm_medium"), ("cont", "utm_content"),
                       ("src", "utm_source"), ("term", "utm_term")):
            if is_macro(r[col]) and not is_macro(pg.get(q, "")):
                r[col] = pg[q]
        r.update(d=d, ts=ts)
        recs.append(r)

    # utm_term = ID do conjunto: aprende ID -> (campanha, conjunto) nos cadastros completos
    id_map = defaultdict(Counter)
    for r in recs:
        if r["term"].isdigit() and not is_macro(r["camp"]) and not is_macro(r["med"]):
            id_map[r["term"]][(r["camp"], r["med"])] += 1

    def match(r):
        c, m, a = r["camp"], r["med"], r["cont"]
        if (is_macro(c) or is_macro(m)) and r["term"] in id_map:
            c, m = id_map[r["term"]].most_common(1)[0][0]
        hit = combos.get((key(c), key(m), key(a)))
        if hit:
            return hit["camp"], hit["adset"], hit["ad"]
        cand = by_camp_ad.get((key(c), key(a)), set())
        if len(cand) == 1:
            return next(iter(cand))
        return None

    leads, sep, seen = [], [], {}
    antes, unknown, sem_vinc = 0, Counter(), []
    for r in sorted(recs, key=lambda x: x["ts"]):
        if not r["d"] or r["d"] < start:
            antes += 1
            continue
        src = key(r["src"])
        if src in C.TEST_SOURCES or r.get("como", "") in C.TEST_COMO_CHEGOU:
            sep.append({"d": r["d"], "g": "teste"})
            continue
        dk = canon_phone(r["wa"]) or norm(r["email"])
        if dk and dk in seen:
            sep.append({"d": r["d"], "g": "duplicado"})
            continue
        if dk:
            seen[dk] = r["id"]
        if src not in C.META_SOURCES:
            sep.append({"d": r["d"], "g": "nao_meta"})
            continue
        hit = match(r)
        rec = {"d": r["d"], "camp": hit[0], "adset": hit[1], "ad": hit[2], "v": 1} if hit else {"d": r["d"], **SEM, "v": 0}
        if not hit:
            sem_vinc.append(r)
        if panel == "lsc":
            rec["st"] = classify_lsc(r["etapa"])
            if rec["st"] == "fora":
                rec["et"] = r["etapa"]
            if rec["st"] == "outra":
                rec["et"] = r["etapa"] or "(vazio)"
                unknown[rec["et"]] += 1
        leads.append(rec)

    g = Counter(s["g"] for s in sep)
    print(f"  leads {panel}: {len(leads)} de anúncio Meta ({len(leads) - len(sem_vinc)} atribuídos, "
          f"{len(sem_vinc)} sem vínculo) | separados: {dict(g)} | antes de {start}: {antes}", file=sys.stderr)
    for r in sem_vinc:
        print(f"    - sem vínculo: {r['id']} {r['d']} camp={r['camp'][:40]!r} medium={r['med'][:30]!r} "
              f"content={r['cont'][:30]!r}", file=sys.stderr)
    if unknown:
        print(f"  ATENÇÃO: etapa(s) fora das 5 conhecidas em {panel}: {dict(unknown)}", file=sys.stderr)
    return leads, sep, sorted(unknown)


# --------------------------------------------------------------------------- #
# Processamento / render
# --------------------------------------------------------------------------- #
def process(meta_lsc_rows, meta_evt_rows, seg_rows, leads_lsc_rows, leads_evt_rows):
    meta_lsc = build_meta(meta_lsc_rows, "cantores")
    meta_evt = build_meta(meta_evt_rows, "evento")
    seg = build_followers(seg_rows)
    leads_lsc, sep_lsc, unk = build_leads(leads_lsc_rows, meta_lsc, "lsc", C.LSC_START)
    leads_evt, sep_evt, _ = build_leads(leads_evt_rows, meta_evt, "evt", C.EVT_START)

    dates = sorted({r["d"] for r in meta_lsc + meta_evt + seg + leads_lsc + leads_evt if r["d"]})
    now = datetime.now(SP)
    return {
        "build": {
            "generated_at_brt": now.strftime("%d/%m/%Y %H:%M"),
            "build_id": datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S"),
            "today": now.strftime("%Y-%m-%d"),
            "now_hm": now.strftime("%H:%M"),
            "date_min": dates[0] if dates else None,
            "date_max": dates[-1] if dates else None,
            "tax_factor": C.TAX_FACTOR,
            "client_name": C.CLIENT_NAME,
            "client_sub": C.CLIENT_SUB,
            "lsc_start": C.LSC_START,
            "evt_start": C.EVT_START,
            "evt_end": C.EVT_END,
            "evt_goal": C.EVT_GOAL,
            "unknown_etapas": unk,
        },
        "meta_lsc": meta_lsc,
        "meta_evt": meta_evt,
        "seg": seg,
        "leads_lsc": leads_lsc,
        "leads_evt": leads_evt,
        "sep_lsc": sep_lsc,
        "sep_evt": sep_evt,
    }


def render(data, template_path):
    # Costura os arquivos separados (visual x lógica) e injeta os dados:
    #   template.html (esqueleto) · identidade-visual.css (cores) · estilos.css (layout) · app.js (lógica)
    base = os.path.dirname(os.path.abspath(template_path))

    def readf(name):
        with open(os.path.join(base, name), "r", encoding="utf-8") as f:
            return f.read()

    tpl = readf(os.path.basename(template_path))
    tpl = tpl.replace("__STYLES__", readf("identidade-visual.css") + "\n" + readf("estilos.css"))
    tpl = tpl.replace("__APP_JS__", readf("app.js"))
    tpl = tpl.replace("__DATA_JSON__", json.dumps(data, ensure_ascii=False).replace("</", "<\\/"))
    tpl = tpl.replace("__BUILD_ID__", data["build"]["build_id"])
    tpl = tpl.replace("__CLIENT_NAME__", data["build"]["client_name"])
    return tpl


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--meta-lsc-file", help="CSV local da aba Página1 (tráfego cantores)")
    ap.add_argument("--meta-evt-file", help="CSV local da aba EVT Presencial SP")
    ap.add_argument("--seg-file", help="CSV local da aba 'Seguidores '")
    ap.add_argument("--leads-lsc-file", help="CSV local da aba Leads (cantores), exportado com headers=2")
    ap.add_argument("--leads-evt-file", help="CSV local da aba Leads Jornada (evento)")
    ap.add_argument("--template", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "template.html"))
    ap.add_argument("--out", default="dist/index.html")
    a = ap.parse_args()

    data = process(
        load(C.SPREADSHEET_ID_TRAFEGO, C.SHEET_META_LSC, 1, a.meta_lsc_file),
        load(C.SPREADSHEET_ID_TRAFEGO, C.SHEET_META_EVT, 1, a.meta_evt_file),
        load(C.SPREADSHEET_ID_TRAFEGO, C.SHEET_SEG, 1, a.seg_file),
        load(C.SPREADSHEET_ID_LSC, C.SHEET_LEADS_LSC, C.HEADERS_LEADS_LSC, a.leads_lsc_file),
        load(C.SPREADSHEET_ID_EVT, C.SHEET_LEADS_EVT, C.HEADERS_LEADS_EVT, a.leads_evt_file),
    )
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(render(data, a.template))
    b = data["build"]
    print(f"== build ok == {b['date_min']} -> {b['date_max']} | hoje {b['today']} {b['now_hm']} | out {a.out}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
