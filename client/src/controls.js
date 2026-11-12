export const keys = {
  forward: false,
  back: false,
  left: false,
  right: false,
  handbrake: false,
  reset: false,
};

const keyMap = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake',
  KeyR: 'reset',
};

window.addEventListener('keydown', (e) => {
  if (keyMap[e.code]) {
    keys[keyMap[e.code]] = true;
    e.preventDefault();
  }
});

window.addEventListener('keyup', (e) => {
  if (keyMap[e.code]) keys[keyMap[e.code]] = false;
});