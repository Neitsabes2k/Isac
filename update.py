import csv
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date as _date, datetime, timedelta, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import requests

BASE = "https://division-2-builds-tool.pages.dev/"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")  # dossier du site, à côté de ce fichier
PAGES = ["", "index.html", "calendar.html", "escalation.html", "isac.html", "vendors.html"]
FOLDERS = ["data/", "data/snapshot/", "data/div2hub/"]

# Le calendrier du site lit aussi ce petit serveur (Cloudflare) : on en garde une copie fraîche
WORKER_CALENDAR = "https://isac-proxy.anxkioalt.workers.dev/calendar"

# Source officielle du butin ciblé (la bonne, à jour)
PROTO_PAGE = "https://prototrack.gg/target-loot/target-loot.php"
PROTO_TXT = "https://prototrack.gg/target-loot/target-loot-current.txt"

# Noms de fichiers déjà connus
CSV_NAMES = {
    "settings.csv", "brandsets.csv", "gear_named.csv", "gear_talents.csv",
    "skill_list.csv", "attribute_info.csv", "weapon_mods.csv", "attributes.csv",
    "brand_sets.csv", "stats.csv", "gear_sets.csv", "gear_mods.csv",
    "weapon_talents.csv", "augments.csv", "specializations.csv",
    "talent_effects.csv", "extra_weapons.csv", "extra_gear.csv", "weapon_fits.csv",
    "targets.csv", "welcome.csv", "weapons.csv", "weapons_named.csv", "gearsets.csv",
    "events.csv", "auto_events.csv", "seasons.csv",
}

EXT = r"(?:html|js|mjs|css|json|csv|png|jpe?g|webp|svg|gif|ico|woff2?|ttf|webmanifest|txt)"
HTML_RE = re.compile(r'''(?:src|href)=["']([^"'#]+)["']''', re.I)
PATH_RE = re.compile(r'''["'`]((?:\.{0,2}/)?[\w\-./%]+\.''' + EXT + r''')(?:\?[^"'`]*)?["'`]''', re.I)
URL_RE = re.compile(r'''https?://[^\s"'`)<>\\]+''')
CSV_RE = re.compile(r'''[\w\-]+\.csv''', re.I)
WORD_RE = re.compile(r'''["'`]([A-Za-z0-9_\-]{3,40})["'`]''')
TEXT_EXT = ("", ".html", ".js", ".mjs", ".css", ".json", ".webmanifest")

host = urlparse(BASE).netloc
session = requests.Session()
session.headers["User-Agent"] = "Mozilla/5.0"
# On force toujours la version la plus récente (pas de cache)
session.headers["Cache-Control"] = "no-cache"
session.headers["Pragma"] = "no-cache"


def get(url):
    try:
        r = session.get(url, timeout=30, params={"nocache": os.urandom(4).hex()})
    except Exception as e:
        print("ERREUR", url, e)
        return None
    if r.status_code != 200:
        return None
    ext = os.path.splitext(urlparse(url).path)[1].lower()
    # Cloudflare renvoie parfois la page d'accueil pour un fichier inexistant : on l'ignore
    if ext not in ("", ".html") and "text/html" in r.headers.get("content-type", ""):
        return None
    return r


def save(url, content):
    path = urlparse(url).path
    if path.endswith("/") or path == "":
        path += "index.html"
    dest = os.path.join(OUT, path.lstrip("/").replace("/", os.sep))
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    with open(dest, "wb") as f:
        f.write(content)


# ---------------------------------------------------------------------------
#  Butin d'Escalade : on le prend directement sur ProtoTrack
# ---------------------------------------------------------------------------
MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}


class Tokens(HTMLParser):
    """Transforme une page HTML en suite de ('img', src, alt) et ('text', texte)."""

    def __init__(self):
        super().__init__()
        self.items = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self._skip += 1
        elif tag == "img":
            a = dict(attrs)
            src = a.get("src") or a.get("data-src") or ""
            self.items.append(("img", src, a.get("alt") or ""))

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip:
            t = " ".join(data.split())
            if t:
                self.items.append(("text", t, ""))


SKIP_TEXT = re.compile(r"^(appearances|last seen)\b|^\d+\s*times?$|\bago$|^today$|^yesterday$", re.I)


def clean_src(src):
    src = src.split("?")[0]
    return urljoin(PROTO_PAGE, src)


def read_stats(items, start, stop):
    """Cherche 'N times' et 'N day(s) ago' entre deux positions."""
    appearances, days = None, None
    for kind, val, _ in items[start:stop]:
        if kind != "text":
            continue
        m = re.search(r"(\d+)\s*times?", val, re.I)
        if m and appearances is None:
            appearances = int(m.group(1))
        m = re.search(r"(\d+)\s*days?\s*ago", val, re.I)
        if m and days is None:
            days = int(m.group(1))
        elif re.search(r"\b(today|just now|hours? ago)\b", val, re.I) and days is None:
            days = 0
        elif re.search(r"\byesterday\b", val, re.I) and days is None:
            days = 1
    return appearances, days


def next_text(items, i, stop):
    while i < stop:
        if items[i][0] == "text" and not SKIP_TEXT.search(items[i][1]):
            return i
        i += 1
    return None


def parse_proto_html(html):
    tk = Tokens()
    tk.feed(html)
    items = tk.items

    def find(pattern, start=0):
        for i in range(start, len(items)):
            if items[i][0] == "text" and re.search(pattern, items[i][1], re.I):
                return i
        return None

    i_m = find(r"^Escalation Missions")
    i_v = find(r"Requisition Vendor", i_m or 0)
    if i_m is None:
        return None
    end_m = i_v if i_v is not None else len(items)

    # --- missions ---
    starts = [i for i in range(i_m, end_m)
              if items[i][0] == "img" and "/factions/" in items[i][1]]
    missions = []
    for n, s in enumerate(starts):
        stop = starts[n + 1] if n + 1 < len(starts) else end_m
        faction_src = clean_src(items[s][1])
        faction = re.sub(r"\s*faction\s*$", "", items[s][2], flags=re.I).strip()
        if not faction:
            faction = os.path.splitext(os.path.basename(faction_src))[0].title()
        t1 = next_text(items, s + 1, stop)
        if t1 is None:
            continue
        mission = items[t1][1]
        loot_img = next((j for j in range(t1 + 1, stop)
                         if items[j][0] == "img" and "/factions/" not in items[j][1]), None)
        if loot_img is None:
            continue
        t2 = next_text(items, loot_img + 1, stop)
        if t2 is None:
            continue
        app, days = read_stats(items, t2 + 1, stop)
        missions.append({
            "mission": mission,
            "faction": faction,
            "factionIcon": faction_src,
            "loot": items[t2][1],
            "lootIcon": clean_src(items[loot_img][1]),
            "appearances": app if app is not None else 0,
            "last_seen_days": days if days is not None else 0,
        })

    # --- caches du vendeur ---
    caches = []
    if i_v is not None:
        idx = [i for i in range(i_v, len(items))
               if items[i][0] == "text" and re.fullmatch(r"Prototype (Gear|Weapon) Cache", items[i][1], re.I)]
        for n, s in enumerate(idx):
            stop = idx[n + 1] if n + 1 < len(idx) else len(items)
            img = next((j for j in range(s + 1, stop) if items[j][0] == "img"), None)
            if img is None:
                continue
            t = next_text(items, img + 1, stop)
            if t is None:
                continue
            app, days = read_stats(items, t + 1, stop)
            caches.append({
                "type": items[s][1],
                "item": items[t][1],
                "icon": clean_src(items[img][1]),
                "appearances": app if app is not None else 0,
                "last_seen_days": days if days is not None else 0,
            })

    flat = " ".join(v for k, v, _ in items if k == "text")
    date = week = None
    m = re.search(r"Loot date\s+(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})", flat)
    if m:
        date = "%s-%02d-%02d" % (m.group(3), MONTHS.get(m.group(2).lower(), 1), int(m.group(1)))
    m = re.search(r"Rotation week\s+(\d{1,2})\s+([A-Za-z]{3})\w*\s*[–-]\s*(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})", flat)
    if m:
        y2 = int(m.group(5))
        m1, m2 = MONTHS.get(m.group(2).lower(), 1), MONTHS.get(m.group(4).lower(), 1)
        y1 = y2 - 1 if m1 > m2 else y2
        week = ["%d-%02d-%02d" % (y1, m1, int(m.group(1))), "%d-%02d-%02d" % (y2, m2, int(m.group(3)))]
    return {"missions": missions, "caches": caches, "date": date, "week": week}


def parse_proto_txt(txt):
    """Plan B : le petit fichier texte de ProtoTrack (noms seulement)."""
    out = {"missions": [], "caches": [], "date": None}
    m = re.search(r"Date:\s*(\d{4}-\d{2}-\d{2})", txt)
    if m:
        out["date"] = m.group(1)
    for line in txt.splitlines():
        line = line.strip()
        m = re.match(r"-\s*(.+?):\s*(.+)$", line)
        if not m:
            continue
        a, b = m.group(1).strip(), m.group(2).strip()
        if a.lower() == "weapons":
            out["caches"].append({"type": "Prototype Weapon Cache", "item": b})
        elif a.lower() == "gear":
            out["caches"].append({"type": "Prototype Gear Cache", "item": b})
        else:
            out["missions"].append({"mission": a, "loot": b})
    return out


def find_escalation_files():
    found = []
    for root, dirs, files in os.walk(OUT):
        dirs[:] = [d for d in dirs if d not in (".git", ".github", "node_modules")]
        if "escalation.json" in files:
            found.append(os.path.join(root, "escalation.json"))
    return found


def update_escalation():
    print("\n--- Butin d'Escalade (ProtoTrack) ---")
    files = find_escalation_files()
    old = {}
    if files:
        try:
            with open(files[0], encoding="utf-8") as f:
                old = json.load(f)
        except Exception:
            old = {}

    data = None
    try:
        r = session.get(PROTO_PAGE, timeout=30, params={"nocache": os.urandom(4).hex()})
        if r.status_code == 200:
            data = parse_proto_html(r.text)
    except Exception as e:
        print("ERREUR ProtoTrack (page) :", e)

    ok = bool(data) and len(data["missions"]) == 5 and all(m["loot"] for m in data["missions"]) \
        and len(data["caches"]) >= 2
    if not ok:
        print("Lecture de la page incomplète, plan B : fichier texte de ProtoTrack.")
        try:
            r = session.get(PROTO_TXT, timeout=30, params={"nocache": os.urandom(4).hex()})
            txt = parse_proto_txt(r.text) if r.status_code == 200 else None
        except Exception as e:
            print("ERREUR ProtoTrack (texte) :", e)
            txt = None
        if not txt or len(txt["missions"]) != 5:
            print("ProtoTrack injoignable : on garde l'ancien butin.")
            return
        old_by_mission = {m.get("mission"): m for m in old.get("missions", [])}
        old_by_type = {c.get("type"): c for c in old.get("caches", [])}
        missions = []
        for m in txt["missions"]:
            o = old_by_mission.get(m["mission"], {})
            same = o.get("loot") == m["loot"]
            missions.append({
                "mission": m["mission"],
                "faction": o.get("faction", ""),
                "factionIcon": o.get("factionIcon", ""),
                "loot": m["loot"],
                "lootIcon": o.get("lootIcon", "") if same else "",
                "appearances": o.get("appearances", 0) if same else 0,
                "last_seen_days": o.get("last_seen_days", 0) if same else 0,
            })
        caches = []
        for c in sorted(txt["caches"], key=lambda c: 0 if "Gear" in c["type"] else 1):
            o = old_by_type.get(c["type"], {})
            same = o.get("item") == c["item"]
            caches.append({
                "type": c["type"], "item": c["item"],
                "icon": o.get("icon", "") if same else "",
                "appearances": o.get("appearances", 0) if same else 0,
                "last_seen_days": o.get("last_seen_days", 0) if same else 0,
            })
        data = {"missions": missions, "caches": caches, "date": txt["date"], "week": None}

    # La date officielle du butin est celle du petit fichier texte (même règle que l'ancien fichier)
    try:
        r = session.get(PROTO_TXT, timeout=30, params={"nocache": os.urandom(4).hex()})
        m = re.search(r"Date:\s*(\d{4}-\d{2}-\d{2})", r.text) if r.status_code == 200 else None
        if m:
            data["date"] = m.group(1)
    except Exception:
        pass

    now = datetime.now(timezone.utc)
    day = data.get("date") or old.get("date") or now.strftime("%Y-%m-%d")
    week = data.get("week") or old.get("week")
    if not week or len(week) != 2:
        # La semaine d'Escalade va du mardi au lundi
        d = _date.fromisoformat(day)
        start = d - timedelta(days=(d.weekday() - 1) % 7)
        week = [start.isoformat(), (start + timedelta(days=6)).isoformat()]
    result = {
        "date": day,
        "week": week,
        "missions": data["missions"],
        "caches": data["caches"],
        "tracked_since": old.get("tracked_since", "2026-10-09"),
        "updated": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    if not files:
        files = [os.path.join(OUT, "data", "escalation.json")]
        print("Aucun escalation.json trouvé, création de", files[0])
    for path in files:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=1)
            f.write("\n")
        print("Butin écrit dans", path)
    for m in result["missions"]:
        print("  ", m["mission"], "->", m["loot"])


def update_calendar():
    """Copie les données du calendrier (événements automatiques + actualités) dans data/."""
    print("\n--- Calendrier (serveur du site) ---")
    try:
        r = session.get(WORKER_CALENDAR, timeout=30, params={"nocache": os.urandom(4).hex()})
        if r.status_code != 200:
            print("Serveur du calendrier injoignable (code", r.status_code, "), on garde les fichiers copiés.")
            return
        live = r.json()
    except Exception as e:
        print("ERREUR calendrier :", e)
        return

    os.makedirs(os.path.join(OUT, "data"), exist_ok=True)
    rows = live.get("auto_events") or []
    if rows:
        cols = ["season", "category", "name", "detail", "start", "end", "note", "url"]
        path = os.path.join(OUT, "data", "auto_events.csv")
        with open(path, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f, lineterminator="\n")
            w.writerow(cols)
            for row in rows:
                w.writerow([("" if row.get(c) is None else row.get(c)) for c in cols])
        print("Événements écrits :", len(rows), "->", path)
    news = live.get("news")
    if news:
        path = os.path.join(OUT, "data", "news.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(news, f, ensure_ascii=False, indent=1)
            f.write("\n")
        print("Actualités écrites ->", path)


def main():
    seen = set()
    external = set()
    saved = 0
    all_text = []

    # --- Étape 1 : pages, CSS, JS, images ---
    queue = [urljoin(BASE, p) for p in PAGES]
    while queue:
        url = queue.pop(0).split("#")[0].split("?")[0]
        if url in seen or "$" in url or "{" in url or "}" in url:
            continue
        seen.add(url)

        r = get(url)
        if r is None:
            continue
        save(url, r.content)
        saved += 1
        print("OK", url)

        ext = os.path.splitext(urlparse(url).path)[1].lower()
        if ext in TEXT_EXT:
            text = r.text
            all_text.append(text)
            if ext in (".js", ".mjs") and host in text:
                print("   (ce fichier contient l'adresse du site d'origine :", url, ")")
            for cand in HTML_RE.findall(text) + PATH_RE.findall(text):
                for base in (BASE, url):
                    full = urljoin(base, cand)
                    if urlparse(full).netloc == host:
                        queue.append(full)
            for u in URL_RE.findall(text):
                if urlparse(u).netloc != host and "w3.org" not in u:
                    external.add(u)

    # --- Étape 2 : fichiers de données CSV (calendrier, vendeurs...) ---
    guesses = set()
    for text in all_text:
        for name in CSV_RE.findall(text):
            CSV_NAMES.add(os.path.basename(name))
        for word in WORD_RE.findall(text):
            guesses.add(word.lower() + ".csv")

    candidates = []
    for name in sorted(CSV_NAMES | guesses):
        for folder in FOLDERS:
            url = BASE + folder + name
            if url not in seen:
                seen.add(url)
                candidates.append(url)

    print(f"\nRecherche des fichiers de données ({len(candidates)} essais)...")

    def try_url(url):
        return url, get(url)

    with ThreadPoolExecutor(max_workers=8) as pool:
        for url, r in pool.map(try_url, candidates):
            if r is not None:
                save(url, r.content)
                saved += 1
                print("OK", url)

    # Pour que GitHub Pages serve les fichiers tels quels
    with open(os.path.join(OUT, ".nojekyll"), "w") as f:
        f.write("")

    print(f"\nTerminé : {saved} fichiers sauvegardés dans le dossier « {OUT} ».")

    if external:
        print("\nAdresses externes trouvées (non sauvegardées) :")
        for u in sorted(external):
            print(" -", u)

    # Sécurité : si le téléchargement a échoué, on ne publie rien de cassé
    if saved < 10 or not os.path.exists(os.path.join(OUT, "data", "targets.csv")):
        print("\nERREUR : téléchargement incomplet (targets.csv introuvable ou trop peu de fichiers).")
        sys.exit(1)

    # --- Étape 3 : le butin vient de ProtoTrack, pas de la copie ---
    try:
        update_escalation()
    except Exception as e:
        print("ERREUR butin :", e)

    # --- Étape 4 : calendrier ---
    try:
        update_calendar()
    except Exception as e:
        print("ERREUR calendrier :", e)


# ---------------------------------------------------------------------------
#  Lancement : mise à jour, puis ouverture du site dans le navigateur
# ---------------------------------------------------------------------------
import functools
import http.server
import threading
import webbrowser


class SansCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


def demarrer_serveur(dossier):
    handler = functools.partial(SansCache, directory=dossier)
    for port in range(8000, 8020):
        try:
            serveur = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
            return serveur, port
        except OSError:
            continue
    raise RuntimeError("Aucun port libre entre 8000 et 8019.")


def lancer():
    os.makedirs(OUT, exist_ok=True)
    print("=== Mise à jour du site ===")
    try:
        main()
    except SystemExit:
        print("\nLa mise à jour est incomplète (internet coupé ?).")
    if not os.path.exists(os.path.join(OUT, "index.html")):
        print("Le site n'a pas pu être téléchargé. Vérifie ta connexion et relance.")
        return
    serveur, port = demarrer_serveur(OUT)
    adresse = f"http://localhost:{port}/index.html"
    print(f"\n=== Site prêt : {adresse} ===")
    print("Laisse cette fenêtre ouverte tant que tu utilises le site. Ctrl+C pour arrêter.")
    threading.Timer(1.0, lambda: webbrowser.open(adresse)).start()
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt du site.")
    finally:
        serveur.server_close()


if __name__ == "__main__":
    try:
        # Si on lance avec l'argument --headless (utilisé par GitHub Actions), on fait juste la mise à jour
        if len(sys.argv) > 1 and sys.argv[1] == "--headless":
            main()
        else:
            # En local, on garde ton comportement habituel avec le serveur et le navigateur
            lancer()
    except Exception as e:
        print("\nERREUR :", e)
        input("Appuie sur Entrée pour fermer...")
