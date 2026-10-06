#!/usr/bin/env python3
"""
Mede o viés entre a BASE DE CÁLCULO do IPVA de SP e a FIPE que o simulador usa.

Por que existe: em SP o IPVA não incide sobre a FIPE, e sim sobre a tabela da
SEFAZ publicada em dezembro (Resolução SFP-40/25 para 2026), congelada nos
preços de setembro do ano anterior. O simulador multiplica a alíquota pela FIPE
do mês corrente. Este script mede a diferença em vez de supô-la — a suposição
anterior ("a base é menor") tinha sido derrubada por 4 pontos, e 4 pontos
também não mediam nada.

O que faz:
  1. Lê o Anexo I (PDF, ~286 páginas) pelas coordenadas das palavras. Não é
     OCR: o PDF tem camada de texto, os valores são alinhados à direita, e a
     coluna de cada valor é o ano cujo cabeçalho tem a borda direita mais
     próxima.
  2. Casa a descrição da SEFAZ (padrão DENATRAN, "FIAT/ARGO DRIVE 1.0") com o
     nome da FIPE ("ARGO DRIVE 1.0 6V Flex") por regra RÍGIDA: toda palavra
     significativa da SEFAZ precisa estar na FIPE, o câmbio automático precisa
     bater nos dois lados, turbo conta, e a FIPE não pode ter palavra
     significativa a mais. Empate é descartado. Mede-se menos carro para não
     medir carro errado.
  3. Busca o preço FIPE do mês corrente de cada par (API parallelum v1), com
     cache em disco.
  4. Resume base/FIPE − 1 no total, por grupo de casamento (estrito: a SEFAZ
     escreve a cilindrada; relaxado: não escreve) e por faixa de ano-modelo.

Uso (precisa de `pip install pymupdf`):
  python scripts/measure-sp-ipva-base.py <anexo-I.pdf> [cache.json]

O anexo está em
  https://legislacao.fazenda.sp.gov.br/Paginas/Resolução-SFP-40-de-2025.aspx
e muda todo dezembro — rodar de novo quando sair a resolução do ano seguinte.
"""

import collections
import json
import os
import re
import statistics
import sys
import time
import urllib.request

import pymupdf

FIPE = "https://parallelum.com.br/fipe/api/v1/carros/marcas"
# Prefixo da SEFAZ -> código de marca da FIPE.
BRANDS = {
    "FIAT": 21, "VW": 59, "GM": 23, "CHEV": 23, "CHEVROLET": 23, "HYUNDAI": 26,
    "TOYOTA": 56, "RENAULT": 48, "HONDA": 25, "JEEP": 29, "NISSAN": 43, "FORD": 22,
}
# Palavras que não mudam o carro (ou que um lado escreve e o outro não).
NEUTRAL = {
    "FLEX", "FLEXFUEL", "TOTALFLEX", "TOT", "8V", "12V", "16V", "6V", "20V", "24V",
    "4P", "5P", "2P", "3P", "MEC", "MECANICO", "MANUAL", "MT", "GASOLINA", "GAS",
    "HATCH", "HA", "SEDAN", "SED", "CD", "4X2",
}
AUTO = {"AUT", "AT", "AUTOMATICO", "CVT", "AT6", "AUT6", "TIPTRONIC", "DSG"}


def parse_table(pdf_path):
    doc = pymupdf.open(pdf_path)
    rows = []
    for page in doc:
        words = page.get_text("words")
        header = [(int(w[4]), w[2]) for w in words if re.fullmatch(r"20\d\d", w[4]) and 85 < w[1] < 100]
        if not header:
            continue
        body = sorted((w for w in words if w[1] > 100), key=lambda w: (w[1], w[0]))
        lines = []
        for w in body:
            if lines and abs(lines[-1][0] - w[1]) <= 2.5:
                lines[-1][1].append(w)
            else:
                lines.append([w[1], [w]])
        for _, line in lines:
            desc = " ".join(w[4] for w in sorted(line, key=lambda w: w[0]) if 38 < w[0] < 188)
            code = [w[4] for w in line if 188 < w[0] < 225 and w[4].isdigit()]
            vals = {}
            for w in line:
                if w[0] >= 278 and re.fullmatch(r"[\d\.]+", w[4]):
                    year = min(header, key=lambda h: abs(h[1] - w[2]))[0]
                    vals[year] = int(w[4].replace(".", ""))
            if code and desc:
                rows.append({"desc": desc, "code": code[0], "vals": vals})
    return rows


def tokens(text):
    text = re.sub(r"(\d) \. (\d)", r"\1.\2", text.upper().replace(".", " . "))
    out = []
    for tok in re.findall(r"\d\.\d|[A-Z0-9]+", text):
        glued = re.fullmatch(r"(\d\.\d)(AT|MT|AUT|CVT)", tok)
        out += [glued.group(1), glued.group(2)] if glued else [tok]
    return out


def signature(toks):
    return {t for t in toks if t not in NEUTRAL and t not in AUTO}, any(t in AUTO for t in toks)


class Fipe:
    def __init__(self, cache_path):
        self.cache_path = cache_path
        self.cache = json.load(open(cache_path, encoding="utf-8")) if os.path.exists(cache_path) else {}

    def get(self, url):
        if url in self.cache:
            return self.cache[url]
        for attempt in range(4):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                data = json.load(urllib.request.urlopen(req, timeout=20))
                self.cache[url] = data
                time.sleep(0.25)
                return data
            except Exception as exc:  # noqa: BLE001 — rede instável, tenta de novo
                print("erro", exc, url, file=sys.stderr)
                time.sleep(3 * (attempt + 1))
        return None

    def save(self):
        json.dump(self.cache, open(self.cache_path, "w", encoding="utf-8"))


def match(rows, fipe):
    models = {bid: fipe.get(f"{FIPE}/{bid}/modelos")["modelos"] for bid in set(BRANDS.values())}
    pairs, stats = [], collections.Counter()
    for row in rows:
        if "/" not in row["desc"]:
            continue
        prefix, rest = row["desc"].split("/", 1)
        bid = BRANDS.get(prefix)
        if not bid:
            continue
        stats["linhas"] += 1
        core, auto = signature(tokens(rest))
        has_disp = any(re.fullmatch(r"\d\.\d", t) for t in core)
        cands = []
        for model in models[bid]:
            fcore, fauto = signature(tokens(model["nome"]))
            if fauto != auto or not core <= fcore:
                continue
            extra = fcore - core
            if not has_disp:
                extra = {t for t in extra if not re.fullmatch(r"\d\.\d", t)}
            cands.append((len(extra), model))
        best = [c for c in cands if c[0] == 0]
        if len(best) != 1:
            stats["sem par único"] += 1
            continue
        stats["casadas"] += 1
        pairs.append({**row, "brand": bid, "model": best[0][1]["codigo"], "fipe": best[0][1]["nome"], "strict": has_disp})
    return pairs, stats


def main():
    pdf_path = sys.argv[1]
    fipe = Fipe(sys.argv[2] if len(sys.argv) > 2 else "sp-ipva-fipe-cache.json")
    rows = parse_table(pdf_path)
    pairs, stats = match(rows, fipe)
    print(f"{len(rows)} linhas no anexo; {dict(stats)}")

    points = []
    for pair in pairs:
        years = fipe.get(f"{FIPE}/{pair['brand']}/modelos/{pair['model']}/anos") or []
        for y in years:
            year = int(y["codigo"].split("-")[0])
            base = pair["vals"].get(year)
            if not base or not 2012 <= year <= 2025:
                continue
            price = fipe.get(f"{FIPE}/{pair['brand']}/modelos/{pair['model']}/anos/{y['codigo']}")
            if price and "Valor" in price:
                value = int(re.sub(r"[^\d]", "", price["Valor"])) / 100
                points.append({**pair, "year": year, "base": base, "fipe_value": value, "ref": price.get("MesReferencia"), "r": base / value - 1})
    fipe.save()

    def summary(items, label):
        if not items:
            return
        r = sorted(p["r"] for p in items)
        q = lambda f: r[int(f * (len(r) - 1))]  # noqa: E731
        above = sum(1 for v in r if v > 0) / len(r)
        print(f"{label:28} n={len(r):4}  mediana {statistics.median(r)*100:+.1f}%  "
              f"p25 {q(.25)*100:+.1f}%  p75 {q(.75)*100:+.1f}%  base>FIPE {above*100:.0f}%")

    refs = collections.Counter(p["ref"] for p in points).most_common(1)
    print(f"FIPE de referência: {refs[0][0] if refs else '?'}  (positivo = base do IPVA ACIMA da FIPE)")
    summary(points, "todos")
    summary([p for p in points if p["strict"]], "estrito (com cilindrada)")
    summary([p for p in points if not p["strict"]], "relaxado")
    for lo, hi in [(2023, 2025), (2019, 2022), (2015, 2018), (2012, 2014)]:
        summary([p for p in points if lo <= p["year"] <= hi], f"ano-modelo {lo}-{hi}")


if __name__ == "__main__":
    main()
