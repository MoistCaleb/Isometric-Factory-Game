import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { Game } from './game';
import { Renderer } from './render/renderer';
import { App } from './ui/App';

registerSW({ immediate: true });
const game = new Game();
const renderer = new Renderer(document.getElementById('scene') as HTMLCanvasElement, game.sim);
game.onWorld = (s) => renderer.setWorld(s);
render(<App game={game} renderer={renderer} />, document.getElementById('ui')!);
void game.boot();
