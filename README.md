# Liste 40k – Datasheet offline

PWA statica (HTML + CSS + JS vanilla, **nessun build step**) che, da una lista d'armata
Warhammer 40.000 esportata da **New Recruit**, raggruppa le unità e mostra la datasheet di ciascuna.
Funziona offline e si installa sull'iPhone con "Aggiungi alla schermata Home".

> Progetto non ufficiale per uso personale. Nel repository **non c'è nessun testo-regole di Games Workshop**:
> i dati delle datasheet li inserisci tu in `data/datasheets.json`. Per ogni unità c'è il bottone
> "Apri su Wahapedia" come riferimento.

## Struttura

```
index.html              app (una sola pagina, routing con #hash)
css/style.css           stile, tema chiaro/scuro, safe-area iPhone
js/parser.js            parser della lista (funziona nel browser e in Node)
js/app.js               interfaccia, liste salvate (localStorage), datasheet
manifest.json           manifest PWA (standalone, icone, colori)
service-worker.js       cache offline (app shell + dati)
data/datasheets.json    le tue datasheet (modello dati sotto)
data/esempio-fittizio.txt  lista FITTIZIA per vedere una scheda compilata
icons/                  icone (SVG + PNG, apple-touch-icon 180×180)
tools/seed.js           aggiunge a datasheets.json le unità mancanti di una lista
tests/                  test del parser (node --test) + la lista Black Templars di prova
```

## Uso

1. **Liste** – incolla il testo della lista (oppure "Importa .txt") e premi *Analizza e salva*.
   La lista resta salvata sul dispositivo; puoi tenerne quante vuoi ed eliminarle.
2. **Armata** – intestazione (punti, fazione, distaccamenti, dimensione partita), poi
   *Attached units* (ogni gruppo leader + bodyguard) e *Other datasheets*, con punti e n° modelli.
   Il campo di ricerca filtra per nome, arma, enhancement, ruolo e keyword.
   Il pallino verde indica che la datasheet è compilata.
3. **Datasheet** – statline (M T Sv W Ld OC + invulnerabile), tabelle Ranged e Melee
   (le armi equipaggiate sono evidenziate con la quantità), Abilities, equipaggiamento dalla
   lista, Keywords, Faction keywords, punti, unità aggregate e bottone "Apri su Wahapedia".

Il tasto in alto a destra alterna il tema: automatico → chiaro → scuro.

### Formato lista supportato (New Recruit)

```
Templari (1.995 Points)              ← nome armata e punti (riga 1)
Space Marines                        ← fazione
Black Templars                       ← sotto-fazione
Marshal's Household … (3 Detachment Points)   ← distaccamento/i
Purge the Foe                        ← altre righe d'intestazione (mostrate come etichette)
Strike Force (2.000 Points)          ← dimensione partita
ATTACHED UNITS / Attached unit N / OTHER DATASHEETS
Nome Unità (125 Points)
  • Attached as: Leader (Character)
  • Enhancements: Nome (Upgrade)
  • Warlord
  • 10x Modello
     ◦ 4x Arma
```

È accettato anche il formato compatto `Space Marines – Black Templars` /
`Purge the Foe – Strike Force (2.000 Points)`. Il parser tollera tab, CRLF, spazi multipli,
`pts` al posto di `Points`, e `-`/`*` come punti elenco. Gli altri titoli in MAIUSCOLO
(es. `CHARACTERS`) diventano sezioni. Le righe non riconosciute generano un avviso con il
numero di riga, senza bloccare il resto. Il n° di modelli è la somma dei punti `•` che hanno
sotto-punti `◦` (i profili dei modelli); se non ce ne sono, è 1.

## Pubblicare su GitHub Pages

1. Fai il push del repository su GitHub.
2. **Settings → Pages → Build and deployment**: *Source* = "Deploy from a branch",
   branch `main` (o quello che usi), cartella `/ (root)` → **Save**.
3. Dopo un minuto l'app è su `https://<utente>.github.io/<repo>/`.

Tutti i percorsi sono relativi, quindi funziona anche in una sottocartella e su qualsiasi
host statico (Netlify, Cloudflare Pages, un server qualunque). Il service worker richiede
HTTPS (oppure `localhost`). Il file `.nojekyll` evita l'elaborazione Jekyll.

Prova in locale:

```sh
python3 -m http.server 8000      # poi apri http://localhost:8000
```

## Installare sull'iPhone

1. Apri l'indirizzo GitHub Pages con **Safari**.
2. Tocca **Condividi** (quadrato con la freccia) → **Aggiungi alla schermata Home** → **Aggiungi**.
3. Apri l'app dall'icona: si avvia a schermo intero. Dopo la prima apertura online
   funziona anche **offline**.

Le liste salvate restano nella memoria dell'app sul telefono (localStorage). Se cancelli i dati
di Safari o rimuovi l'app, le liste salvate vengono perse: tieni una copia dei .txt.

## Aggiornare i dati (`data/datasheets.json`)

```json
{
  "meta": { "edition": "11", "version": "2026-11-17",
            "wahapediaSearchUrl": "https://www.google.com/search?q=site%3Awahapedia.ru+%22{q}%22" },
  "units": {
    "Crusader Squad": {
      "name": "Crusader Squad",
      "aliases": [],
      "fromList": { "points": [{ "models": 20, "points": 305 }], "wargear": ["Bolt Pistol", "…"] },
      "statline": { "M": "", "T": "", "Sv": "", "Inv": "", "W": "", "Ld": "", "OC": "" },
      "ranged": [ { "name": "", "Range": "", "A": "", "BS": "", "S": "", "AP": "", "D": "", "note": "" } ],
      "melee":  [ { "name": "", "A": "", "WS": "", "S": "", "AP": "", "D": "", "note": "" } ],
      "abilities": { "core": [], "faction": [], "uniche": [ { "name": "", "text": "" } ] },
      "keywords": [],
      "faction_keywords": [],
      "wahapediaUrl": ""
    }
  }
}
```

- La chiave è il nome dell'unità come appare nella lista. Il confronto ignora maiuscole,
  accenti, apostrofi tipografici e spazi doppi; per nomi diversi usa `aliases`.
- `statline` può essere un oggetto o un **array** di profili `{ "name": "Neophyte", "M": … }`
  per unità con modelli diversi.
- `abilities.*` accetta oggetti `{ name, text }` o semplici stringhe.
- Il nome di un'arma in `ranged`/`melee` viene confrontato con l'equipaggiamento della lista per
  evidenziarla (anche per prefisso, es. "Plasma Pistol – supercharge").
- Se `wahapediaUrl` è vuoto, il bottone apre una ricerca di quel nome sul sito Wahapedia
  (modello configurabile in `meta.wahapediaSearchUrl`, `{q}` = nome unità).
- Le voci con `"_esempio": true` sono **fittizie**. Puoi cancellarle quando non ti servono più
  (e togliere `data/esempio-fittizio.txt`).
- I punti mostrati vengono sempre dalla lista; `fromList` è solo un promemoria.

**Aggiungere le unità di una nuova lista** (crea voci vuote, non tocca quelle esistenti):

```sh
node tools/seed.js mia-lista.txt
```

Dopo aver modificato i dati fai commit e push: il service worker scarica il nuovo
`datasheets.json` alla prima apertura online (strategia network-first per `data/`).
Se modifichi HTML, CSS o JS, incrementa `CACHE_VERSION` in `service-worker.js` così
l'iPhone riceve la nuova versione dell'app (a volte servono due aperture).

## Test

```sh
node --test
```

I test usano la lista Black Templars in `tests/fixtures/templari.txt`: intestazione,
3 gruppi leader+bodyguard, 5 other datasheets, quantità del wargear, n° modelli, punti totali
(1.995) e robustezza a formattazioni diverse.
