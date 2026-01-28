// Audio Context for sound effects
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let soundEnabled = true;

function playSound(type) {
  if (!soundEnabled) return;
  
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  const now = audioContext.currentTime;
  
  switch(type) {
    case 'chomp':
      oscillator.frequency.setValueAtTime(400, now);
      oscillator.frequency.exponentialRampToValueAtTime(200, now + 0.05);
      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      oscillator.start(now);
      oscillator.stop(now + 0.05);
      break;
      
    case 'eatGhost':
      oscillator.frequency.setValueAtTime(200, now);
      oscillator.frequency.exponentialRampToValueAtTime(800, now + 0.2);
      gainNode.gain.setValueAtTime(0.4, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      oscillator.start(now);
      oscillator.stop(now + 0.2);
      break;
      
    case 'powerPellet':
      oscillator.frequency.setValueAtTime(800, now);
      oscillator.frequency.exponentialRampToValueAtTime(200, now + 0.3);
      oscillator.type = 'square';
      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      oscillator.start(now);
      oscillator.stop(now + 0.3);
      break;
      
    case 'death':
      oscillator.frequency.setValueAtTime(800, now);
      oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.5);
      oscillator.type = 'sawtooth';
      gainNode.gain.setValueAtTime(0.5, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      oscillator.start(now);
      oscillator.stop(now + 0.5);
      break;
      
    case 'levelComplete':
      for(let i = 0; i < 5; i++) {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.setValueAtTime(400 + (i * 100), now + (i * 0.1));
        gain.gain.setValueAtTime(0.2, now + (i * 0.1));
        gain.gain.exponentialRampToValueAtTime(0.01, now + (i * 0.1) + 0.1);
        osc.start(now + (i * 0.1));
        osc.stop(now + (i * 0.1) + 0.1);
      }
      break;
      
    case 'fruit':
      oscillator.frequency.setValueAtTime(600, now);
      oscillator.frequency.setValueAtTime(800, now + 0.05);
      oscillator.frequency.setValueAtTime(1000, now + 0.1);
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      oscillator.start(now);
      oscillator.stop(now + 0.15);
      break;
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  document.getElementById('sound-toggle').textContent = soundEnabled ? '🔊' : '🔇';
}

const gameEl = document.getElementById('game');
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const livesEl = document.getElementById('lives');
const highscoreEl = document.getElementById('highscore');
const gameContainer = document.getElementById('game-container');
const specialFeatureEl = document.getElementById('special-feature');

const GRID_WIDTH = 19;
const GRID_HEIGHT = 21;

let score = 0;
let level = 1;
let lives = 3;
let highscore = parseInt(localStorage.getItem('pacman-highscore')) || 0;
let gameActive = false;
let powerMode = false;
let superMode = false;
let powerModeTimer = null;
let fruitPresent = false;

const mapTemplates = [
  [
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
    1,2,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,2,1,
    1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1,
    1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,0,1,
    1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1,
    1,1,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,1,1,
    1,1,1,1,0,1,0,0,0,0,0,0,0,1,0,1,1,1,1,
    1,1,1,1,0,1,0,1,1,3,1,1,0,1,0,1,1,1,1,
    0,0,0,0,0,0,0,1,3,3,3,1,0,0,0,0,0,0,0,
    1,1,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,1,1,
    1,1,1,1,0,1,0,0,0,0,0,0,0,1,0,1,1,1,1,
    1,1,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,1,1,
    1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1,
    1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1,
    1,2,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,2,1,
    1,1,0,1,0,1,0,1,1,1,1,1,0,1,0,1,0,1,1,
    1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1,
    1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,0,1,
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1
  ],
  [
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
    1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1,
    1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,0,1,
    1,0,1,0,0,0,0,1,0,1,0,1,0,0,0,0,1,0,1,
    1,0,1,0,1,1,0,1,0,0,0,1,0,1,1,0,1,0,1,
    1,0,1,0,1,1,0,1,1,1,1,1,0,1,1,0,1,0,1,
    1,0,1,0,0,0,0,0,0,1,0,0,0,0,0,0,1,0,1,
    1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,1,1,1,1,1,1,1,0,3,0,1,1,1,1,1,1,1,1,
    1,2,0,0,0,0,0,0,0,3,0,0,0,0,0,0,0,2,1,
    1,1,1,1,1,1,1,1,0,3,0,1,1,1,1,1,1,1,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,0,1,
    1,0,1,0,0,0,0,0,0,1,0,0,0,0,0,0,1,0,1,
    1,0,1,0,1,1,0,1,1,1,1,1,0,1,1,0,1,0,1,
    1,0,1,0,1,1,0,1,0,0,0,1,0,1,1,0,1,0,1,
    1,0,1,0,0,0,0,1,0,1,0,1,0,0,0,0,1,0,1,
    1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,0,1,
    1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1,
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1
  ],
  [
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
    1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,1,
    1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1,
    1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,
    1,0,1,0,1,1,1,1,1,1,1,1,1,1,1,0,1,0,1,
    1,0,1,0,1,0,0,0,0,0,0,0,0,0,1,0,1,0,1,
    1,0,1,0,1,0,1,1,1,1,1,1,1,0,1,0,1,0,1,
    1,0,1,0,1,0,1,0,0,0,0,0,1,0,1,0,1,0,1,
    1,0,1,0,1,0,1,0,1,1,1,0,1,0,1,0,1,0,1,
    1,0,1,0,1,0,1,0,1,3,1,0,1,0,1,0,1,0,1,
    1,0,1,0,1,0,1,0,1,1,1,0,1,0,1,0,1,0,1,
    1,0,1,0,1,0,1,0,0,0,0,0,1,0,1,0,1,0,1,
    1,0,1,0,1,0,1,1,1,1,1,1,1,0,1,0,1,0,1,
    1,0,1,0,1,0,0,0,0,0,0,0,0,0,1,0,1,0,1,
    1,0,1,0,1,1,1,1,1,1,1,1,1,1,1,0,1,0,1,
    1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,
    1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1
  ],
  [
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
    1,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,1,
    1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,0,1,
    1,0,1,0,0,0,0,0,0,1,0,0,0,0,0,0,1,0,1,
    1,0,1,0,1,1,1,1,0,1,0,1,1,1,1,0,1,0,1,
    1,0,1,0,1,0,0,0,0,1,0,0,0,0,1,0,1,0,1,
    1,0,1,0,1,0,1,1,0,1,0,1,1,0,1,0,1,0,1,
    1,0,1,0,1,0,1,0,0,1,0,0,1,0,1,0,1,0,1,
    1,0,1,0,1,0,1,0,1,3,1,0,1,0,1,0,1,0,1,
    1,2,0,0,1,0,1,0,3,3,3,0,1,0,1,0,0,2,1,
    1,0,1,0,1,0,1,0,1,3,1,0,1,0,1,0,1,0,1,
    1,0,1,0,1,0,1,0,0,1,0,0,1,0,1,0,1,0,1,
    1,0,1,0,1,0,1,1,0,1,0,1,1,0,1,0,1,0,1,
    1,0,1,0,1,0,0,0,0,1,0,0,0,0,1,0,1,0,1,
    1,0,1,0,1,1,1,1,0,1,0,1,1,1,1,0,1,0,1,
    1,0,1,0,0,0,0,0,0,1,0,0,0,0,0,0,1,0,1,
    1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,0,1,
    1,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,1,
    1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1
  ],
  [
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
    1,2,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,2,1,
    1,0,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,0,1,
    1,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,1,
    1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1,
    1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,0,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,1,0,1,1,1,0,1,1,1,1,1,0,1,1,1,0,1,1,
    1,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,1,
    1,0,1,1,0,1,0,1,0,3,0,1,0,1,0,1,1,0,1,
    1,0,0,0,0,1,0,0,0,3,0,0,0,1,0,0,0,0,1,
    1,0,1,1,0,1,0,1,0,3,0,1,0,1,0,1,1,0,1,
    1,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,1,
    1,1,0,1,1,1,0,1,1,1,1,1,0,1,1,1,0,1,1,
    1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
    1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,0,1,
    1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1,
    1,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,1,
    1,0,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,0,1,
    1,2,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,2,1,
    1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1
  ]
];

function generateMap(levelNum) {
  const templateIndex = (levelNum - 1) % mapTemplates.length;
  let map = [...mapTemplates[templateIndex]];
  
  const variation = Math.floor((levelNum - 1) / mapTemplates.length);
  if (variation > 0) {
    for (let i = 0; i < map.length; i++) {
      if (map[i] === 0 && Math.random() < 0.05 * variation) {
        if (i % GRID_WIDTH !== 0 && i % GRID_WIDTH !== GRID_WIDTH - 1 &&
            Math.floor(i / GRID_WIDTH) !== 0 && Math.floor(i / GRID_WIDTH) !== GRID_HEIGHT - 1) {
          map[i] = 1;
        }
      }
    }
  }
  
  return map;
}

let layout = [];
let cells = [];
let pacman = { index: 0, direction: 'right', nextDirection: 'right' };
let ghosts = [];
let dotsRemaining = 0;

highscoreEl.textContent = highscore;

function showSpecialFeature() {
  const features = {
    10: "🍒 FRUIT BONUS! Collect fruits for extra points!",
    20: "⚡ SUPER SPEED! Power pellets give you super speed!",
    30: "👻 EXTRA GHOST! A 5th ghost joins the hunt!",
    40: "💎 MEGA BONUS! Double points for everything!",
    50: "🌟 INVINCIBILITY! Power pellets last longer!",
    60: "👾 GHOST SWARM! A 6th ghost appears!",
    70: "🎯 PRECISION MODE! Smarter ghost AI!",
    80: "🔥 FIRE MODE! Triple points!",
    90: "🏆 CHAMPIONSHIP! Maximum difficulty!",
    100: "🎉 FINAL CHALLENGE! Beat this to win!"
  };
  
  const feature = features[level];
  if (feature) {
    specialFeatureEl.setAttribute('data-text', feature);
    specialFeatureEl.textContent = feature;
    specialFeatureEl.style.display = 'block';
  } else {
    specialFeatureEl.style.display = 'none';
  }
}

function init() {
  layout = generateMap(level);
  cells = [];
  gameEl.innerHTML = '';
  
  showSpecialFeature();
  
  layout.forEach((val, i) => {
    const cell = document.createElement('div');
    cell.classList.add('cell');
    
    if (val === 1) {
      cell.classList.add('wall');
      if (level >= 40) cell.classList.add('mega');
      else if (level >= 30) cell.classList.add('bonus');
      else if (level >= 20) cell.classList.add('special');
    }
    else if (val === 0) cell.classList.add('dot');
    else if (val === 2) cell.classList.add('power-pellet');
    
    gameEl.appendChild(cell);
    cells.push(cell);
  });
  
  dotsRemaining = layout.filter(v => v === 0 || v === 2).length;
  
  if (level >= 10 && level % 10 !== 0) {
    const emptySpaces = layout.map((v, i) => v === 0 ? i : -1).filter(i => i !== -1);
    if (emptySpaces.length > 0) {
      const fruitIndex = emptySpaces[Math.floor(Math.random() * emptySpaces.length)];
      layout[fruitIndex] = 4;
      cells[fruitIndex].classList.remove('dot');
      cells[fruitIndex].classList.add('fruit');
      fruitPresent = true;
    }
  }
  
  pacman = {
    index: 19 * 17 + 9,
    direction: 'right',
    nextDirection: 'right',
    justAte: false
  };
  
  const baseSpeed = Math.max(300 - (level * 8), 80);
  const ghostCount = level >= 60 ? 6 : level >= 30 ? 5 : 4;
  const colors = ['red', 'pink', 'cyan', 'orange', 'purple', 'green'];
  
  ghosts = [];
  for (let i = 0; i < ghostCount; i++) {
    const startPositions = [19 * 9 + 9, 19 * 9 + 8, 19 * 9 + 10, 19 * 10 + 9, 19 * 9 + 7, 19 * 9 + 11];
    ghosts.push({
      index: startPositions[i],
      color: colors[i],
      direction: ['up', 'left', 'right', 'down', 'up', 'down'][i],
      speed: baseSpeed + (i * 30),
      scared: false,
      eaten: false
    });
  }
  
  updateLives();
  updateDisplay();
  showReady();
}

function showReady() {
  const ready = document.createElement('div');
  ready.id = 'ready-text';
  ready.textContent = level % 10 === 0 ? 'BONUS STAGE!' : 'READY!';
  gameContainer.appendChild(ready);
  
  playSound('levelComplete');
  
  setTimeout(() => {
    ready.remove();
    startGame();
  }, 2000);
}

function startGame() {
  gameActive = true;
  render();
  
  ghosts.forEach(ghost => {
    ghost.intervalId = setInterval(() => moveGhost(ghost), ghost.speed);
  });
}

function updateDisplay() {
  scoreEl.textContent = score;
  levelEl.textContent = level;
  
  if (score > highscore) {
    highscore = score;
    highscoreEl.textContent = highscore;
    localStorage.setItem('pacman-highscore', highscore);
  }
}

function updateLives() {
  livesEl.innerHTML = '';
  for (let i = 0; i < lives; i++) {
    const life = document.createElement('div');
    life.classList.add('life');
    livesEl.appendChild(life);
  }
}

function render() {
  cells.forEach((cell, index) => {
    cell.classList.remove('pacman', 'ghost', 'red', 'pink', 'cyan', 'orange', 'purple', 'green', 'scared', 'eaten', 'right', 'left', 'up', 'down', 'eating', 'super');
    
    if (layout[index] === 3) {
      cell.classList.remove('dot', 'power-pellet', 'fruit');
    }
  });
  
  const pacmanClasses = ['pacman', pacman.direction];
  if (superMode) pacmanClasses.push('super');
  if (gameActive) {
    pacmanClasses.push('eating');
  }
  cells[pacman.index].classList.add(...pacmanClasses);
  
  ghosts.forEach(ghost => {
    const classes = ['ghost', ghost.color];
    if (ghost.scared) classes.push('scared');
    if (ghost.eaten) classes.push('eaten');
    cells[ghost.index].classList.add(...classes);
  });
}

function canMove(index, direction) {
  let next = index;
  
  if (direction === 'left') next -= 1;
  else if (direction === 'right') next += 1;
  else if (direction === 'up') next -= GRID_WIDTH;
  else if (direction === 'down') next += GRID_WIDTH;
  
  if (next < 0 || next >= layout.length) return false;
  if (layout[next] === 1) return false;
  
  const currentRow = Math.floor(index / GRID_WIDTH);
  const nextRow = Math.floor(next / GRID_WIDTH);
  if ((direction === 'left' || direction === 'right') && currentRow !== nextRow) {
    return false;
  }
  
  return true;
}

function movePacman() {
  if (!gameActive) return;
  
  if (canMove(pacman.index, pacman.nextDirection)) {
    pacman.direction = pacman.nextDirection;
  }
  
  if (!canMove(pacman.index, pacman.direction)) {
    render();
    return;
  }
  
  let next = pacman.index;
  if (pacman.direction === 'left') next -= 1;
  else if (pacman.direction === 'right') next += 1;
  else if (pacman.direction === 'up') next -= GRID_WIDTH;
  else if (pacman.direction === 'down') next += GRID_WIDTH;
  
  pacman.index = next;
  
  const pointMultiplier = level >= 80 ? 3 : level >= 40 ? 2 : 1;
  
  if (layout[pacman.index] === 0) {
    layout[pacman.index] = 3;
    score += 10 * level * pointMultiplier;
    dotsRemaining--;
    pacman.justAte = true;
    updateDisplay();
    playSound('chomp');
  }
  else if (layout[pacman.index] === 2) {
    layout[pacman.index] = 3;
    score += 50 * level * pointMultiplier;
    dotsRemaining--;
    pacman.justAte = true;
    updateDisplay();
    playSound('powerPellet');
    activatePowerMode();
  }
  else if (layout[pacman.index] === 4) {
    layout[pacman.index] = 3;
    score += 500 * level * pointMultiplier;
    pacman.justAte = true;
    fruitPresent = false;
    updateDisplay();
    playSound('fruit');
  }
  
  checkGhostCollision();
  
  if (dotsRemaining === 0) {
    levelComplete();
  }
  
  render();
}

function activatePowerMode() {
  powerMode = true;
  superMode = level >= 20;
  
  ghosts.forEach(g => {
    if (!g.eaten) g.scared = true;
  });
  
  if (powerModeTimer) clearTimeout(powerModeTimer);
  const duration = level >= 50 ? 10000 : Math.max(7000 - (level * 80), 3000);
powerModeTimer = setTimeout(() => {
powerMode = false;
superMode = false;
ghosts.forEach(g => g.scared = false);
render();
}, duration);
}
function moveGhost(ghost) {
if (!gameActive || ghost.eaten) return;
const possibleDirections = ['left', 'right', 'up', 'down'].filter(dir => {
const opposite = {left: 'right', right: 'left', up: 'down', down: 'up'};
return dir !== opposite[ghost.direction] && canMove(ghost.index, dir);
});
if (possibleDirections.length === 0) {
possibleDirections.push(...['left', 'right', 'up', 'down'].filter(dir => canMove(ghost.index, dir)));
}
if (possibleDirections.length > 0) {
const smartChance = level >= 70 ? 0.7 : 0.3;
if (!ghost.scared && Math.random() > smartChance) {
  const distances = possibleDirections.map(dir => {
    let next = ghost.index;
    if (dir === 'left') next -= 1;
    else if (dir === 'right') next += 1;
    else if (dir === 'up') next -= GRID_WIDTH;
    else if (dir === 'down') next += GRID_WIDTH;
    
    const dx = (next % GRID_WIDTH) - (pacman.index % GRID_WIDTH);
    const dy = Math.floor(next / GRID_WIDTH) - Math.floor(pacman.index / GRID_WIDTH);
    return { dir, dist: Math.abs(dx) + Math.abs(dy) };
  });
  
  distances.sort((a, b) => a.dist - b.dist);
  ghost.direction = distances[0].dir;
} else {
  ghost.direction = possibleDirections[Math.floor(Math.random() * possibleDirections.length)];
}
}
if (canMove(ghost.index, ghost.direction)) {
let next = ghost.index;
if (ghost.direction === 'left') next -= 1;
else if (ghost.direction === 'right') next += 1;
else if (ghost.direction === 'up') next -= GRID_WIDTH;
else if (ghost.direction === 'down') next += GRID_WIDTH;
ghost.index = next;
}
checkGhostCollision();
render();
}
function checkGhostCollision() {
ghosts.forEach(ghost => {
if (ghost.index === pacman.index && !ghost.eaten) {
if (ghost.scared) {
ghost.eaten = true;
ghost.scared = false;
const pointMultiplier = level >= 80 ? 3 : level >= 40 ? 2 : 1;
score += 200 * level * pointMultiplier;
updateDisplay();
playSound('eatGhost');
    setTimeout(() => {
      ghost.eaten = false;
      ghost.index = 19 * 9 + 9;
    }, 5000);
  } else {
    die();
  }
}
});
}
function die() {
gameActive = false;
lives--;
updateLives();
playSound('death');
ghosts.forEach(g => {
clearInterval(g.intervalId);
});
if (powerModeTimer) clearTimeout(powerModeTimer);
powerMode = false;
superMode = false;
if (lives > 0) {
setTimeout(() => {
pacman.index = 19 * 17 + 9;
pacman.direction = 'right';
pacman.nextDirection = 'right';
pacman.justAte = false;
  const startPositions = [19 * 9 + 9, 19 * 9 + 8, 19 * 9 + 10, 19 * 10 + 9, 19 * 9 + 7, 19 * 9 + 11];
  ghosts.forEach((g, i) => {
    g.index = startPositions[i];
    g.scared = false;
    g.eaten = false;
  });
  
  showReady();
}, 1500);
} else {
gameOver();
}
}
function levelComplete() {
gameActive = false;
ghosts.forEach(g => clearInterval(g.intervalId));
if (powerModeTimer) clearTimeout(powerModeTimer);
const bonus = 1000 * level;
score += bonus;
updateDisplay();
playSound('levelComplete');
  const msg = document.createElement('div');
  msg.classList.add('message');
  msg.innerHTML = `
    <h2>LEVEL ${level} COMPLETE!</h2>
    <p>Bonus: ${bonus} points</p>
    <p>Get ready for Level ${level + 1}...</p>
    ${level % 10 === 9 ? '<p style="color:#ff00ff;">⭐ NEW FEATURE UNLOCKED NEXT LEVEL! ⭐</p>' : ''}
  `;
  gameContainer.appendChild(msg);
setTimeout(() => {
msg.remove();
level++;
if (level <= 100) {
init();
} else {
youWin();
}
}, 3000);
}
function gameOver() {
const msg = document.createElement('div');
msg.classList.add('message');
  msg.innerHTML = `
    <h2>GAME OVER</h2>
    <p>Final Score: ${score}</p>
    <p>Level Reached: ${level}</p>
    <p>High Score: ${highscore}</p>
    <button onclick="restart()">PLAY AGAIN</button>
  `;
  gameContainer.appendChild(msg);
}
function youWin() {
playSound('levelComplete');
const msg = document.createElement('div');
msg.classList.add('message');
  msg.innerHTML = `
    <h2>🎉 YOU WIN! 🎉</h2>
    <p>You completed all 100 levels!</p>
    <p>Final Score: ${score}</p>
    <p>High Score: ${highscore}</p>
    <button onclick="restart()">PLAY AGAIN</button>
  `;
  gameContainer.appendChild(msg);
}
function restart() {
score = 0;
level = 1;
lives = 3;
gameActive = false;
powerMode = false;
superMode = false;
fruitPresent = false;
document.querySelectorAll('.message').forEach(m => m.remove());
ghosts.forEach(g => {
if (g.intervalId) clearInterval(g.intervalId);
});
if (powerModeTimer) clearTimeout(powerModeTimer);
init();
}
function handleControl(direction) {
if (!gameActive) return;
pacman.nextDirection = direction;
}
window.addEventListener('keydown', (e) => {
if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
e.preventDefault();
}
if (!gameActive) return;
const key = e.key;
if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
pacman.nextDirection = 'left';
} else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
pacman.nextDirection = 'right';
} else if (key === 'ArrowUp' || key === 'w' || key === 'W') {
pacman.nextDirection = 'up';
} else if (key === 'ArrowDown' || key === 's' || key === 'S') {
pacman.nextDirection = 'down';
}
});
// Button controls event listeners
document.getElementById('btn-up').addEventListener('click', () => handleControl('up'));
document.getElementById('btn-down').addEventListener('click', () => handleControl('down'));
document.getElementById('btn-left').addEventListener('click', () => handleControl('left'));
document.getElementById('btn-right').addEventListener('click', () => handleControl('right'));
// Touch/Swipe controls for mobile
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

const minSwipeDistance = 30;

document.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
}, false);

document.addEventListener('touchend', (e) => {
  if (!gameActive) return;
  
  touchEndX = e.changedTouches[0].screenX;
  touchEndY = e.changedTouches[0].screenY;
  handleSwipe();
}, false);

function handleSwipe() {
  const diffX = touchEndX - touchStartX;
  const diffY = touchEndY - touchStartY;
  
  if (Math.abs(diffX) < minSwipeDistance && Math.abs(diffY) < minSwipeDistance) {
    return;
  }
  
  if (Math.abs(diffX) > Math.abs(diffY)) {
    if (diffX > 0) {
      pacman.nextDirection = 'right';
    } else {
      pacman.nextDirection = 'left';
    }
  } else {
    if (diffY > 0) {
      pacman.nextDirection = 'down';
    } else {
      pacman.nextDirection = 'up';
    }
  }
}

const moveSpeed = () => superMode ? 100 : 150;
let gameLoop;
function startGameLoop() {
  if (gameLoop) clearInterval(gameLoop);
  gameLoop = setInterval(() => {
    if (gameActive) movePacman();
  }, moveSpeed());
}
startGameLoop();
setInterval(() => {
  if (gameActive && superMode) startGameLoop();
}, 100);

// Create snowflakes
function createSnowflakes() {
  const snowflakeCount = 15;
  for (let i = 0; i < snowflakeCount; i++) {
    const snowflake = document.createElement('div');
    snowflake.classList.add('snowflake');
    snowflake.textContent = '❄';
    snowflake.style.left = Math.random() * 100 + '%';
    snowflake.style.animationDelay = Math.random() * 10 + 's';
    snowflake.style.animationDuration = (Math.random() * 5 + 8) + 's';
    snowflake.style.fontSize = (Math.random() * 0.5 + 0.5) + 'em';
    snowflake.style.opacity = Math.random() * 0.6 + 0.4;
    document.body.appendChild(snowflake);
  }
}

createSnowflakes();

init();