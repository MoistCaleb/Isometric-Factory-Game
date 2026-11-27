import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { Game } from './game';
import { startRenderer } from './render/scene';
import { App } from './ui/App';

registerSW({ immediate: true });
startRenderer(document.getElementById('scene') as HTMLCanvasElement);
const game = new Game();
render(<App game={game} />, document.getElementById('ui')!);
void game.boot();
