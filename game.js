const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlayText');

const WORLD = {
  width: canvas.width,
  height: canvas.height,
};

const ingredientPalette = [
  {
    id: 'steak',
    name: 'Steak',
    draw(x, y, size) {
      const unit = size / 16;
      ctx.fillStyle = '#522218';
      ctx.fillRect(x + unit * 2, y + unit * 6, unit * 12, unit * 6);
      ctx.fillStyle = '#8f3c29';
      ctx.fillRect(x + unit * 3, y + unit * 5, unit * 10, unit * 6);
      ctx.fillStyle = '#c4674a';
      ctx.fillRect(x + unit * 4, y + unit * 8, unit * 8, unit * 2);
    },
  },
  {
    id: 'potato',
    name: 'Potato',
    draw(x, y, size) {
      const unit = size / 16;
      ctx.fillStyle = '#7d5a32';
      ctx.fillRect(x + unit * 3, y + unit * 6, unit * 10, unit * 6);
      ctx.fillStyle = '#b98a54';
      ctx.fillRect(x + unit * 4, y + unit * 7, unit * 8, unit * 4);
    },
  },
  {
    id: 'carrot',
    name: 'Carrot',
    draw(x, y, size) {
      const unit = size / 16;
      ctx.fillStyle = '#d0571b';
      ctx.fillRect(x + unit * 6, y + unit * 4, unit * 4, unit * 10);
      ctx.fillStyle = '#f98532';
      ctx.fillRect(x + unit * 6, y + unit * 6, unit * 4, unit * 6);
      ctx.fillStyle = '#3f7f39';
      ctx.fillRect(x + unit * 5, y + unit * 2, unit * 6, unit * 3);
    },
  },
  {
    id: 'mushroom',
    name: 'Mushroom',
    draw(x, y, size) {
      const unit = size / 16;
      ctx.fillStyle = '#952c3b';
      ctx.fillRect(x + unit * 2, y + unit * 4, unit * 12, unit * 4);
      ctx.fillStyle = '#c85a6a';
      ctx.fillRect(x + unit * 4, y + unit * 5, unit * 8, unit * 3);
      ctx.fillStyle = '#d6c9a5';
      ctx.fillRect(x + unit * 6, y + unit * 8, unit * 4, unit * 6);
    },
  },
  {
    id: 'wheat',
    name: 'Wheat',
    draw(x, y, size) {
      const unit = size / 16;
      ctx.fillStyle = '#b48a34';
      ctx.fillRect(x + unit * 6, y + unit * 4, unit * 4, unit * 10);
      ctx.fillRect(x + unit * 4, y + unit * 6, unit * 8, unit * 8);
      ctx.fillStyle = '#f3d36b';
      ctx.fillRect(x + unit * 5, y + unit * 6, unit * 6, unit * 6);
    },
  },
  {
    id: 'sugar',
    name: 'Sugar',
    draw(x, y, size) {
      const unit = size / 16;
      ctx.fillStyle = '#c2c9d7';
      ctx.fillRect(x + unit * 5, y + unit * 4, unit * 6, unit * 8);
      ctx.fillStyle = '#f8fbff';
      ctx.fillRect(x + unit * 6, y + unit * 5, unit * 4, unit * 6);
    },
  },
  {
    id: 'egg',
    name: 'Egg',
    draw(x, y, size) {
      const unit = size / 16;
      ctx.fillStyle = '#ede7d0';
      ctx.fillRect(x + unit * 6, y + unit * 5, unit * 4, unit * 6);
      ctx.fillStyle = '#fff8e7';
      ctx.fillRect(x + unit * 6, y + unit * 6, unit * 4, unit * 4);
    },
  },
  {
    id: 'pumpkin',
    name: 'Pumpkin',
    draw(x, y, size) {
      const unit = size / 16;
      ctx.fillStyle = '#8e4811';
      ctx.fillRect(x + unit * 3, y + unit * 5, unit * 10, unit * 8);
      ctx.fillStyle = '#d16f1d';
      ctx.fillRect(x + unit * 4, y + unit * 6, unit * 8, unit * 6);
      ctx.fillStyle = '#2f6a2c';
      ctx.fillRect(x + unit * 7, y + unit * 3, unit * 2, unit * 2);
    },
  },
  {
    id: 'bowl',
    name: 'Bowl',
    draw(x, y, size) {
      const unit = size / 16;
      ctx.fillStyle = '#3d2415';
      ctx.fillRect(x + unit * 4, y + unit * 9, unit * 8, unit * 4);
      ctx.fillStyle = '#6e3c1f';
      ctx.fillRect(x + unit * 5, y + unit * 8, unit * 6, unit * 3);
    },
  },
];

const ingredientLookup = Object.fromEntries(
  ingredientPalette.map((ingredient) => [ingredient.id, ingredient])
);

const recipes = [
  { name: 'Cooked Steak', ingredients: { steak: 1, mushroom: 1 } },
  { name: 'Pumpkin Pie', ingredients: { pumpkin: 1, egg: 1, sugar: 1 } },
  { name: 'Rabbit Stew', ingredients: { carrot: 1, potato: 1, mushroom: 1, bowl: 1 } },
  { name: 'Bread', ingredients: { wheat: 3 } },
  { name: 'Beetroot Broth', ingredients: { mushroom: 1, bowl: 1, potato: 1 } },
  { name: 'Farmers Feast', ingredients: { steak: 1, carrot: 1, wheat: 1, potato: 1 } },
];

const zombieNoises = ['Ghhrrr...', 'Braaaains?', 'Mmmmmm...', 'Urghhh', 'Blargg!'];

let gameState = 'title';
let lastTimestamp = 0;
let currentRecipe = null;
let ingredientProgress = {};
let timer = 0;
let round = 0;
let score = 0;
let timeLimit = 24;

let zombieX = 220;
let zombieY = 96;
let zombieDir = -1;
let zombieNoiseTimer = 0;
let zombieNoise = '';
let zombieNoiseDisplay = 0;

const ingredientSize = 32;
const ingredientCols = 3;
const ingredientSpacing = 12;
const ingredientStart = {
  x: 24,
  y: 156,
};

const ingredientSlots = ingredientPalette.map((ingredient, index) => {
  const col = index % ingredientCols;
  const row = Math.floor(index / ingredientCols);
  return {
    id: ingredient.id,
    x: ingredientStart.x + col * (ingredientSize + ingredientSpacing),
    y: ingredientStart.y + row * (ingredientSize + 8),
    size: ingredientSize,
  };
});

function resetGame() {
  score = 0;
  round = 0;
  timeLimit = 24;
  zombieX = 220;
  zombieDir = -1;
  zombieNoise = '';
  zombieNoiseDisplay = 0;
  startNextRecipe();
}

function startNextRecipe() {
  round += 1;
  const recipeIndex = Math.floor(Math.random() * recipes.length);
  currentRecipe = recipes[recipeIndex];
  ingredientProgress = {};
  Object.keys(currentRecipe.ingredients).forEach((key) => {
    ingredientProgress[key] = currentRecipe.ingredients[key];
  });
  timeLimit = Math.max(10, 24 - (round - 1) * 1.5);
  timer = timeLimit;
}

function allIngredientsComplete() {
  return Object.values(ingredientProgress).every((count) => count <= 0);
}

function handleIngredient(id) {
  if (!currentRecipe || !ingredientProgress[id]) {
    // Wrong ingredient, small penalty
    timer = Math.max(0, timer - 1);
    return;
  }
  ingredientProgress[id] -= 1;
  if (allIngredientsComplete()) {
    const basePoints = 150;
    const bonus = Math.floor((timer / timeLimit) * 100);
    score += basePoints + bonus * round;
    timer = 0; // trigger immediate next round in update
  }
}

function pointerPosition(evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY,
  };
}

canvas.addEventListener('pointerdown', (evt) => {
  const pos = pointerPosition(evt);
  if (gameState === 'title') {
    gameState = 'playing';
    overlay.textContent = '';
    resetGame();
    return;
  }
  if (gameState === 'gameover') {
    gameState = 'playing';
    overlay.textContent = '';
    resetGame();
    return;
  }
  if (gameState !== 'playing') {
    return;
  }

  for (const slot of ingredientSlots) {
    if (
      pos.x >= slot.x &&
      pos.x <= slot.x + slot.size &&
      pos.y >= slot.y &&
      pos.y <= slot.y + slot.size
    ) {
      handleIngredient(slot.id);
      break;
    }
  }
});

function update(delta) {
  if (gameState !== 'playing') {
    return;
  }

  timer -= delta;
  if (timer <= 0) {
    if (allIngredientsComplete()) {
      startNextRecipe();
    } else {
      gameState = 'gameover';
      overlay.textContent = `Service over! Final score: ${score}\nTap or click to restart.`;
      return;
    }
  }

  // Zombie wandering
  zombieX += zombieDir * delta * 24;
  if (zombieX < 200) {
    zombieX = 200;
    zombieDir = 1;
  } else if (zombieX > 260) {
    zombieX = 260;
    zombieDir = -1;
  }

  zombieNoiseTimer -= delta;
  if (zombieNoiseTimer <= 0) {
    zombieNoise = zombieNoises[Math.floor(Math.random() * zombieNoises.length)];
    zombieNoiseDisplay = 1.5;
    zombieNoiseTimer = 2 + Math.random() * 3;
  } else if (zombieNoiseDisplay > 0) {
    zombieNoiseDisplay -= delta;
    if (zombieNoiseDisplay <= 0) {
      zombieNoise = '';
    }
  }
}

function drawKitchen() {
  // Floor planks
  for (let y = 120; y < WORLD.height; y += 16) {
    for (let x = 0; x < WORLD.width; x += 16) {
      ctx.fillStyle = (x / 16 + y / 16) % 2 === 0 ? '#6b4a2f' : '#7d5b3d';
      ctx.fillRect(x, y, 16, 16);
    }
  }

  // Walls
  ctx.fillStyle = '#6f6f7d';
  ctx.fillRect(0, 0, WORLD.width, 80);
  for (let y = 0; y < 80; y += 16) {
    for (let x = 0; x < WORLD.width; x += 16) {
      ctx.fillStyle = '#5c5c69';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#7a7a8a';
      ctx.fillRect(x + 4, y + 4, 8, 8);
    }
  }

  // Window
  ctx.fillStyle = '#1f3b66';
  ctx.fillRect(120, 20, 80, 40);
  ctx.fillStyle = '#b0c8df';
  ctx.fillRect(124, 24, 72, 32);
  ctx.fillStyle = '#6c88a6';
  ctx.fillRect(124, 36, 72, 4);
  ctx.fillRect(156, 24, 4, 32);

  // Chests
  drawChest(40, 128);
  drawChest(WORLD.width - 72, 128);

  // Stove counter
  ctx.fillStyle = '#3a3a42';
  ctx.fillRect(96, 128, 128, 32);
  ctx.fillStyle = '#2b2b33';
  ctx.fillRect(96, 128, 128, 12);
  ctx.fillStyle = '#1c1c22';
  ctx.fillRect(96, 140, 64, 20);
  ctx.fillRect(160, 140, 64, 20);

  // Stove burners
  const t = Date.now() * 0.004;
  const flicker = 6 + Math.sin(t) * 3;
  ctx.fillStyle = '#400707';
  ctx.fillRect(104, 132, 40, 20);
  ctx.fillRect(184, 132, 40, 20);
  ctx.fillStyle = '#b10b0b';
  ctx.fillRect(110, 136, 28, 12);
  ctx.fillRect(190, 136, 28, 12);
  ctx.fillStyle = `rgba(255, 96, 0, 0.7)`;
  ctx.fillRect(110, 136, 28, flicker);

  // Pan
  ctx.fillStyle = '#2f2f35';
  ctx.fillRect(176, 110, 48, 10);
  ctx.fillStyle = '#1f1f24';
  ctx.fillRect(176, 104, 48, 6);
  ctx.fillStyle = '#55555c';
  ctx.fillRect(172, 100, 40, 8);
}

function drawChest(x, y) {
  ctx.fillStyle = '#7f511d';
  ctx.fillRect(x, y, 48, 40);
  ctx.fillStyle = '#9c682c';
  ctx.fillRect(x + 4, y + 4, 40, 16);
  ctx.fillStyle = '#d5a054';
  ctx.fillRect(x + 4, y + 20, 40, 16);
  ctx.fillStyle = '#2a1a07';
  ctx.fillRect(x + 20, y + 14, 8, 12);
}

function drawGordon(x, y) {
  const unit = 4;
  // Legs
  ctx.fillStyle = '#2c2c33';
  ctx.fillRect(x + unit * 2, y + unit * 8, unit * 2, unit * 4);
  ctx.fillRect(x + unit * 4, y + unit * 8, unit * 2, unit * 4);
  // Shoes
  ctx.fillStyle = '#111116';
  ctx.fillRect(x + unit * 2, y + unit * 12, unit * 2, unit);
  ctx.fillRect(x + unit * 4, y + unit * 12, unit * 2, unit);
  // Torso
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(x + unit, y + unit * 4, unit * 6, unit * 4);
  ctx.fillStyle = '#e1e1e1';
  ctx.fillRect(x + unit * 2, y + unit * 5, unit * 4, unit * 3);
  // Arms
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(x, y + unit * 5, unit, unit * 3);
  ctx.fillRect(x + unit * 7, y + unit * 5, unit, unit * 3);
  // Hands
  ctx.fillStyle = '#f3c8a2';
  ctx.fillRect(x, y + unit * 8, unit, unit);
  ctx.fillRect(x + unit * 7, y + unit * 8, unit, unit);
  // Head
  ctx.fillStyle = '#f3c8a2';
  ctx.fillRect(x + unit * 2, y + unit * 2, unit * 4, unit * 3);
  // Hair
  ctx.fillStyle = '#f8d34c';
  ctx.fillRect(x + unit * 2, y + unit, unit * 4, unit);
  ctx.fillRect(x + unit * 1, y + unit * 2, unit * 6, unit);
  // Eyes
  ctx.fillStyle = '#1f1f1f';
  ctx.fillRect(x + unit * 3, y + unit * 3, unit, unit / 2);
  ctx.fillRect(x + unit * 5, y + unit * 3, unit, unit / 2);
  // Mouth
  ctx.fillRect(x + unit * 3, y + unit * 4, unit * 2, unit / 2);
  // Spatula
  ctx.fillStyle = '#9ea6b5';
  ctx.fillRect(x + unit * 8, y + unit * 4, unit * 2, unit);
  ctx.fillStyle = '#d0d7e7';
  ctx.fillRect(x + unit * 8, y + unit * 4, unit * 2, unit / 2);
  ctx.fillStyle = '#555b65';
  ctx.fillRect(x + unit * 8, y + unit * 5, unit, unit * 2);
}

function drawZombie(x, y) {
  const unit = 4;
  // Legs
  ctx.fillStyle = '#2c4a2c';
  ctx.fillRect(x + unit * 2, y + unit * 8, unit * 2, unit * 4);
  ctx.fillRect(x + unit * 4, y + unit * 8, unit * 2, unit * 4);
  // Shoes
  ctx.fillStyle = '#0f1c0f';
  ctx.fillRect(x + unit * 2, y + unit * 12, unit * 2, unit);
  ctx.fillRect(x + unit * 4, y + unit * 12, unit * 2, unit);
  // Torso
  ctx.fillStyle = '#d9e0e9';
  ctx.fillRect(x + unit, y + unit * 4, unit * 6, unit * 4);
  ctx.fillStyle = '#c5ccd5';
  ctx.fillRect(x + unit * 2, y + unit * 5, unit * 4, unit * 2);
  // Arms
  ctx.fillStyle = '#d9e0e9';
  ctx.fillRect(x, y + unit * 5, unit, unit * 3);
  ctx.fillRect(x + unit * 7, y + unit * 5, unit, unit * 3);
  // Hands
  ctx.fillStyle = '#7cbc60';
  ctx.fillRect(x, y + unit * 8, unit, unit);
  ctx.fillRect(x + unit * 7, y + unit * 8, unit, unit);
  // Head
  ctx.fillStyle = '#7cbc60';
  ctx.fillRect(x + unit * 2, y + unit * 2, unit * 4, unit * 3);
  ctx.fillStyle = '#94d178';
  ctx.fillRect(x + unit * 2, y + unit * 2, unit * 4, unit);
  // Hat
  ctx.fillStyle = '#f0f4ff';
  ctx.fillRect(x + unit * 2, y, unit * 4, unit * 2);
  ctx.fillStyle = '#d2d8e6';
  ctx.fillRect(x + unit * 2, y + unit, unit * 4, unit / 2);
  // Eyes
  ctx.fillStyle = '#1f1f1f';
  ctx.fillRect(x + unit * 3, y + unit * 3, unit, unit / 2);
  ctx.fillRect(x + unit * 5, y + unit * 3, unit, unit / 2);
  // Mouth
  ctx.fillStyle = '#432626';
  ctx.fillRect(x + unit * 3, y + unit * 4, unit * 2, unit / 2);
}

function drawIngredientTray() {
  ctx.fillStyle = '#26262e';
  ctx.fillRect(12, 148, 120, 76);
  ctx.fillStyle = '#1a1a20';
  ctx.fillRect(12, 148, 120, 12);

  ingredientSlots.forEach((slot) => {
    const ingredient = ingredientLookup[slot.id];
    const needed = ingredientProgress[slot.id] || 0;
    ctx.fillStyle = '#151519';
    ctx.fillRect(slot.x - 2, slot.y - 2, slot.size + 4, slot.size + 4);
    ctx.fillStyle = needed > 0 ? '#2d2d35' : '#1d1d24';
    ctx.fillRect(slot.x, slot.y, slot.size, slot.size);
    ingredient.draw(slot.x, slot.y, slot.size);
    if (needed > 0) {
      ctx.fillStyle = '#fff5c7';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText(`x${needed}`, slot.x + 4, slot.y + slot.size - 6);
    }
  });
}

function drawHud() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, WORLD.width, 32);

  ctx.fillStyle = '#fff5c7';
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.fillText(`Score ${score}`, 8, 14);
  ctx.fillText(`Round ${round}`, 8, 26);

  if (currentRecipe) {
    ctx.textAlign = 'center';
    ctx.fillText(currentRecipe.name, WORLD.width / 2, 14);
    ctx.textAlign = 'left';
  }

  // Timer bar
  if (gameState === 'playing') {
    const width = 100;
    const height = 6;
    const x = WORLD.width - width - 12;
    const y = 12;
    ctx.fillStyle = '#222';
    ctx.fillRect(x, y, width, height);
    const pct = Math.max(0, Math.min(1, timer / timeLimit));
    const color = pct > 0.5 ? '#5cf264' : pct > 0.25 ? '#f2d45c' : '#f25c5c';
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, (width - 2) * pct, height - 2);
  }
}

function drawZombieSpeech(x, y) {
  if (!zombieNoise) {
    return;
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(x - 4, y - 28, 72, 24);
  ctx.fillStyle = '#fff5c7';
  ctx.font = '6px "Press Start 2P", monospace';
  ctx.fillText(zombieNoise, x, y - 12);
}

function render() {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, WORLD.width, WORLD.height);
  drawKitchen();
  drawGordon(120, 96);
  drawZombie(zombieX, zombieY);
  drawZombieSpeech(zombieX, zombieY);
  drawIngredientTray();
  drawHud();

  if (gameState === 'title') {
    overlay.textContent =
      'Welcome to Gordon\'s Blocky Kitchen!\nHelp Gordon cook Minecraft dishes before time runs out.\nTap or click ingredients to complete recipes.';
  }
}

function loop(timestamp) {
  const delta = (timestamp - lastTimestamp) / 1000 || 0;
  lastTimestamp = timestamp;
  update(delta);
  render();
  requestAnimationFrame(loop);
}

function resizeCanvas() {
  const scale = Math.min(
    window.innerWidth / canvas.width,
    window.innerHeight / canvas.height
  );
  canvas.style.width = `${canvas.width * scale}px`;
  canvas.style.height = `${canvas.height * scale}px`;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
requestAnimationFrame(loop);
