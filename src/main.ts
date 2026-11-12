import * as Phaser from 'phaser';
import { GAME_TITLE, readTimeScale } from './config';
import { defaultContent } from './core/content';
import { Simulation } from './core/simulation';
import { browserStore, exportSave } from './core/storage';
import { ParkScene, VIEW } from './game/ParkScene';
import { Hud } from './ui/hud';
import './style.css';

async function boot() {
  const saved = await browserStore.load();
  let sim = saved ? new Simulation(saved, defaultContent) : Simulation.newGame(defaultContent, Date.now(), readTimeScale());
  // Recupero di quello che è successo a gioco chiuso: i resoconti finiscono in coda.
  sim.tick(Date.now());

  const save = () => void browserStore.save(sim.state);
  let notified = sim.state.reports.length;

  const hud = new Hud(document.getElementById('hud')!, document.getElementById('modal')!, () => sim, {
    onChange: save,
    onNewGame: async () => {
      await browserStore.clear();
      sim = Simulation.newGame(defaultContent, Date.now(), readTimeScale());
      await browserStore.save(sim.state);
      location.reload();
    },
    onExport: () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(exportSave(sim.state));
      a.download = 'costruiamo-un-parco-salvataggio.json';
      a.click();
    },
  });

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: VIEW.width,
    height: VIEW.height,
    pixelArt: true,
    backgroundColor: '#1b1b1b',
    title: GAME_TITLE,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [],
    callbacks: {
      postBoot: (game) => game.scene.add('park', ParkScene, true, { sim: () => sim }),
    },
  });

  const loop = () => {
    sim.tick(Date.now());
    const total = sim.state.reports.length;
    if (total > notified && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      const last = sim.state.reports[total - 1];
      new Notification(GAME_TITLE, { body: last.title });
    }
    notified = total;
    hud.render();
  };
  loop();
  setInterval(loop, 1000);
  setInterval(save, 10_000);
  document.addEventListener('visibilitychange', () => (document.hidden ? save() : loop()));
  save();
}

void boot();
