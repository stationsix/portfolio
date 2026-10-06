(() => {
  'use strict';

  const TOTAL_ROUNDS = 8;
  const START_LIVES = 3;
  const START_SIZE = 4;
  const BEST_KEY = 'findFred.best';

  const $ = (id) => document.getElementById(id);
  const els = {
    round: $('round'), total: $('total-rounds'), score: $('score'), best: $('best'),
    lives: $('lives'), bar: $('timer-bar'), message: $('message'), board: $('board'),
    target: $('target'), mute: $('mute'),
    overlay: $('overlay'), panel: document.querySelector('.panel'),
    art: $('overlay-art'), title: $('overlay-title'), text: $('overlay-text'),
    button: $('overlay-button'),
  };

  const state = { round: 1, score: 0, lives: START_LIVES, best: 0, active: false,
                  timeLeft: 0, timeMax: 0, timerId: null, fredIndex: -1, muted: false };

  try { state.best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch (_) { /* ignore */ }

  // ---------- Sound (square-wave blips) ----------
  let audioCtx = null;
  function beep(freq, dur, { delay = 0, type = 'square', vol = 0.05 } = {}) {
    if (state.muted) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime + delay;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + dur);
    } catch (_) { /* audio unavailable */ }
  }
  const sfx = {
    start: () => [330, 440, 660, 880].forEach((f, i) => beep(f, 0.1, { delay: i * 0.08 })),
    good: () => [660, 880, 1320].forEach((f, i) => beep(f, 0.09, { delay: i * 0.07 })),
    bad: () => beep(120, 0.25, { type: 'sawtooth', vol: 0.08 }),
    timeout: () => [300, 220, 150].forEach((f, i) => beep(f, 0.15, { delay: i * 0.12, type: 'sawtooth' })),
    win: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => beep(f, 0.13, { delay: i * 0.1 })),
    lose: () => [440, 392, 349, 294, 220].forEach((f, i) => beep(f, 0.22, { delay: i * 0.18, type: 'triangle', vol: 0.09 })),
  };

  // ---------- Pixel people ----------
  // Every person is a 16x16 sprite built from rects. Fred is the ONLY person with
  // a full beard AND a warm-colored (red/orange/maroon) plaid shirt.
  const SKINS = ['#fbe0cc', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#6b3e1f', '#4a2912'];
  const NATURAL = ['#161616', '#3a2415', '#6b4423', '#c9a24a', '#a8431c', '#9a9a9a', '#e6e6e6'];
  const DYED = ['#2f6bff', '#ff4fa8', '#2bd9a0', '#9b4dff'];
  const FRED_HAIR = '#6b4423';
  const FRED_SKIN = '#f1c27d';

  const SHIRTS = [
    { fill: '#c0392b', accent: '#111111', warm: true },   // red (Fred's)
    { fill: '#7b1e1e', accent: '#111111', warm: true },   // maroon
    { fill: '#e67e22', accent: '#3b1c00', warm: true },   // orange
    { fill: '#2f5fa8', accent: '#0b1a33' },
    { fill: '#2e8b57', accent: '#0a2a18' },
    { fill: '#e8c21a', accent: '#4a3a00' },
    { fill: '#7e3fb0', accent: '#25103a' },
    { fill: '#19a7b8', accent: '#06353b' },
    { fill: '#f2f2f2', accent: '#8899aa' },
    { fill: '#2b2b33', accent: '#888899' },
    { fill: '#ee6fa5', accent: '#6a1f43' },
    { fill: '#8a949e', accent: '#2a3036' },
  ];
  const RED = SHIRTS[0];
  const PATTERNS = ['solid', 'solid', 'solid', 'plaid', 'plaid', 'stripes'];
  const HAIR_STYLES = ['short', 'short', 'buzz', 'long', 'long', 'afro', 'bun', 'bald', 'mohawk'];
  const BEARDS = ['none', 'none', 'none', 'none', 'stubble', 'mustache', 'goatee', 'full', 'full'];
  const HEADWEAR = [null, null, null, null, null, 'cap', 'beanie', 'turban', 'hijab'];
  const GLASSES = [null, null, null, 'clear', 'shades'];
  const HEADWEAR_COLORS = ['#2f5fa8', '#222', '#c0392b', '#e8c21a', '#2e8b57', '#f2f2f2', '#7e3fb0'];

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const FRED = {
    skin: FRED_SKIN, hairStyle: 'short', hair: FRED_HAIR, beard: 'full', beardColor: FRED_HAIR,
    glasses: null, headwear: null, headwearColor: null, shirt: RED, pattern: 'plaid',
  };

  function isFredLike(p) {
    return p.beard === 'full' && p.pattern === 'plaid' && p.shirt.warm && p.headwear !== 'hijab';
  }

  function randomPerson(round) {
    // Share of decoys that deliberately match ONE of Fred's two signature traits.
    const lookalike = Math.min(0.75, 0.4 + round * 0.04);
    for (;;) {
      const hair = Math.random() < 0.12 ? pick(DYED) : pick(NATURAL);
      const p = {
        skin: pick(SKINS), hairStyle: pick(HAIR_STYLES), hair,
        beard: pick(BEARDS), beardColor: NATURAL.includes(hair) ? hair : pick(NATURAL),
        glasses: pick(GLASSES), headwear: pick(HEADWEAR), headwearColor: pick(HEADWEAR_COLORS),
        shirt: pick(SHIRTS), pattern: pick(PATTERNS),
      };
      const r = Math.random();
      if (r < lookalike / 2) {            // bearded like Fred, different shirt
        p.beard = 'full';
        if (p.headwear === 'hijab') p.headwear = null;
      } else if (r < lookalike) {         // flannel like Fred, different face
        p.shirt = pick(SHIRTS.filter((s) => s.warm));
        p.pattern = 'plaid';
        p.beard = pick(['none', 'stubble', 'mustache', 'goatee']);
      }
      if (p.headwear === 'hijab') p.beard = 'none';
      if (!isFredLike(p)) return p;
    }
  }

  function spriteSVG(p) {
    let out = '';
    const px = (x, y, w, h, fill, op) =>
      { out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${op ? ` opacity="${op}"` : ''}/>`; };

    // --- back layer (behind head) ---
    if (p.headwear === 'hijab') {
      px(3, 1, 10, 10, p.headwearColor);
    } else {
      if (p.hairStyle === 'afro') { px(4, 0, 8, 1, p.hair); px(3, 1, 10, 1, p.hair); px(2, 2, 12, 7, p.hair); }
      if (p.hairStyle === 'bun') px(6, 0, 4, 2, p.hair);
      if (p.hairStyle === 'mohawk') px(7, 0, 2, 3, p.hair);
    }

    // --- shirt ---
    const { fill, accent } = p.shirt;
    px(3, 11, 10, 1, fill);
    px(2, 12, 12, 4, fill);
    if (p.pattern === 'plaid') {
      [3, 7, 11].forEach((x) => px(x, 11, 2, 5, accent, 0.55));
      [12, 14].forEach((y) => px(2, y, 12, 1, accent, 0.55));
    } else if (p.pattern === 'stripes') {
      [12, 14].forEach((y) => px(2, y, 12, 1, accent, 0.7));
    }

    // --- neck + head ---
    px(6, 10, 4, 1, p.skin);
    px(7, 11, 2, 1, p.skin);
    px(3, 5, 1, 2, p.skin);
    px(12, 5, 1, 2, p.skin);
    px(4, 3, 8, 7, p.skin);

    // --- facial hair / mouth ---
    const b = p.beardColor;
    if (p.beard === 'full') {
      px(4, 6, 1, 3, b); px(11, 6, 1, 3, b); px(4, 8, 8, 2, b); px(5, 7, 6, 1, b);
      px(7, 8, 2, 1, '#7a2e2e');
    } else {
      if (p.beard === 'stubble') px(4, 7, 8, 3, b, 0.3);
      if (p.beard === 'mustache') px(5, 7, 6, 1, b);
      if (p.beard === 'goatee') { px(5, 7, 6, 1, b); px(6, 8, 4, 2, b); }
      px(7, 8, 2, 1, p.beard === 'goatee' ? '#7a2e2e' : '#b05a5a');
    }

    // --- eyes + glasses ---
    px(6, 5, 1, 1, '#161616');
    px(9, 5, 1, 1, '#161616');
    if (p.glasses === 'clear') {
      const f = '#2a2a2a';
      [5, 8].forEach((x) => { px(x, 4, 3, 1, f); px(x, 6, 3, 1, f); px(x, 5, 1, 1, f); px(x + 2, 5, 1, 1, f); });
    } else if (p.glasses === 'shades') {
      px(5, 4, 6, 2, '#0a0a0a');
    }

    // --- front hair / headwear ---
    const h = p.hair;
    if (p.headwear === 'hijab') {
      const c = p.headwearColor;
      px(4, 3, 8, 1, c); px(4, 4, 1, 5, c); px(11, 4, 1, 5, c);
    } else {
      switch (p.hairStyle) {
        case 'short': px(4, 2, 8, 2, h); px(4, 4, 1, 2, h); px(11, 4, 1, 2, h); break;
        case 'buzz': px(5, 2, 6, 1, h); px(4, 3, 8, 1, h); break;
        case 'long': px(4, 2, 8, 2, h); px(3, 3, 1, 8, h); px(12, 3, 1, 8, h); px(4, 4, 1, 6, h); px(11, 4, 1, 6, h); break;
        case 'afro': px(4, 3, 8, 1, h); break;
        case 'bun': px(4, 2, 8, 2, h); px(4, 4, 1, 2, h); px(11, 4, 1, 2, h); break;
        case 'mohawk': px(6, 3, 4, 1, h); break;
        case 'bald': px(4, 6, 1, 1, h, 0.5); px(11, 6, 1, 1, h, 0.5); break;
        default: break;
      }
      const c = p.headwearColor;
      if (p.headwear === 'cap') { px(4, 1, 8, 3, c); px(3, 4, 10, 1, c); px(4, 1, 8, 1, '#fff', 0.2); }
      if (p.headwear === 'beanie') { px(4, 1, 8, 3, c); px(4, 3, 8, 1, '#fff', 0.3); px(7, 0, 2, 1, c); }
      if (p.headwear === 'turban') { px(3, 0, 10, 4, c); px(4, 1, 8, 1, '#000', 0.25); px(4, 3, 8, 1, '#000', 0.2); }
    }

    return `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">${out}</svg>`;
  }

  const fredSVG = () => spriteSVG(FRED);

  // ---------- Game flow ----------
  const gridSize = (round) => START_SIZE + round - 1;          // 4x4 ... 11x11
  const roundSeconds = (round) => Math.round(6 + gridSize(round) * 1.6);
  const pad = (n) => String(n).padStart(6, '0');

  function renderHUD() {
    els.round.textContent = state.round;
    els.total.textContent = TOTAL_ROUNDS;
    els.score.textContent = pad(state.score);
    els.best.textContent = pad(state.best);
    els.lives.innerHTML = '♥'.repeat(state.lives) + `<span class="dead">${'♥'.repeat(START_LIVES - state.lives)}</span>`;
    els.lives.setAttribute('aria-label', `${state.lives} lives left`);
  }

  function setMessage(text, kind = '') {
    els.message.textContent = text;
    els.message.className = `message ${kind}`.trim();
  }

  function buildBoard() {
    const n = gridSize(state.round);
    const total = n * n;
    state.fredIndex = Math.floor(Math.random() * total);
    els.board.style.setProperty('--n', n);
    els.board.replaceChildren();

    for (let i = 0; i < total; i++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.setAttribute('aria-label', `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}`);
      cell.innerHTML = i === state.fredIndex ? fredSVG() : spriteSVG(randomPerson(state.round));
      cell.addEventListener('click', () => onPick(i, cell));
      els.board.appendChild(cell);
    }
  }

  function startRound() {
    renderHUD();
    buildBoard();
    state.active = true;
    state.timeMax = state.timeLeft = roundSeconds(state.round);
    setMessage(`Round ${state.round}: full beard + red flannel!`);
    stopTimer();
    state.timerId = setInterval(tick, 100);
    updateBar();
  }

  function tick() {
    state.timeLeft = Math.max(0, state.timeLeft - 0.1);
    updateBar();
    if (state.timeLeft <= 0) onTimeout();
  }

  function updateBar() {
    const pct = (state.timeLeft / state.timeMax) * 100;
    els.bar.style.width = `${pct}%`;
    els.bar.classList.toggle('low', pct < 30);
  }

  function stopTimer() {
    clearInterval(state.timerId);
    state.timerId = null;
  }

  const cells = () => [...els.board.children];

  function onPick(i, cell) {
    if (!state.active) return;
    if (i === state.fredIndex) {
      state.active = false;
      stopTimer();
      const points = state.round * 100 + Math.ceil(state.timeLeft) * 10;
      state.score += points;
      cell.classList.add('found');
      cells().forEach((c) => { c.disabled = true; });
      saveBest();
      renderHUD();
      if (state.round >= TOTAL_ROUNDS) {
        sfx.win();
        setMessage(`Found him! +${points}`, 'good');
        setTimeout(() => endGame(true), 1000);
      } else {
        sfx.good();
        setMessage(`Found Fred! +${points}`, 'good');
        state.round++;
        setTimeout(startRound, 900);
      }
    } else {
      cell.classList.add('wrong');
      cell.disabled = true;
      sfx.bad();
      loseLife('Wrong guy! -1 life', false);
    }
  }

  function onTimeout() {
    if (!state.active) return;
    sfx.timeout();
    loseLife("Time's up! -1 life", true);
  }

  function loseLife(msg, revealFred) {
    state.lives--;
    renderHUD();
    setMessage(msg, 'bad');
    if (revealFred || state.lives <= 0) {
      state.active = false;
      stopTimer();
      cells().forEach((c) => { c.disabled = true; });
      cells()[state.fredIndex].classList.add('reveal');
      if (state.lives <= 0) {
        setTimeout(() => endGame(false), 1400);
      } else {
        setTimeout(startRound, 1400); // retry the same round with a fresh board
      }
    }
  }

  function saveBest() {
    if (state.score > state.best) {
      state.best = state.score;
      try { localStorage.setItem(BEST_KEY, String(state.best)); } catch (_) { /* ignore */ }
    }
  }

  function showOverlay({ kind = '', title, text, button }) {
    els.panel.className = `panel ${kind}`.trim();
    els.title.textContent = title;
    els.text.textContent = text;
    els.button.textContent = button;
    els.art.innerHTML = fredSVG();
    els.overlay.hidden = false;
    els.button.focus();
  }

  function endGame(won) {
    state.active = false;
    stopTimer();
    const newRecord = state.score > 0 && state.score > state.best;
    saveBest();
    renderHUD();
    if (!won) sfx.lose();
    const record = newRecord ? '\nNew hi-score!' : '';
    showOverlay(won
      ? { kind: 'win', title: 'You Win!', button: 'PLAY AGAIN',
          text: `You found Fred in all ${TOTAL_ROUNDS} rounds.\nFinal score: ${pad(state.score)}${record}` }
      : { kind: 'lose', title: 'Game Over', button: 'CONTINUE?',
          text: `Fred got away on round ${state.round}.\nFinal score: ${pad(state.score)}${record}` });
  }

  function newGame() {
    Object.assign(state, { round: 1, score: 0, lives: START_LIVES });
    els.overlay.hidden = true;
    sfx.start();
    startRound();
  }

  els.button.addEventListener('click', newGame);
  els.mute.addEventListener('click', () => {
    state.muted = !state.muted;
    els.mute.textContent = state.muted ? 'SND OFF' : 'SND ON';
    els.mute.setAttribute('aria-pressed', String(state.muted));
  });

  els.target.innerHTML = fredSVG();
  renderHUD();
  showOverlay({
    title: 'Find Fred',
    button: 'PRESS START',
    text: `Fred has a full beard\nand a red flannel shirt.\nSpot him in the crowd!\n${TOTAL_ROUNDS} rounds. ${START_LIVES} lives. Beat the clock.`,
  });
})();
