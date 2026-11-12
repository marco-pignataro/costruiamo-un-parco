# Costrui-AMO: un Parco! — istruzioni per Claude

Gestionale in pixel art per browser, realizzato per **Puli-AMO Messina** (ETS di rigenerazione urbana). Il giocatore guida una squadra di volontari dalla scelta di un terreno abbandonato all'inaugurazione di un parco.

- **Lingua:** si lavora in italiano con Marco (risposte concise e dirette). Interfaccia, testi di gioco, commenti e messaggi di commit in italiano.
- **Design completo:** [`docs/GDD.md`](docs/GDD.md). È la fonte di verità: leggilo prima di aggiungere meccaniche e aggiornalo nello stesso commit quando una decisione cambia.

## Vincoli che non cambiano

- **Zero euro di spesa.** Solo strumenti e servizi gratuiti (niente API a pagamento, niente servizi in abbonamento, niente generatori AI di immagini a pagamento).
- **Sito statico** su GitHub Pages: nessun server, nessun backend. Il repository deve restare pubblico (Pages gratuito).
- **Ambientazione:** Messina riconoscibile (Stretto, colline, torrenti, monumenti), ma **terreni, fatti ed enti sono di fantasia**. Nessun ente, ufficio o funzionario reale riconoscibile.
- **Titolo provvisorio** solo in `src/config.ts` (`GAME_TITLE`); l'HTML lo riceve dal plugin in `vite.config.ts`. Mai scriverlo altrove.
- **Donazioni:** solo link esterno a https://www.puliamomessina.it/donazioni/ e 5x1000 (CF 97124820834), in `ASSOCIATION` dentro `src/config.ts`. Il pulsante sta nel menu principale e nell'inaugurazione, mai durante il gioco. Nessun pagamento passa dal gioco.
- **Grafica:** la realizza Claude. Per ora sprite generati in codice (`src/game/sprites.ts`); personaggi e animazioni definitivi in Aseprite tramite server MCP (vedi sotto).

## Regole di gioco già decise (dettagli nel GDD)

- **Timer reali:** un compito da 5 ore dura 5 ore vere, anche a gioco chiuso. Alla riapertura `tick(now)` recupera tutto in ordine e i resoconti vanno in coda in una finestra modale.
- **Turno settimanale in-game:** parte burocratica = 20 ore di sessione; parte operativa (weekend) = 8 ore. Le ore di sessione sono tempo reale con almeno un compito in corso (compiti paralleli contano una volta). Si chiudono da sole o a mano.
- **Chiudere in anticipo la parte burocratica** fa passare i giorni rimanenti: le attese delle pratiche avanzano. Non esiste un modo di pagare per saltare le attese.
- **Durate:** `durata = ore complessive / Σ efficienze`; base 1, specialista con la skill richiesta 1,1, volontario senza skill affiancato da uno specialista 2 (massimo 2 guidati per specialista). Qualità alta se c'è almeno uno specialista.
- **Pratiche:** generate dal progetto e visibili da subito. Tipo 1 a timer: richiesta 1-2 ore che occupa il volontario, poi attesa in giorni lavorativi (1 giorno = 4 ore di sessione burocratica) con volontario libero. Tipo 2: richiesta diretta al dirigente con side-quest (mini-puzzle) o mini-dungeon (mini-platform), non a timer; occupa una giornata, cioè 4 ore di sessione e 4 ore del monte di chi la affronta.
- **Presidente** (uno solo): bonus nelle richieste dirette e nella fiducia degli uffici. **Segretario/a** (uno solo): registro delle pratiche, meno errori, avvisi anticipati sulle pratiche bloccanti.
- **Resoconto settimanale** a fine weekend (eventi, morale, bilancio), oltre ai resoconti dei singoli compiti.
- **Monte ore settimanale** unico per volontario: 6 base/studente, 10 mestieri, 14 ruoli organizzativi (presidente, segretario/a, coordinatore, esperto di carte, comunicatore).
- **Regola del prototipo:** un compito si avvia solo se finisce entro le ore residue della sessione e se ogni volontario ha abbastanza ore settimanali.

## Codice

| Percorso | Contenuto |
| --- | --- |
| `src/config.ts` | Titolo, associazione, ore di sessione, efficienze, ordini, lotti del piano, velocità di test |
| `src/core/` | Simulazione in TypeScript puro, senza Phaser né DOM: `simulation.ts`, `duration.ts`, `grid.ts` (griglia del parco, regole di posa, preventivo), `plan.ts` (piano di cantiere dal progetto), `migrate.ts` (salvataggi vecchi), `storage.ts`, `types.ts`, `content.ts` (con `validateContent`) |
| `src/data/*.json` | Contenuti: archetipi, compiti burocratici, pratiche, candidati reclutabili (`candidates.json`), elementi del parco, materiali, lavorazioni del terreno, terreni con progetto proposto (`sites.json`) |
| `src/game/` | `ParkScene.ts` (legge lo stato e disegna griglia, progetto e volontari; non decide nulla), `sprites.ts` (pixel art da griglie di caratteri) |
| `src/ui/hud.ts` | Pannello di gestione HTML e modale dei resoconti |
| `tests/` | Vitest sulla simulazione |
| `.github/workflows/deploy.yml` | Test + build + pubblicazione su Pages a ogni push su `main` |

**Convenzioni**

- La logica di gioco sta in `src/core/` ed è testabile senza browser; ogni nuova regola entra con un test in `tests/`.
- Tutto il tempo passa da `Simulation.tick(now)`; le azioni ricevono `now` dall'esterno (mai `Date.now()` dentro `core/`).
- I contenuti stanno nei JSON di `src/data/`, non nel codice.
- Lo stato salvato (`GameState`) è serializzabile in JSON. Se cambi la sua forma, aumenta `version` e gestisci la migrazione dei salvataggi esistenti.

**Comandi**

```bash
npm install
npm run dev      # http://localhost:5173 (in WSL2 si apre dal browser di Windows)
npm test
npm run build
```

Per provare senza aspettare: apri il gioco con `?velocita=60` (1 ora = 1 minuto) e avvia una **Nuova partita**.

## A che punto siamo (12/11/2026)

- **Fatto:** prototipo 0.1 con il ciclo del turno settimanale, pratiche a timer, monte ore, resoconti in coda, salvataggio IndexedDB, 17 test, pubblicazione automatica.
- **In corso:** prova di gioco di una settimana con Marco e alcuni soci (gate 1 della roadmap).
- **Fase 4, fatto:** griglia a livelli (superficie, rischi, progetto, realizzato), catalogo di 5 elementi, 8 materiali e 5 lavorazioni del terreno; il piano di cantiere nasce dal progetto (`generatePlan`) con dipendenze per tile, lotti da max 12 ore e pratiche solo se servono. Cassa, magazzino e ordini al fornitore: un lavoro parte solo con i materiali in magazzino. `GameState` è alla versione 3 (griglia, piano, cassa, magazzino, ordini) con migrazione a catena dei salvataggi v1 e v2. 
- **Fase 4, editor fatto:** si progetta partendo dal progetto proposto del terreno scelto; si posano e tolgono elementi sulla griglia (tasto destro = gomma) con preventivo live, gradimento previsto (`expectedAppeal`) e controlli; la conferma genera piano e pratiche e apre il cantiere.
- **Fase 1 e Fase 2 fatte:** la partita va terreno → squadra → progettazione → cantiere (`stage`). Tre terreni in `sites.json` (difficoltà 1, 2, 4) con cassa, PV, moltiplicatore, fattori (tipo di terra e sottosuolo "?" fino al sopralluogo) e bonus descritto; la squadra si recluta da 17 candidati spendendo i PV (presidente e segretario/a unici, minimo 3). `GameState` v5 con migrazione dalle versioni 1-4; 71 test. Fattori e bonus dei terreni e gli effetti di coordinatore, presidente e segretario/a sono ancora solo testo.
- **Ancora fuori dalla Fase 4:** mappa dei rischi sovrapposta (arriva con il sopralluogo), regola di accessibilità, varianti in corso d'opera; ritardi casuali delle consegne, capienza del magazzino, altre fonti di materiali (recupero, donazioni, scambi); la raccolta fondi non porta ancora soldi.
- **Prossimo blocco:** sopralluogo con insidie (Fase 3) → poi una side-quest a mini-puzzle, una raccolta fondi, inaugurazione e punteggio → MVP.

## Pixel art: Aseprite + server MCP in WSL2

Si fa una volta sola sul computer di Marco. Strada consigliata: **Aseprite compilato dentro WSL2** (le finestre grafiche funzionano con WSLg di Windows 11), così server MCP e Aseprite vedono gli stessi percorsi Linux.

1. Compilare Aseprite seguendo `INSTALL.md` del [repository ufficiale](https://github.com/aseprite/aseprite) (sezione Linux: CMake, Ninja, compilatore, librerie X11 e la Skia precompilata indicata lì). La licenza permette di compilarlo gratis per uso proprio; non si può ridistribuire il binario.
2. Clonare [aseprite-mcp](https://github.com/diivi/aseprite-mcp) (licenza MIT; richiede Python 3.13+ e `uv`) e impostare `ASEPRITE_PATH` nel suo `.env` con il percorso dell'eseguibile compilato.
3. Registrarlo in Claude Code, ad esempio: `claude mcp add aseprite -- uv --directory /percorso/aseprite-mcp run -m aseprite_mcp` (verificare il comando esatto nel README del server).
4. Gli sprite si esportano come PNG e sprite sheet JSON in `public/assets/` e si caricano in Phaser al posto di quelli generati in `sprites.ts`.

Alternativa: compilare Aseprite su Windows (Visual Studio Community) e puntare `ASEPRITE_PATH` a `/mnt/c/...`. È più fragile, perché l'eseguibile Windows non capisce i percorsi Linux che il server MCP gli passa.

Palette e stile: vedi "Direzione artistica e audio" nel GDD (384×216, tile 16×16, personaggi 16×24, circa 32 colori ispirati a Messina).
