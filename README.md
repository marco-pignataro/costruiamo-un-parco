# Costrui-AMO: un Parco!

Gestionale in pixel art per browser, realizzato per **Puli-AMO Messina**: una squadra di volontari trasforma un terreno abbandonato in un parco urbano, tra cantiere, pratiche e raccolte fondi.

Gioco gratuito. Per sostenere l'associazione: [puliamomessina.it/donazioni](https://www.puliamomessina.it/donazioni/) · 5x1000, codice fiscale 97124820834.

Il titolo è provvisorio: si cambia solo in `src/config.ts` (`GAME_TITLE`).

## Stato: prototipo 0.1

Il prototipo contiene il ciclo di base del turno settimanale:

- **Timer reali.** I compiti durano ore vere e vanno avanti anche a gioco chiuso; alla riapertura i resoconti arrivano in coda, in ordine.
- **Sessioni.** Parte burocratica da 20 ore e parte operativa (weekend) da 8 ore. Contano il tempo reale con almeno un compito in corso. Si chiudono da sole o a mano; chiudere prima la parte burocratica fa avanzare le attese delle pratiche.
- **Durate.** `durata = ore complessive / somma delle efficienze` (base 1, specialista 1,1, volontario guidato da uno specialista 2).
- **Pratiche a timer.** Richiesta che occupa il volontario, poi attesa in giorni lavorativi (4 ore di sessione ciascuno).
- **Monte ore settimanale** per volontario (6 / 10 / 14 ore).
- **Salvataggio** nel browser (IndexedDB), con esportazione in JSON.
- **Pixel art generata in codice** (`src/game/sprites.ts`): segnaposto finché non arriva quella definitiva da Aseprite.

## Sviluppo

Servono solo Node.js 22 e npm.

```bash
npm install
npm run dev      # gioco su http://localhost:5173
npm test         # test della simulazione
npm run build    # versione da pubblicare in dist/
```

Per provare senza aspettare ore vere, apri il gioco con `?velocita=60` (1 ora di gioco = 1 minuto) e avvia una **Nuova partita**. La velocità resta legata alla partita.

## Struttura

| Cartella | Contenuto |
| --- | --- |
| `src/config.ts` | Titolo, dati dell'associazione, ore di sessione, efficienze |
| `src/core/` | Simulazione in TypeScript puro, senza grafica: si testa da sola |
| `src/data/` | Contenuti in JSON: volontari, compiti, pratiche, squadra iniziale |
| `src/game/` | Scena Phaser e sprite |
| `src/ui/` | Pannello di gestione in HTML e finestre dei resoconti |
| `tests/` | Test Vitest della simulazione |

Per aggiungere compiti o pratiche basta modificare i file in `src/data/`.

## Pubblicazione

Ogni push su `main` esegue test e build e pubblica il gioco su GitHub Pages (`.github/workflows/deploy.yml`). Nel repository va attivato una volta: *Settings → Pages → Source: GitHub Actions*.

## Strumenti

Tutti gratuiti: Phaser 4, TypeScript, Vite, Vitest, idb-keyval, GitHub Pages.
