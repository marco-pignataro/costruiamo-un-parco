# Note dalle prove di gioco

Annota qui quello che riscontri giocando. Una riga per voce, con la data e, se serve, dove succede (scena, fase, schermata).
Quando una voce è risolta, spostala in fondo sotto "Risolte" con il commit che la chiude.

Formato suggerito: `- [ ] 13/11 — Città, parte burocratica: descrizione breve`

## Bug

- [ ] 

## Modifiche

Cose che esistono ma vanno cambiate (bilanciamento, testi, comportamento).

- [ ] 

## Migliorie

Cose che funzionano ma si possono rendere più comode, chiare o belle.

- [ ] 

## Aggiunte

Funzioni o contenuti nuovi.

- [ ] 

## Risolte

Editor del parco (19/11), commit: 1b49040.

- [x] Le aiuole devono essere da una sola tile.
- [x] Gli alberi del parco si devono poter spostare (ma non rimuovere)
- [x] Vialetti, aiuole e staccionata devono essere modulari: ovvero si devono poter posizionare più tiles in una volta cliccando sulla prima e trascinando il mouse cliccato su altre caselle. Per quanto riguarda la staccionata, inoltre, quando ci sono tiles di staccionata vicine, la staccionata dev'essere contigua, serve quindi fare le sprite della staccionata nelle direzioni N-S e E-O e i vari tipi di incroci e angoli.

Progettazione e sopralluogo (18/11), commit: c938533.

- [x] In fase sopralluogo il tasto "Chiudi il sopralluogo" è ancora nell tab "Squadra". Non ha senso, va dentro Attività.
- [x] In fase di progettazione, metti una barra scorrevole di card come quelle dei volontari, ma in queste mettici gli arredi, solo con nome e prezzo, e gli altri dettagli si vedono in modale cliccando sulla card selezionata.
- [x] Sempre in fase progettazione, lo specchietto contenente cassa e preventivo e quello contenente il tasto "conferma progetto" mettili in tab Preventivo, non Arredi.

Terza prova, griglia dei candidati (18/11), commit: 96fbd50.

- [x] In fase di selezione volontari la griglia cambia in continuazione man mano che li seleziono. Non va bene, deve avere numero di colonne fisso. E nel mobile massimo due colonne se no esce fuori dallo schermo e diventa inutilizzabile.

Terza prova (18/11), commit: 1a7f3cd.

- [x] nel mobile la riga con le card dei volontari non scorre, e l'HUD superiore esce dallo schermo, o forse l'HUD in generale, non so, verifica tu.
- [x] Nel mobile, nella barra con le card dei volontari, rimuovi la card "speciale" col volontario selezionato, distinguiamo semplicemente la card del volontario selezionato con un bordo colorato.
- [x] Quando si passa da una fase all'altra, o da weekend a infrasettimanale, e viceversa, c'è di default sempre aperta l'ultima tab aperta. Non mi piace, non ci dev'essere niente aperto all'inizio di ogni nuova fase.
- [x] Nella fase di selezione terreno, rendi tutta la card del terreno cliccabile (per visualizzarlo), mentre il tasto resta per sceglierlo.
- [x] Nel mobile, sotto ogni tab scriviamo l'info più importante di quella tab in breve. In particolare: sotto "squadra" metti i PV (punti volontario) disponibili (Es.: "3 PV"); sotto "attività" metti le attività in corso su quelle totali fattibili (Es.: "3/10"); sotto "inventario" metti il totale in cassa (Es.: "392€"); sotto "Settimane" metti la percentuale di completamento (Es.: "30%") e rinomina la tab in "Progresso".

Seconda prova (18/11), commit: 0832479.

- [x] Le modali nel mobile riportano troppo spesso lo scroll in alto, è fastidioso.
- [x] Ora che c'è la timeline del tempo, i tasti "Chiudi weekend/chiudi e vai al weekend" e "Taglia il nastro", e la percentuale di progetto realizzato vanno spostati nella timeline delle settimane.
- [x] Icon tab "Inventario" nel mobile (e specchietto nel desktop, in fondo alla colonna sinistra) con il totale in cassa, i materiali in magazzino e quelli ordinati ma non ancora consegnati.

Data di consegna e timeline (18/11), commit: 43c1f26.

- [x] Ogni partita ha una data di consegna calcolata dal terreno e dagli arredi del progetto: determina le settimane di lavoro disponibili, sempre consultabili.
- [x] Timeline delle settimane: su desktop orizzontale in alto al centro (settimana in corso, precedente e successiva; un clic per scorrerle tutte); su mobile una scheda nella barra in basso, in verticale, centrata sulla settimana in corso.

Prima della prova esterna (18/11), commit: 43c1f26.

- [x] Pannello di benvenuto che introduce e spiega brevemente il gioco, e chiede se si vuole il tutorial o meno.
- [x] Pannello "Tutorial" a ogni passaggio; nelle parti infrasettimanale e weekend solo la prima settimana.
- [x] Nel sopralluogo le possibili insidie non appaiono già segnate: appaiono solo se un volontario ci passa vicino, e si chiede se approfondire o lasciar perdere.

Commit: 8775f4e (prima prova del 13/11).

- [x] In fase di progettazione si può confermare il progetto e aprire il cantiere anche se il preventivo supera la cassa: i fondi mancanti si recuperano durante il gioco.
- [x] In fase di progettazione il menu degli arredi del parco si chiama "Squadra" e il menu del preventivo "Attività", mentre dovrebbero essere rispettivamente "Arredi" e "Preventivo".
- [x] In fase di progettazione, se non ho nulla selezionato e clicco su un arredo già posizionato deve selezionarlo e permettermi di riposizionarlo altrove
- [x] Tutti i volontari in modalità weekend hanno la stessa maglietta blu con scritte bianche sulla schiena e logo bianco sul petto lato cuore.
- [x] Se volontario selezionato e nuovamente cliccato, si apre modale centrale con: immagine del volontario nella metà sinistra della modale e statistiche (età, morale, stanchezza) e caratteristiche (nome, colore pelle, colore capelli) sulla destra. Le caratteristiche sono modificabili in fase di reclutamento.
- [x] HUD:
        Desktop: Menu in basso a sinistra, Ingrandisci in basso a destra, tasto di completamento fase deve andare semmpre sotto alla colonna sinistra, riquadro "In cassa / Preventivo" deve andare in fondo alla colonna sinistra. Le attività in corso devono andare in alto nella colonna delle attività, prima di quelle "Da fare".
        Mobile: Barra di Icon Tabs in basso, le tabs sono: menu, Squadra(o nome della colonna che in desktop sta a sinistra), Attività(o nome della colonna che in desktop sta a destra) e i contenuti si devono aprire ovviamente a tutto schermo slide-ando dal basso. Tasto zoom +/- in alto a destra.
        Entrambi: La barra di completamento della sessione non c'è bisogno che stia in uno specchietto a parte, può stare come ultimo elemento nello specchietto con titolo del gioco, settimana e parte della settimana, non c'è bisogno neanche della label "Sessione".
