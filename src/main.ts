import * as Phaser from 'phaser';
import { GAME_TITLE, readTimeScale } from './config';
import { defaultContent } from './core/content';
import { migrate } from './core/migrate';
import { Simulation } from './core/simulation';
import { browserStore, exportSave } from './core/storage';
import { NO_INSETS, type View } from './game/camera';
import { ParkScene, type EditorTool } from './game/ParkScene';
import type { Kind } from './ui/activities';
import { Hud } from './ui/hud';
import './style.css';

async function boot() {
  const saved = await browserStore.load();
  let sim = saved ? new Simulation(migrate(saved, defaultContent), defaultContent) : Simulation.newGame(defaultContent, Date.now(), readTimeScale());
  // Recupero di quello che è successo a gioco chiuso: i resoconti finiscono in coda.
  sim.tick(Date.now());

  const save = () => void browserStore.save(sim.state);
  let notified = sim.state.reports.length;
  const editor: EditorTool = { tool: null };
  const view: View = { camera: null, insets: NO_INSETS };
  // Solo in sviluppo: le prove automatiche nel browser leggono la telecamera da qui.
  if (import.meta.env.DEV) Object.assign(window, { __view: view });

  const hud = new Hud(document.getElementById('hud')!, document.getElementById('dialog')!, document.getElementById('modal')!, () => sim, {
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
    onZoom: () => view.camera?.toggleZoom(),
    isZoomed: () => view.camera?.isZoomed ?? false,
    onInsets: (insets) => {
      view.insets = insets;
      view.camera?.setInsets(insets);
    },
  }, editor);

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    pixelArt: true,
    backgroundColor: '#1b1b1b',
    title: GAME_TITLE,
    // La tela riempie il riquadro di gioco; la scena sceglie lo zoom (visuale intera o ingrandimento).
    scale: { mode: Phaser.Scale.RESIZE },
    scene: [],
    callbacks: {
      postBoot: (game) =>
        game.scene.add('park', ParkScene, true, {
          sim: () => sim,
          editor,
          view,
          onEdit: () => {
            save();
            hud.render();
          },
          onOpenActivity: (kind: Kind, id: string, volunteerIds: string[]) => hud.openActivity(kind, id, volunteerIds),
        }),
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
