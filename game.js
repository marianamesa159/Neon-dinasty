'use strict';

/* =========================================================
   NEON DYNASTY: FURIA ARCADE
   Motor de juego de peleas 2D — HTML5 Canvas + JS puro
   ========================================================= */

/* ---------- CONFIG GLOBAL ---------- */
const CANVAS_W = 960;
const CANVAS_H = 540;
const GROUND_Y = 430;
const GRAVITY = 0.62;
const JUMP_VELOCITY = -13.2;
const ARENA_LEFT = 60;
const ARENA_RIGHT = 900;
const ROUND_TIME = 60;
const ROUNDS_TO_WIN = 2;
const COMBO_WINDOW_MS = 900;

/* ---------- PERSONAJES ORIGINALES ---------- */
const CHARACTERS = [
  {
    id: 0, name: 'KAIRO BLAZE', color: '#ff4d4d', accent: '#ffae00', skin: '#e8b48a',
    speed: 3.3, power: 1.0, defense: 1.0, special: 'projectile', specialName: 'ONDA ÍGNEA',
    desc: 'Luchador equilibrado. Su onda ígnea golpea a distancia.'
  },
  {
    id: 1, name: 'YUNA STORM', color: '#4dc3ff', accent: '#eafcff', skin: '#f0c9a0',
    speed: 4.1, power: 0.85, defense: 0.9, special: 'dash', specialName: 'RÁFAGA VELOZ',
    desc: 'Veloz y ágil. Arrolla al rival con un avance fulminante.'
  },
  {
    id: 2, name: 'BRUTUS IRON', color: '#9a9a9a', accent: '#ffcc00', skin: '#caa06a',
    speed: 2.5, power: 1.35, defense: 1.3, special: 'charge', specialName: 'PUÑO SÍSMICO',
    desc: 'Lento pero devastador. Su golpe cargado sacude la arena.'
  },
  {
    id: 3, name: 'SAKI VENOM', color: '#b34dff', accent: '#c8ffb0', skin: '#e0b8d8',
    speed: 3.2, power: 0.95, defense: 0.95, special: 'area', specialName: 'CÍRCULO TÓXICO',
    desc: 'Impredecible. Libera energía tóxica a su alrededor.'
  }
];

const STAGES = [
  { id: 0, name: 'CALLE NOCTURNA', skyTop: '#0a0a22', skyBottom: '#1c1c3c', ground: '#141422', build: '#10101f', accent: '#2a2a55' },
  { id: 1, name: 'DOJO ABANDONADO', skyTop: '#1c130a', skyBottom: '#332310', ground: '#241a10', build: '#2c1e10', accent: '#4a3018' }
];

/* ---------- ATAQUES BÁSICOS ---------- */
const ATTACKS = {
  light:  { dmg: 6,  range: 60, duration: 260, activeStart: 70,  activeEnd: 150, cooldown: 260, knockback: 4,  vy: 0 },
  heavy:  { dmg: 13, range: 70, duration: 430, activeStart: 150, activeEnd: 260, cooldown: 480, knockback: 9,  vy: 0 },
  kick:   { dmg: 9,  range: 78, duration: 360, activeStart: 120, activeEnd: 220, cooldown: 380, knockback: 6.5,vy: 0 }
};

/* ---------- AUDIO (Web Audio API, sin archivos externos) ---------- */
const AudioSys = {
  ctx: null,
  enabled: false,
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.enabled = true;
    } catch (e) { this.enabled = false; }
  },
  tone(freq, dur, type, vol, sweepTo) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), ctx.currentTime + dur / 1000);
    gain.gain.setValueAtTime(vol || 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur / 1000);
  },
  hitLight() { this.tone(260, 90, 'square', 0.18); },
  hitHeavy() { this.tone(140, 160, 'sawtooth', 0.22); },
  hitKick() { this.tone(190, 120, 'triangle', 0.2); },
  special() { this.tone(500, 300, 'sawtooth', 0.2, 90); },
  block() { this.tone(700, 70, 'square', 0.12); },
  jump() { this.tone(400, 90, 'sine', 0.12, 700); },
  hurt() { this.tone(120, 130, 'square', 0.18, 60); },
  ko() { this.tone(300, 600, 'sawtooth', 0.22, 40); },
  select() { this.tone(600, 70, 'square', 0.1); },
  fight() { this.tone(220, 250, 'square', 0.2, 660); }
};

/* ---------- ESTADO DEL JUEGO ---------- */
const GameState = {
  MENU: 'MENU', CONTROLS: 'CONTROLS', INFO: 'INFO', CHARACTER_SELECT: 'CHARACTER_SELECT',
  ROUND_START: 'ROUND_START', FIGHTING: 'FIGHTING', ROUND_END: 'ROUND_END',
  MATCH_END: 'MATCH_END', PAUSED: 'PAUSED'
};

let game = {
  state: GameState.MENU,
  prevState: GameState.MENU,
  stageIndex: 0,
  playerCharIndex: null,
  playerRounds: 0,
  aiRounds: 0,
  round: 1,
  roundTimeMs: ROUND_TIME * 1000,
  countdown: 0,
  countdownStep: 0,
  bannerText: '',
  bannerTimer: 0,
  screenShake: 0,
  comboTextP: { text: '', timer: 0 },
  comboTextA: { text: '', timer: 0 }
};

let player = null;
let enemy = null;
let projectiles = [];
let particles = [];

/* ---------- CANVAS ---------- */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

/* ---------- INPUT ---------- */
const keys = {};
const justPressed = {};
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (!keys[k]) justPressed[k] = true;
  keys[k] = true;
  if (['a', 'd', 'w', 's', 'j', 'k', 'l', 'u', 'i', 'escape'].includes(k)) e.preventDefault();
  if (k === 'escape') handlePauseToggle();
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  keys[k] = false;
  jp[k] = false;
});

function handlePauseToggle() {
  if (game.state === GameState.FIGHTING) {
    game.prevState = GameState.FIGHTING;
    game.state = GameState.PAUSED;
    showScreen('screen-pause');
  } else if (game.state === GameState.PAUSED) {
    game.state = GameState.FIGHTING;
    hideScreen('screen-pause');
  }
}

/* ---------- FIGHTER CLASS ---------- */
class Fighter {
  constructor(charData, x, facing, isPlayer) {
    this.charData = charData;
    this.name = charData.name;
    this.color = charData.color;
    this.accent = charData.accent;
    this.skin = charData.skin;
    this.special = charData.special;
    this.isPlayer = isPlayer;
    this.speed = charData.speed;
    this.power = charData.power;
    this.defense = charData.defense;

    this.x = x;
    this.y = GROUND_Y;
    this.w = 46;
    this.h = 104;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.onGround = true;
    this.crouching = false;
    this.blocking = false;

    this.maxHealth = 100;
    this.health = 100;

    this.state = 'idle';
    this.walkCycle = 0;

    this.activeAttack = null;   // {type, config, elapsed, hasHit}
    this.attackCooldown = 0;
    this.specialCooldown = 0;
    this.hurtTimer = 0;
    this.knockedOut = false;
    this.won = false;

    this.comboCount = 0;
    this.lastHitLandedAt = -99999;

    this.hitFlash = 0;
    this.chargeGlow = 0;
  }

  get centerX() { return this.x; }
  get top() { return this.y - (this.crouching ? this.h * 0.62 : this.h); }
  get hurtboxRect() {
    const height = this.crouching ? this.h * 0.62 : this.h;
    return { x: this.x - this.w / 2, y: this.y - height, w: this.w, h: height };
  }

  canAct() {
    return !this.knockedOut && this.state !== 'hurt' && !this.activeAttack;
  }

  startAttack(type) {
    if (!this.canAct() || this.blocking || !this.onGround) return;
    this.vx = 0;
    if (type === 'special') {
      if (this.specialCooldown > 0) return;
      const cfg = getSpecialConfig(this);
      this.activeAttack = { type: 'special', config: cfg, elapsed: 0, hasHit: false };
      this.specialCooldown = cfg.cooldown;
      this.state = 'special';
      AudioSys.special();
    } else {
      if (this.attackCooldown > 0) return;
      const cfg = ATTACKS[type];
      this.activeAttack = { type, config: cfg, elapsed: 0, hasHit: false };
      this.attackCooldown = cfg.cooldown;
      this.state = type === 'heavy' ? 'heavyAttack' : (type === 'kick' ? 'kickAttack' : 'attack');
    }
  }

  takeHit(dmg, knockback, attackerFacing, isSpecial) {
    if (this.knockedOut) return;
    let finalDmg = dmg;
    let finalKb = knockback;
    if (this.blocking) {
      finalDmg = dmg * 0.18;
      finalKb = knockback * 0.35;
      AudioSys.block();
      this.state = 'block';
    } else {
      finalDmg = dmg / Math.max(0.6, this.defense);
      this.state = 'hurt';
      this.hurtTimer = isSpecial ? 420 : 260;
      this.hitFlash = 180;
      if (isSpecial) AudioSys.hurt(); else (dmg > 10 ? AudioSys.hitHeavy() : AudioSys.hitLight());
    }
    this.health = Math.max(0, this.health - finalDmg);
    this.vx = attackerFacing * finalKb;
    if (!this.onGround) this.vy = Math.min(this.vy, -2);
    if (this.health <= 0) {
      this.knockedOut = true;
      this.state = 'knockout';
      AudioSys.ko();
      game.screenShake = 18;
    } else if (!this.blocking) {
      game.screenShake = Math.max(game.screenShake, dmg > 10 ? 9 : 4);
    }
  }
}

function getSpecialConfig(f) {
  switch (f.special) {
    case 'projectile':
      return { dmg: 16, duration: 520, activeStart: 180, activeEnd: 520, cooldown: 1700, knockback: 6, kind: 'projectile' };
    case 'dash':
      return { dmg: 15, duration: 430, activeStart: 90, activeEnd: 300, cooldown: 1500, knockback: 10, kind: 'dash' };
    case 'charge':
      return { dmg: 21, duration: 620, activeStart: 380, activeEnd: 520, cooldown: 2100, knockback: 15, kind: 'charge', range: 95 };
    case 'area':
      return { dmg: 15, duration: 400, activeStart: 140, activeEnd: 300, cooldown: 1800, knockback: 8, kind: 'area', radius: 95 };
    default:
      return { dmg: 14, duration: 400, activeStart: 120, activeEnd: 260, cooldown: 1600, knockback: 8, kind: 'dash' };
  }
}

/* ---------- DOM: PANTALLAS ---------- */
function showScreen(id) { document.getElementById(id).classList.remove('hidden'); }
function hideScreen(id) { document.getElementById(id).classList.add('hidden'); }
function hideAllScreens() {
  ['screen-menu', 'screen-controls', 'screen-info', 'screen-select', 'screen-pause', 'screen-roundend', 'screen-matchend']
    .forEach(hideScreen);
}

document.getElementById('btn-play').addEventListener('click', () => {
  AudioSys.init();
  AudioSys.select();
  hideAllScreens();
  game.state = GameState.CHARACTER_SELECT;
  showScreen('screen-select');
});
document.getElementById('btn-controls').addEventListener('click', () => {
  AudioSys.init(); AudioSys.select();
  hideAllScreens(); game.state = GameState.CONTROLS; showScreen('screen-controls');
});
document.getElementById('btn-info').addEventListener('click', () => {
  AudioSys.init(); AudioSys.select();
  hideAllScreens(); game.state = GameState.INFO; showScreen('screen-info');
});
document.querySelectorAll('[data-back]').forEach(btn => {
  btn.addEventListener('click', () => {
    AudioSys.select();
    hideAllScreens();
    game.state = GameState.MENU;
    showScreen('screen-menu');
  });
});

/* Selección de personaje */
const charGrid = document.getElementById('char-grid');
const charDetail = document.getElementById('char-detail');
const startFightBtn = document.getElementById('btn-start-fight');

CHARACTERS.forEach((c, idx) => {
  const card = document.createElement('div');
  card.className = 'char-card';
  card.dataset.idx = idx;
  card.innerHTML = `<div class="swatch" style="background:${c.color}"></div><div class="cname">${c.name}</div>`;
  card.addEventListener('click', () => {
    AudioSys.select();
    document.querySelectorAll('.char-card').forEach(el => el.classList.remove('selected'));
    card.classList.add('selected');
    game.playerCharIndex = idx;
    charDetail.textContent = `${c.name} — ${c.desc} Especial: ${c.specialName}`;
    startFightBtn.disabled = false;
  });
  charGrid.appendChild(card);
});

document.querySelectorAll('.stage-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    AudioSys.select();
    document.querySelectorAll('.stage-btn').forEach(b => b.classList.remove('selected-stage'));
    btn.classList.add('selected-stage');
    game.stageIndex = parseInt(btn.dataset.stage, 10);
  });
});

startFightBtn.addEventListener('click', () => {
  if (game.playerCharIndex === null) return;
  AudioSys.select();
  hideAllScreens();
  startMatch();
});

/* Pausa */
document.getElementById('btn-resume').addEventListener('click', () => {
  AudioSys.select();
  game.state = GameState.FIGHTING;
  hideScreen('screen-pause');
});
document.getElementById('btn-pause-menu').addEventListener('click', () => {
  AudioSys.select();
  hideAllScreens();
  game.state = GameState.MENU;
  showScreen('screen-menu');
});

/* Fin de partida */
document.getElementById('btn-rematch').addEventListener('click', () => {
  AudioSys.select();
  hideAllScreens();
  startMatch();
});
document.getElementById('btn-tomenu').addEventListener('click', () => {
  AudioSys.select();
  hideAllScreens();
  game.state = GameState.MENU;
  showScreen('screen-menu');
});

/* ---------- FLUJO DE PARTIDA ---------- */
function startMatch() {
  game.playerRounds = 0;
  game.aiRounds = 0;
  game.round = 1;
  startRound();
}

function pickEnemyIndex() {
  const opts = CHARACTERS.map((c, i) => i).filter(i => i !== game.playerCharIndex);
  return opts[Math.floor(Math.random() * opts.length)];
}

function startRound() {
  const pChar = CHARACTERS[game.playerCharIndex];
  const eIdx = game.enemyCharIndex !== undefined && game.enemyCharIndex !== null ? game.enemyCharIndex : pickEnemyIndex();
  game.enemyCharIndex = eIdx;
  const eChar = CHARACTERS[eIdx];

  player = new Fighter(pChar, 300, 1, true);
  enemy = new Fighter(eChar, 660, -1, false);
  enemy.ai = { timer: 0, intentMoveDir: 0, wantAttack: null, wantBlock: false, wantJump: false, aggressiveness: 0.5 + Math.min(0.35, (game.round - 1) * 0.1) };

  projectiles = [];
  particles = [];
  game.roundTimeMs = ROUND_TIME * 1000;
  game.comboTextP.timer = 0;
  game.comboTextA.timer = 0;

  game.state = GameState.ROUND_START;
  game.countdown = 3;
  game.countdownStep = 1000;
  game.bannerText = `ROUND ${game.round}`;
  game.bannerTimer = 900;
}

function endRound(winner) {
  game.state = GameState.ROUND_END;
  if (winner === 'draw') {
    game.bannerText = 'EMPATE';
  } else if (winner === 'player') {
    game.playerRounds++;
    game.bannerText = 'ROUND WIN';
  } else {
    game.aiRounds++;
    game.bannerText = 'K.O.';
  }
  const sub = document.getElementById('roundend-sub');
  const title = document.getElementById('roundend-title');
  title.textContent = winner === 'draw' ? 'EMPATE' : (winner === 'player' ? 'GANASTE LA RONDA' : 'PERDISTE LA RONDA');
  sub.textContent = `${player.name}: ${game.playerRounds}  —  ${enemy.name}: ${game.aiRounds}`;
  showScreen('screen-roundend');

  setTimeout(() => {
    hideScreen('screen-roundend');
    if (winner === 'draw') {
      startRound();
      return;
    }
    if (game.playerRounds >= ROUNDS_TO_WIN || game.aiRounds >= ROUNDS_TO_WIN) {
      endMatch();
    } else {
      game.round++;
      startRound();
    }
  }, 1900);
}

function endMatch() {
  game.state = GameState.MATCH_END;
  const playerWon = game.playerRounds > game.aiRounds;
  document.getElementById('matchend-title').textContent = playerWon ? 'YOU WIN' : 'GAME OVER';
  document.getElementById('matchend-sub').textContent =
    `${player.name} ${game.playerRounds} - ${game.aiRounds} ${enemy.name}`;
  showScreen('screen-matchend');
}

/* ---------- BUCLE PRINCIPAL ---------- */
let lastTs = 0;
function loop(ts) {
  const dt = Math.min(50, ts - lastTs || 16.6667);
  lastTs = ts;

  update(dt);
  render();

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------- UPDATE ---------- */
function update(dt) {
  for (const k in justPressed) delete justPressed[k];
  // note: justPressed is cleared at END of frame below; we read fresh press flags each frame via a snapshot
  if (game.state === GameState.ROUND_START) {
    updateCountdown(dt);
    return;
  }
  if (game.state !== GameState.FIGHTING) return;

  updatePlayerIntent();
  updateAIIntent(dt);

  updateFighterPhysics(player, dt, enemy);
  updateFighterPhysics(enemy, dt, player);

  resolveAttack(player, enemy, dt);
  resolveAttack(enemy, player, dt);

  updateProjectiles(dt);
  updateParticles(dt);

  if (game.screenShake > 0) game.screenShake = Math.max(0, game.screenShake - dt * 0.06);
  if (game.comboTextP.timer > 0) game.comboTextP.timer -= dt;
  if (game.comboTextA.timer > 0) game.comboTextA.timer -= dt;

  if (!player.knockedOut && !enemy.knockedOut) {
    game.roundTimeMs -= dt;
    if (game.roundTimeMs <= 0) {
      game.roundTimeMs = 0;
      if (player.health > enemy.health) endRound('player');
      else if (enemy.health > player.health) endRound('ai');
      else endRound('draw');
    }
  }

  if (player.knockedOut && game.state === GameState.FIGHTING) {
    game.state = 'KO_WAIT';
    setTimeout(() => { if (game.state === 'KO_WAIT') endRound('ai'); }, 650);
  } else if (enemy.knockedOut && game.state === GameState.FIGHTING) {
    game.state = 'KO_WAIT';
    setTimeout(() => { if (game.state === 'KO_WAIT') endRound('player'); }, 650);
  }
}

function updateCountdown(dt) {
  game.countdownStep -= dt;
  if (game.countdownStep <= 0) {
    game.countdown--;
    game.countdownStep = 800;
    if (game.countdown <= 0) {
      game.bannerText = 'FIGHT!';
      AudioSys.fight();
      setTimeout(() => {
        if (game.state === GameState.ROUND_START) game.state = GameState.FIGHTING;
      }, 500);
      game.countdown = -1;
    }
  }
}

/* Snapshot de "justPressed" se toma antes de borrarse; guardamos copia por frame */
let jp = {};
const origAddKeydown = true;
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  jp[k] = true;
});

function consumeJP(key) {
  if (jp[key]) { jp[key] = false; return true; }
  return false;
}

function updatePlayerIntent() {
  if (!player.canAct()) {
    // aún así permitir bloqueo a soltar / iniciar attack cuando termine
  }
  const moveDir = (keys['a'] ? -1 : 0) + (keys['d'] ? 1 : 0);
  player.blocking = !!keys['i'] && player.onGround && player.canAct();

  if (player.canAct() && !player.blocking) {
    player.crouching = !!keys['s'];
    if (keys['w'] && player.onGround && !player.crouching) {
      player.vy = JUMP_VELOCITY;
      player.onGround = false;
      AudioSys.jump();
    }
    player.vx = moveDir * player.speed * (player.crouching ? 0.0 : 1);
    if (moveDir !== 0) player.state = player.onGround ? (player.crouching ? 'crouch' : 'walk') : 'jump';
    else if (player.onGround) player.state = player.crouching ? 'crouch' : 'idle';
    else player.state = 'jump';
  } else if (player.blocking) {
    player.vx = 0;
    player.state = 'block';
  }

  if (player.canAct() && !player.blocking) {
    if (consumeJP('j')) player.startAttack('light');
    else if (consumeJP('k')) player.startAttack('heavy');
    else if (consumeJP('l')) player.startAttack('kick');
    else if (consumeJP('u')) player.startAttack('special');
  }
}

function updateAIIntent(dt) {
  const ai = enemy.ai;
  ai.timer -= dt;
  const dist = Math.abs(player.x - enemy.x);

  if (ai.timer <= 0) {
    ai.timer = 260 + Math.random() * 260;
    const aggro = ai.aggressiveness;
    ai.wantBlock = false;
    ai.wantJump = false;
    ai.wantAttack = null;
    ai.intentMoveDir = 0;

    if (dist > 260) {
      ai.intentMoveDir = enemy.x > player.x ? -1 : 1;
      if (Math.random() < 0.08) ai.wantJump = true;
    } else if (dist > 100) {
      if (Math.random() < aggro) {
        ai.intentMoveDir = enemy.x > player.x ? -1 : 1;
      } else if (Math.random() < 0.3) {
        ai.intentMoveDir = enemy.x > player.x ? 1 : -1;
      }
      if (enemy.specialCooldown <= 0 && Math.random() < 0.35) ai.wantAttack = 'special';
    } else {
      const r = Math.random();
      if (r < aggro * 0.55) {
        const atkR = Math.random();
        ai.wantAttack = atkR < 0.45 ? 'light' : (atkR < 0.8 ? 'kick' : 'heavy');
      } else if (r < aggro * 0.55 + 0.2) {
        ai.wantBlock = true;
      } else if (r < aggro * 0.55 + 0.35) {
        ai.intentMoveDir = enemy.x > player.x ? 1 : -1; // retirada
      } else if (enemy.specialCooldown <= 0 && r < aggro * 0.55 + 0.5) {
        ai.wantAttack = 'special';
      }
    }
  }

  if (!enemy.canAct()) return;

  enemy.blocking = !!ai.wantBlock && enemy.onGround;
  if (enemy.blocking) {
    enemy.vx = 0;
    enemy.state = 'block';
    return;
  }

  enemy.crouching = false;
  if (ai.wantJump && enemy.onGround) {
    enemy.vy = JUMP_VELOCITY;
    enemy.onGround = false;
    AudioSys.jump();
    ai.wantJump = false;
  }

  enemy.vx = ai.intentMoveDir * enemy.speed;
  if (ai.intentMoveDir !== 0) enemy.state = enemy.onGround ? 'walk' : 'jump';
  else enemy.state = enemy.onGround ? 'idle' : 'jump';

  if (ai.wantAttack) {
    enemy.startAttack(ai.wantAttack);
    ai.wantAttack = null;
  }
}

function updateFighterPhysics(f, dt, opponent) {
  const step = dt / 16.6667;

  if (!f.knockedOut) {
    f.facing = f.x <= opponent.x ? 1 : -1;
  }

  if (!f.onGround) {
    f.vy += GRAVITY * step;
  }
  f.y += f.vy * step;
  f.x += f.vx * step;

  if (f.y >= GROUND_Y) {
    f.y = GROUND_Y;
    f.vy = 0;
    if (!f.onGround) f.onGround = true;
  } else {
    f.onGround = false;
  }

  f.x = Math.max(ARENA_LEFT + f.w / 2, Math.min(ARENA_RIGHT - f.w / 2, f.x));
  // evitar solaparse por completo
  const minDist = 40;
  if (Math.abs(f.x - opponent.x) < minDist && f.onGround && opponent.onGround) {
    const push = (minDist - Math.abs(f.x - opponent.x)) / 2;
    if (f.x < opponent.x) f.x -= push; else f.x += push;
    f.x = Math.max(ARENA_LEFT + f.w / 2, Math.min(ARENA_RIGHT - f.w / 2, f.x));
  }

  if (!f.onGround) f.vx *= 0.98;
  else if (Math.abs(f.vx) > f.speed + 0.5) f.vx *= 0.9; // fricción tras retroceso

  f.walkCycle += step * (f.state === 'walk' ? 0.28 : 0.06);

  if (f.attackCooldown > 0) f.attackCooldown = Math.max(0, f.attackCooldown - dt);
  if (f.specialCooldown > 0) f.specialCooldown = Math.max(0, f.specialCooldown - dt);
  if (f.hitFlash > 0) f.hitFlash = Math.max(0, f.hitFlash - dt);

  if (f.activeAttack) {
    f.activeAttack.elapsed += dt;
    if (f.activeAttack.type === 'special' && f.activeAttack.config.kind === 'dash') {
      if (f.activeAttack.elapsed >= f.activeAttack.config.activeStart && f.activeAttack.elapsed <= f.activeAttack.config.activeEnd) {
        f.x += f.facing * 11 * step;
        f.x = Math.max(ARENA_LEFT + f.w / 2, Math.min(ARENA_RIGHT - f.w / 2, f.x));
      }
    }
    if (f.activeAttack.type === 'special' && f.activeAttack.config.kind === 'projectile') {
      if (f.activeAttack.elapsed >= f.activeAttack.config.activeStart && !f.activeAttack.spawned) {
        spawnProjectile(f);
        f.activeAttack.spawned = true;
      }
    }
    if (f.activeAttack.elapsed >= f.activeAttack.config.duration) {
      f.activeAttack = null;
      if (!f.knockedOut) f.state = f.onGround ? 'idle' : 'jump';
    }
  }

  if (f.state === 'hurt') {
    f.hurtTimer -= dt;
    if (f.hurtTimer <= 0 && !f.knockedOut) {
      f.state = f.onGround ? 'idle' : 'jump';
    }
  }

  if (!f.blocking && f.state === 'block') f.state = f.onGround ? 'idle' : 'jump';
}

function attackHitbox(f) {
  const cfg = f.activeAttack.config;
  let range = cfg.range || 70;
  const bx = f.x + f.facing * (f.w / 2);
  const height = f.crouching ? 46 : 40;
  const yCenter = f.y - (f.crouching ? 34 : 60);
  if (f.facing >= 0) {
    return { x: bx, y: yCenter - height / 2, w: range, h: height };
  }
  return { x: bx - range, y: yCenter - height / 2, w: range, h: height };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function resolveAttack(attacker, defender, dt) {
  if (!attacker.activeAttack || attacker.activeAttack.hasHit) return;
  const cfg = attacker.activeAttack.config;
  const t = attacker.activeAttack.elapsed;
  if (t < cfg.activeStart || t > cfg.activeEnd) return;

  if (attacker.activeAttack.type === 'special' && cfg.kind === 'projectile') return; // el daño lo maneja el proyectil
  if (attacker.activeAttack.type === 'special' && cfg.kind === 'charge' && attacker.chargeGlow < 999) attacker.chargeGlow = t;

  let hit = false;
  if (attacker.activeAttack.type === 'special' && cfg.kind === 'area') {
    const dx = Math.abs(attacker.x - defender.x);
    const dy = Math.abs(attacker.y - defender.y - 40);
    hit = Math.sqrt(dx * dx + dy * dy) < cfg.radius;
  } else {
    const box = attackHitbox(attacker);
    hit = rectsOverlap(box, defender.hurtboxRect);
  }

  if (hit) {
    attacker.activeAttack.hasHit = true;
    const isSpecial = attacker.activeAttack.type === 'special';
    defender.takeHit(cfg.dmg * attacker.power, cfg.knockback, attacker.facing, isSpecial);
    spawnHitParticles(defender.x, defender.y - 60, defender.blocking);
    registerCombo(attacker);
  }
}

function registerCombo(attacker) {
  const now = performance.now();
  if (now - attacker.lastHitLandedAt <= COMBO_WINDOW_MS) {
    attacker.comboCount++;
  } else {
    attacker.comboCount = 1;
  }
  attacker.lastHitLandedAt = now;
  if (attacker.comboCount >= 2) {
    const label = `COMBO x${attacker.comboCount}`;
    if (attacker.isPlayer) { game.comboTextP.text = label; game.comboTextP.timer = 1100; }
    else { game.comboTextA.text = label; game.comboTextA.timer = 1100; }
  }
}

/* ---------- PROYECTILES ---------- */
function spawnProjectile(owner) {
  projectiles.push({
    x: owner.x + owner.facing * 30,
    y: owner.y - 62,
    vx: owner.facing * 7.5,
    w: 22, h: 16,
    owner,
    dmg: 16,
    knockback: 6,
    life: 1400
  });
}

function updateProjectiles(dt) {
  const step = dt / 16.6667;
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.vx * step;
    p.life -= dt;
    const target = p.owner === player ? enemy : player;
    const pRect = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
    if (rectsOverlap(pRect, target.hurtboxRect) && !target.knockedOut) {
      target.takeHit(p.dmg * p.owner.power, p.knockback, p.vx > 0 ? 1 : -1, true);
      spawnHitParticles(target.x, target.y - 60, target.blocking);
      registerCombo(p.owner);
      projectiles.splice(i, 1);
      continue;
    }
    if (p.x < ARENA_LEFT - 30 || p.x > ARENA_RIGHT + 30 || p.life <= 0) {
      projectiles.splice(i, 1);
    }
  }
}

/* ---------- PARTÍCULAS ---------- */
function spawnHitParticles(x, y, blocked) {
  const count = blocked ? 5 : 9;
  for (let i = 0; i < count; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.9) * 5,
      life: 300 + Math.random() * 200,
      maxLife: 500,
      color: blocked ? '#8fd7ff' : '#ffdf6b',
      r: 2 + Math.random() * 3
    });
  }
}

function updateParticles(dt) {
  const step = dt / 16.6667;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * step;
    p.y += p.vy * step;
    p.vy += 0.2 * step;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

/* ==========================================================
   RENDER
   ========================================================== */
function render() {
  ctx.save();
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  let shakeX = 0, shakeY = 0;
  if (game.screenShake > 0) {
    shakeX = (Math.random() - 0.5) * game.screenShake;
    shakeY = (Math.random() - 0.5) * game.screenShake;
  }
  ctx.translate(shakeX, shakeY);

  drawStage();

  if (player && enemy) {
    drawFighter(enemy);
    drawFighter(player);
    drawProjectiles();
    drawParticles();
  }

  if (game.state === GameState.FIGHTING || game.state === 'KO_WAIT' || game.state === GameState.ROUND_START || game.state === GameState.PAUSED) {
    drawHUD();
  }

  if (game.state === GameState.ROUND_START) {
    drawCountdownBanner();
  }

  ctx.restore();
}

function drawStage() {
  const s = STAGES[game.stageIndex] || STAGES[0];
  const grad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  grad.addColorStop(0, s.skyTop);
  grad.addColorStop(1, s.skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, GROUND_Y);

  ctx.fillStyle = s.build;
  for (let i = 0; i < 7; i++) {
    const bw = 70 + (i % 3) * 20;
    const bh = 120 + (i * 37) % 140;
    ctx.fillRect(i * 140 - 20, GROUND_Y - bh - 40, bw, bh);
  }
  ctx.fillStyle = s.accent;
  for (let i = 0; i < 10; i++) {
    if ((i * 13) % 4 === 0) continue;
    ctx.fillRect(20 + i * 92, GROUND_Y - 150 - (i % 3) * 30, 10, 14);
  }

  ctx.fillStyle = s.ground;
  ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < CANVAS_W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, GROUND_Y); ctx.lineTo(x - 20, CANVAS_H); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, GROUND_Y - 2, CANVAS_W, 4);
}

function drawFighter(f) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(f.facing, 1);

  const isCrouch = f.crouching && f.onGround;
  const bodyH = isCrouch ? 58 : 96;
  const legPhase = Math.sin(f.walkCycle) * (f.state === 'walk' ? 12 : 2);

  let tilt = 0;
  let armExtend = 0;
  let legKick = 0;

  if (f.state === 'hurt') tilt = -0.18;
  if (f.state === 'block') tilt = 0.06;
  if (f.state === 'attack' || f.state === 'heavyAttack') {
    const p = f.activeAttack ? Math.min(1, f.activeAttack.elapsed / (f.activeAttack.config.activeEnd || 150)) : 0;
    armExtend = 26 * Math.sin(Math.min(1, p) * Math.PI);
  }
  if (f.state === 'kickAttack') {
    const p = f.activeAttack ? Math.min(1, f.activeAttack.elapsed / (f.activeAttack.config.activeEnd || 150)) : 0;
    legKick = 30 * Math.sin(Math.min(1, p) * Math.PI);
  }
  if (f.state === 'special') {
    armExtend = 14;
    if (f.activeAttack && f.activeAttack.config.kind === 'charge') {
      const glow = Math.min(1, f.activeAttack.elapsed / f.activeAttack.config.activeStart);
      f._chargeGlowAmt = glow;
    }
  }
  if (f.knockedOut) tilt = 1.35;

  ctx.rotate(tilt);

  const hipY = -bodyH * 0.42;
  const shoulderY = -bodyH * 0.92;
  const headY = -bodyH - 14;

  // sombra
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 4, 26, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // piernas
  ctx.strokeStyle = f.color;
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  if (!f.knockedOut) {
    ctx.beginPath();
    ctx.moveTo(-6, hipY);
    ctx.lineTo(-6 + (isCrouch ? 4 : legPhase * 0.5), 0 - (isCrouch ? bodyH * 0.35 : 0));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(6, hipY);
    ctx.lineTo(6 - (isCrouch ? -4 : legPhase * 0.5) + legKick, 0 - (isCrouch ? bodyH * 0.35 : 0));
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-6, hipY); ctx.lineTo(30, hipY + 6); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(6, hipY); ctx.lineTo(34, hipY - 4); ctx.stroke();
  }

  // torso
  ctx.fillStyle = f.color;
  ctx.beginPath();
  ctx.moveTo(-14, hipY);
  ctx.lineTo(-16, shoulderY);
  ctx.lineTo(16, shoulderY);
  ctx.lineTo(14, hipY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = f.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-14, hipY - 6);
  ctx.lineTo(14, shoulderY + 10);
  ctx.stroke();

  // brazo trasero
  ctx.strokeStyle = f.color;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-10, shoulderY + 6);
  ctx.lineTo(-18, hipY + 8);
  ctx.stroke();

  // brazo delantero (ataque / bloqueo)
  ctx.beginPath();
  if (f.state === 'block') {
    ctx.moveTo(10, shoulderY + 6);
    ctx.lineTo(30, shoulderY + 24);
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.1 * Math.sin(performance.now() / 90);
    ctx.strokeStyle = '#7fe6ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(20, shoulderY + 20, 26, -1.4, 1.4);
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.moveTo(10, shoulderY + 6);
    ctx.lineTo(24 + armExtend, shoulderY + 14 - armExtend * 0.15);
    ctx.stroke();
    if (armExtend > 4) {
      ctx.fillStyle = f.accent;
      ctx.beginPath();
      ctx.arc(24 + armExtend, shoulderY + 14 - armExtend * 0.15, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (f.state === 'special' && f._chargeGlowAmt) {
    ctx.save();
    ctx.globalAlpha = f._chargeGlowAmt * 0.7;
    ctx.fillStyle = f.accent;
    ctx.beginPath();
    ctx.arc(26, shoulderY + 14, 10 + f._chargeGlowAmt * 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (f.state === 'special' && f.special === 'area') {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = f.accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, hipY, 40 + Math.sin(performance.now() / 60) * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // cabeza
  ctx.fillStyle = f.skin;
  ctx.beginPath();
  ctx.arc(0, headY, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = f.color;
  ctx.beginPath();
  ctx.arc(0, headY - 3, 14, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(5, headY - 1, 1.8, 0, Math.PI * 2);
  ctx.fill();

  if (f.hitFlash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.55, f.hitFlash / 180);
    ctx.fillStyle = '#ff3b3b';
    ctx.beginPath();
    ctx.arc(0, headY - bodyH * 0.3, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function drawProjectiles() {
  projectiles.forEach(p => {
    ctx.save();
    ctx.translate(p.x, p.y);
    const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, 14);
    grad.addColorStop(0, '#fff3b0');
    grad.addColorStop(1, 'rgba(255,140,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffcc33';
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawParticles() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

/* ---------- HUD ---------- */
function drawHUD() {
  const barW = 380, barH = 22;
  const pFrac = Math.max(0, player.health / player.maxHealth);
  const eFrac = Math.max(0, enemy.health / enemy.maxHealth);

  // marcos
  ctx.fillStyle = '#111';
  ctx.fillRect(18, 18, barW, barH);
  ctx.fillRect(CANVAS_W - 18 - barW, 18, barW, barH);

  const pGrad = ctx.createLinearGradient(0, 0, barW, 0);
  pGrad.addColorStop(0, '#ff5050'); pGrad.addColorStop(1, '#ffe066');
  ctx.fillStyle = pGrad;
  ctx.fillRect(18, 18, barW * pFrac, barH);

  const eGrad = ctx.createLinearGradient(0, 0, barW, 0);
  eGrad.addColorStop(0, '#ffe066'); eGrad.addColorStop(1, '#ff5050');
  ctx.fillStyle = eGrad;
  const eW = barW * eFrac;
  ctx.fillStyle = eGrad;
  ctx.fillRect(CANVAS_W - 18 - eW, 18, eW, barH);

  ctx.strokeStyle = '#eafcff';
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, barW, barH);
  ctx.strokeRect(CANVAS_W - 18 - barW, 18, barW, barH);

  ctx.fillStyle = '#eafcff';
  ctx.font = 'bold 14px "Courier New"';
  ctx.textAlign = 'left';
  ctx.fillText(player.name, 18, 56);
  ctx.textAlign = 'right';
  ctx.fillText(enemy.name, CANVAS_W - 18, 56);

  // pips de rondas
  drawRoundPips(18, 62, game.playerRounds, true);
  drawRoundPips(CANVAS_W - 18, 62, game.aiRounds, false);

  // timer
  ctx.textAlign = 'center';
  ctx.font = 'bold 30px "Courier New"';
  ctx.fillStyle = game.roundTimeMs < 10000 ? '#ff4d4d' : '#eafcff';
  ctx.fillText(Math.ceil(game.roundTimeMs / 1000), CANVAS_W / 2, 42);

  // combo texts
  if (game.comboTextP.timer > 0) {
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 18px "Courier New"';
    ctx.textAlign = 'left';
    ctx.fillText(game.comboTextP.text, 18, 90);
  }
  if (game.comboTextA.timer > 0) {
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 18px "Courier New"';
    ctx.textAlign = 'right';
    ctx.fillText(game.comboTextA.text, CANVAS_W - 18, 90);
  }
}

function drawRoundPips(x, y, won, leftAlign) {
  for (let i = 0; i < ROUNDS_TO_WIN; i++) {
    const px = leftAlign ? x + i * 16 : x - i * 16;
    ctx.beginPath();
    ctx.arc(px, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = i < won ? '#ffcc00' : 'rgba(255,255,255,0.15)';
    ctx.fill();
    ctx.strokeStyle = '#eafcff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawCountdownBanner() {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 64px "Courier New"';
  ctx.fillStyle = '#ffcc00';
  ctx.strokeStyle = '#7a4b00';
  ctx.lineWidth = 4;
  const label = game.countdown > 0 ? String(game.countdown) : (game.bannerText || 'FIGHT!');
  ctx.strokeText(label, CANVAS_W / 2, CANVAS_H / 2 - 40);
  ctx.fillText(label, CANVAS_W / 2, CANVAS_H / 2 - 40);

  ctx.font = 'bold 26px "Courier New"';
  ctx.fillStyle = '#21e6ff';
  ctx.fillText(`ROUND ${game.round}`, CANVAS_W / 2, CANVAS_H / 2 - 100);
  ctx.restore();
}
