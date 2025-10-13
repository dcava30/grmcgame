(() => {
  const GAME_WIDTH = 960;
  const GAME_HEIGHT = 540;
  const MAX_ACTIVE_ORDERS = 4;
  const ORDER_SPAWN_DELAY = 14000;
  const ZOMBIE_CHAT_INTERVAL = 6000;
  const PLAYER_SPEED = 130;

  const DIFFICULTY_POINTS = {
    easy: 6,
    medium: 10,
    hard: 16,
  };

  const DIFFICULTY_LABELS = {
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard',
  };

  const PALETTE = {
    floor: 0x3a4a5d,
    counter: 0x1f2732,
    highlight: 0xf7e3a3,
    shadow: 0x07090f,
    accent: 0x6fd0c5,
    stove: 0x303f4f,
    cauldron: 0x36495b,
  };

  const INGREDIENTS = {
    beef: {
      label: 'Prime Beef',
      color: 0xb4533c,
      requiresPrep: true,
      cookType: 'skillet',
    },
    potato: {
      label: 'Golden Potato',
      color: 0xc7a650,
      requiresPrep: true,
      cookType: 'cauldron',
    },
    carrot: {
      label: 'Crimson Carrot',
      color: 0xe87d3a,
      requiresPrep: true,
      cookType: 'cauldron',
    },
    mushroom: {
      label: 'Red Mushroom',
      color: 0xc34242,
      requiresPrep: false,
      cookType: 'skillet',
    },
    fish: {
      label: 'Cod Fillet',
      color: 0x6fb5d5,
      requiresPrep: true,
      cookType: 'skillet',
    },
    kelp: {
      label: 'Sea Kelp',
      color: 0x3d9b6e,
      requiresPrep: false,
      cookType: 'cauldron',
    },
    wheat: {
      label: 'Wheat Grain',
      color: 0xd2c178,
      requiresPrep: false,
      cookType: 'skillet',
    },
    egg: {
      label: 'Hen Egg',
      color: 0xf0ead2,
      requiresPrep: false,
      cookType: 'skillet',
    },
  };

  const RECIPES = [
    {
      key: 'farmers-dawn-fry',
      name: "Farmer's Dawn Fry",
      difficulty: 'easy',
      points: DIFFICULTY_POINTS.easy,
      timeLimit: 90,
      ingredients: ['egg', 'wheat'],
      description: 'Sunrise skillet with fluffy toast and fried egg',
    },
    {
      key: 'kelp-crisp-bowl',
      name: 'Kelp Crisp Bowl',
      difficulty: 'easy',
      points: DIFFICULTY_POINTS.easy,
      timeLimit: 85,
      ingredients: ['kelp', 'mushroom'],
      description: 'Cauldron-tossed kelp with seared mushrooms',
    },
    {
      key: 'stonecutter-skillet',
      name: 'Stonecutter Skillet',
      difficulty: 'medium',
      points: DIFFICULTY_POINTS.medium,
      timeLimit: 95,
      ingredients: ['potato', 'carrot', 'mushroom'],
      description: 'Roasted garden veggies with a skillet char',
    },
    {
      key: 'oceanic-kelp-roll',
      name: 'Oceanic Kelp Roll',
      difficulty: 'medium',
      points: DIFFICULTY_POINTS.medium,
      timeLimit: 100,
      ingredients: ['fish', 'kelp', 'carrot'],
      description: 'Crisp kelp wrap stuffed with sizzling cod',
    },
    {
      key: 'blocky-beef-stew',
      name: 'Blocky Beef Stew',
      difficulty: 'hard',
      points: DIFFICULTY_POINTS.hard,
      timeLimit: 110,
      ingredients: ['beef', 'carrot', 'potato', 'mushroom'],
      description: 'Hearty cauldron stew packed with hearty veg',
    },
    {
      key: 'nether-skewer',
      name: 'Nether Skillet Skewer',
      difficulty: 'hard',
      points: DIFFICULTY_POINTS.hard,
      timeLimit: 115,
      ingredients: ['beef', 'fish', 'wheat', 'kelp'],
      description: 'Flame-kissed surf and turf stacked on skewers',
    },
  ];

  const LEVELS = [
    {
      id: 1,
      name: 'Level 1: Tutorial Service',
      duration: 180,
      targetScore: 32,
      introText: 'Tutorial: plate one easy, medium, and hard recipe to earn 32 points.',
      orderInterval: 13000,
      initialOrders: 3,
      allowRandomOrders: false,
      allowedDifficulties: ['easy', 'medium', 'hard'],
      scriptedOrderKeys: ['farmers-dawn-fry', 'stonecutter-skillet', 'blocky-beef-stew'],
    },
    {
      id: 2,
      name: 'Level 2: Dinner Rush',
      duration: 240,
      targetScore: 100,
      introText: 'Dinner rush! Keep dishes flying to reach 100 points.',
      orderInterval: 11000,
      initialOrders: 3,
      allowRandomOrders: true,
      allowedDifficulties: ['easy', 'medium', 'hard'],
    },
    {
      id: 3,
      name: 'Level 3: Chef Showdown',
      duration: 240,
      targetScore: 130,
      introText: 'Finale: Gordon needs 130 points before the shift ends!',
      orderInterval: 9000,
      initialOrders: 3,
      allowRandomOrders: true,
      allowedDifficulties: ['easy', 'medium', 'hard'],
    },
  ];

  const ZOMBIE_CHATTER = [
    'Graaaains...',
    'Braaains à la mode!',
    'Uhhh... chef?',
    'Szzz sizzling...',
    'Mmm... crunchy blocks.',
    'Ungh, order up?'
  ];

  function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  class BootScene extends Phaser.Scene {
    constructor() {
      super('BootScene');
    }

    preload() {
      const g = this.add.graphics();

      g.fillStyle(PALETTE.floor, 1);
      g.fillRect(0, 0, 32, 32);
      g.fillStyle(PALETTE.floor + 0x111111, 1);
      g.fillRect(0, 0, 12, 12);
      g.fillRect(20, 20, 12, 12);
      g.generateTexture('tile-floor', 32, 32);
      g.clear();

      g.fillStyle(PALETTE.counter, 1);
      g.fillRect(0, 0, 48, 48);
      g.fillStyle(PALETTE.shadow, 1);
      g.fillRect(0, 36, 48, 12);
      g.fillStyle(PALETTE.highlight, 1);
      g.fillRect(4, 4, 40, 20);
      g.generateTexture('station-counter', 48, 48);
      g.clear();

      g.fillStyle(PALETTE.stove, 1);
      g.fillRect(0, 0, 48, 48);
      g.fillStyle(0x222836, 1);
      g.fillRect(0, 36, 48, 12);
      g.fillStyle(0xeb5757, 1);
      g.fillCircle(16, 18, 10);
      g.fillStyle(0xfff0c2, 1);
      g.fillCircle(32, 18, 10);
      g.generateTexture('station-skillet', 48, 48);
      g.clear();

      g.fillStyle(PALETTE.cauldron, 1);
      g.fillRect(0, 0, 48, 48);
      g.fillStyle(0x22313f, 1);
      g.fillRect(0, 36, 48, 12);
      g.fillStyle(0x4fb085, 1);
      g.fillRect(4, 12, 40, 16);
      g.generateTexture('station-cauldron', 48, 48);
      g.clear();

      g.fillStyle(0x252a33, 1);
      g.fillRect(0, 0, 48, 48);
      g.fillStyle(0xd8c48c, 1);
      g.fillRect(4, 4, 40, 12);
      g.fillStyle(0x1a2027, 1);
      g.fillRect(4, 16, 40, 12);
      g.generateTexture('station-prep', 48, 48);
      g.clear();

      g.fillStyle(0x25292f, 1);
      g.fillRect(0, 0, 48, 48);
      g.fillStyle(0xf6de9c, 1);
      g.fillRect(4, 4, 40, 24);
      g.fillStyle(0x2f353b, 1);
      g.fillRect(0, 36, 48, 12);
      g.generateTexture('station-plating', 48, 48);
      g.clear();

      g.fillStyle(0x3d4a5c, 1);
      g.fillRect(0, 0, 20, 28);
      g.fillStyle(0xf1d0a5, 1);
      g.fillRect(4, 2, 12, 8);
      g.fillStyle(0xc7432f, 1);
      g.fillRect(2, 10, 16, 12);
      g.fillStyle(0x2b3342, 1);
      g.fillRect(4, 20, 12, 8);
      g.generateTexture('gordon', 20, 28);
      g.clear();

      g.fillStyle(0x2f3c45, 1);
      g.fillRect(0, 0, 20, 28);
      g.fillStyle(0x7ba15f, 1);
      g.fillRect(2, 10, 16, 12);
      g.fillStyle(0xb8d38a, 1);
      g.fillRect(4, 2, 12, 8);
      g.fillStyle(0x1a232b, 1);
      g.fillRect(4, 20, 12, 8);
      g.generateTexture('zombie', 20, 28);
      g.clear();

      g.fillStyle(PALETTE.shadow, 0.5);
      g.fillRect(0, 0, 24, 8);
      g.generateTexture('shadow', 24, 8);
      g.clear();

      Object.entries(INGREDIENTS).forEach(([key, config]) => {
        g.fillStyle(0x12151c, 1);
        g.fillRect(0, 0, 20, 20);
        g.fillStyle(config.color, 1);
        g.fillRect(2, 2, 16, 16);
        g.generateTexture(`ingredient-${key}`, 20, 20);
        g.clear();
      });

      g.destroy();
    }

    create() {
      this.scene.start('GameScene', { levelIndex: 0 });
    }
  }

  class GameScene extends Phaser.Scene {
    constructor() {
      super('GameScene');
      this.levelIndex = 0;
      this.levelConfig = LEVELS[this.levelIndex];
      this.levelDuration = this.levelConfig.duration;
      this.levelTimeRemaining = this.levelDuration;
      this.score = 0;
      this.completedOrders = 0;
      this.failedOrders = 0;
      this.activeOrders = [];
      this.playerItem = null;
      this.playerTarget = null;
      this.currentAction = null;
      this.actionMeter = null;
    }

    init(data) {
      this.levelIndex = Phaser.Math.Clamp(data?.levelIndex ?? 0, 0, LEVELS.length - 1);
      this.levelConfig = LEVELS[this.levelIndex];
    }

    create() {
      this.levelDuration = this.levelConfig.duration;
      this.levelTimeRemaining = this.levelDuration;
      this.score = 0;
      this.completedOrders = 0;
      this.failedOrders = 0;
      this.activeOrders = [];
      this.playerItem = null;
      this.playerTarget = null;
      this.currentAction = null;
      this.serviceOver = false;
      this.levelTargetScore = this.levelConfig.targetScore ?? 0;
      this.allowRandomOrders = this.levelConfig.allowRandomOrders !== false;
      this.scriptedOrders = [];
      if (this.levelConfig.scriptedOrderKeys) {
        this.scriptedOrders = this.levelConfig.scriptedOrderKeys
          .map((key) => RECIPES.find((recipe) => recipe.key === key))
          .filter(Boolean);
      }

      this.createWorld();
      this.createPlayer();
      this.createZombie();
      this.createStations();
      this.createInputHandlers();
      this.createEvents();

      const spawnDelay = this.levelConfig.orderInterval ?? ORDER_SPAWN_DELAY;
      this.time.addEvent({ delay: spawnDelay, loop: true, callback: () => this.spawnOrder() });
      this.spawnInitialOrders();

      this.scene.launch('UIScene', {
        duration: this.levelDuration,
        levelIndex: this.levelIndex,
        totalLevels: LEVELS.length,
        levelName: this.levelConfig.name,
        targetScore: this.levelTargetScore,
        introText: this.levelConfig.introText,
      });
      this.events.emit('score-changed', this.score);
      this.events.emit('inventory-changed', this.playerItem);
      this.events.emit('orders-updated', this.activeOrders);
      this.events.emit('level-started', {
        index: this.levelIndex,
        targetScore: this.levelTargetScore,
        duration: this.levelDuration,
      });
    }

    spawnInitialOrders() {
      const initialCount = this.levelConfig.initialOrders ?? 2;
      for (let i = 0; i < initialCount; i += 1) {
        this.time.delayedCall(600 * (i + 1), () => this.spawnOrder());
      }
    }

    createWorld() {
      const margin = 24;
      const width = GAME_WIDTH - margin * 2;
      const height = GAME_HEIGHT - margin * 2;

      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, PALETTE.shadow, 0.75);
      const floor = this.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, width, height, 'tile-floor');
      floor.setTint(0xffffff);

      this.physics.world.setBounds(margin, margin, width, height);

      const border = this.add.graphics();
      border.lineStyle(4, 0x090b10, 1);
      border.strokeRoundedRect(margin - 8, margin - 8, width + 16, height + 16, 18);
    }

    createPlayer() {
      this.player = this.physics.add.sprite(200, GAME_HEIGHT / 2, 'gordon');
      this.player.setDepth(5);
      this.player.setCollideWorldBounds(true);
      this.player.setOrigin(0.5, 0.8);
      this.playerSpeed = PLAYER_SPEED;

      this.playerShadow = this.add.image(this.player.x, this.player.y + 10, 'shadow').setDepth(1);
      this.playerShadow.setScale(1.2, 1.1);

      this.inventoryIcon = this.add.image(this.player.x, this.player.y - 40, 'ingredient-beef').setDepth(7);
      this.inventoryIcon.setVisible(false);
    }

    createZombie() {
      this.zombie = this.physics.add.sprite(720, GAME_HEIGHT / 2, 'zombie');
      this.zombie.setCollideWorldBounds(true);
      this.zombie.setOrigin(0.5, 0.8);
      this.zombie.setDepth(4);
      this.zombieShadow = this.add.image(this.zombie.x, this.zombie.y + 10, 'shadow').setDepth(1);

      this.zombieTarget = new Phaser.Math.Vector2(this.zombie.x, this.zombie.y);
      this.time.addEvent({ delay: 4500, loop: true, callback: () => this.pickZombieDestination() });
      this.time.addEvent({ delay: ZOMBIE_CHAT_INTERVAL, loop: true, callback: () => this.makeZombieTalk() });

      this.zombieSpeech = this.add.text(this.zombie.x, this.zombie.y - 52, '', {
        fontFamily: 'Press Start 2P',
        fontSize: '12px',
        align: 'center',
        color: '#f4f0da',
        stroke: '#111214',
        strokeThickness: 4,
      }).setDepth(8).setOrigin(0.5, 1);
    }

    createStations() {
      this.stations = [];

      const stationData = {
        crates: [
          { key: 'beef', x: 150, y: 150 },
          { key: 'potato', x: 150, y: 240 },
          { key: 'carrot', x: 150, y: 330 },
          { key: 'mushroom', x: 230, y: 190 },
          { key: 'fish', x: 230, y: 280 },
          { key: 'kelp', x: 230, y: 370 },
          { key: 'wheat', x: 310, y: 210 },
          { key: 'egg', x: 310, y: 300 },
        ],
        prep: [
          { x: 420, y: 160 },
          { x: 420, y: 320 },
        ],
        cook: [
          { x: 560, y: 160, type: 'skillet' },
          { x: 560, y: 320, type: 'cauldron' },
          { x: 640, y: 160, type: 'skillet' },
          { x: 640, y: 320, type: 'cauldron' },
        ],
        plating: [{ x: 810, y: 240 }],
      };

      stationData.crates.forEach((crate) => this.createIngredientCrate(crate));
      stationData.prep.forEach((prepStation) => this.createPrepStation(prepStation));
      stationData.cook.forEach((cookStation) => this.createCookStation(cookStation));
      stationData.plating.forEach((platingStation) => this.createPlatingStation(platingStation));
    }

    createIngredientCrate({ key, x, y }) {
      const container = this.add.container(x, y);
      const body = this.add.image(0, 0, 'station-counter');
      const icon = this.add.image(0, -24, `ingredient-${key}`);
      const label = this.add.text(0, 30, INGREDIENTS[key].label, {
        fontFamily: 'Press Start 2P',
        fontSize: '10px',
        color: '#fcefc2',
        align: 'center',
        stroke: '#141515',
        strokeThickness: 4,
      }).setOrigin(0.5, 0);

      container.add([body, icon, label]);
      container.setDepth(2);
      container.setSize(48, 48);
      container.setData({ type: 'crate', key });
      container.setInteractive(new Phaser.Geom.Rectangle(-24, -24, 48, 48), Phaser.Geom.Rectangle.Contains);

      this.stations.push(container);
    }

    createPrepStation({ x, y }) {
      const container = this.add.container(x, y);
      const body = this.add.image(0, 0, 'station-prep');
      const label = this.add.text(0, 30, 'Prep', {
        fontFamily: 'Press Start 2P',
        fontSize: '10px',
        color: '#fff5cd',
        align: 'center',
        stroke: '#13161c',
        strokeThickness: 4,
      }).setOrigin(0.5, 0);
      container.add([body, label]);
      container.setDepth(2);
      container.setSize(48, 48);
      container.setData({ type: 'prep' });
      container.setInteractive(new Phaser.Geom.Rectangle(-24, -24, 48, 48), Phaser.Geom.Rectangle.Contains);
      this.stations.push(container);
    }

    createCookStation({ x, y, type }) {
      const texture = type === 'skillet' ? 'station-skillet' : 'station-cauldron';
      const labelText = type === 'skillet' ? 'Skillet' : 'Cauldron';
      const container = this.add.container(x, y);
      const body = this.add.image(0, 0, texture);
      const label = this.add.text(0, 30, labelText, {
        fontFamily: 'Press Start 2P',
        fontSize: '10px',
        color: '#fff4ba',
        align: 'center',
        stroke: '#1c1f26',
        strokeThickness: 4,
      }).setOrigin(0.5, 0);
      container.add([body, label]);
      container.setDepth(2);
      container.setSize(48, 48);
      container.setData({ type: 'cook', cookType: type, busy: false });
      container.setInteractive(new Phaser.Geom.Rectangle(-24, -24, 48, 48), Phaser.Geom.Rectangle.Contains);
      this.stations.push(container);
    }

    createPlatingStation({ x, y }) {
      const container = this.add.container(x, y);
      const body = this.add.image(0, 0, 'station-plating');
      const label = this.add.text(0, 30, 'Plate', {
        fontFamily: 'Press Start 2P',
        fontSize: '10px',
        color: '#fff8d6',
        align: 'center',
        stroke: '#14161c',
        strokeThickness: 4,
      }).setOrigin(0.5, 0);
      container.add([body, label]);
      container.setDepth(2);
      container.setSize(48, 48);
      container.setData({ type: 'plating' });
      container.setInteractive(new Phaser.Geom.Rectangle(-24, -24, 48, 48), Phaser.Geom.Rectangle.Contains);
      this.stations.push(container);
    }

    createInputHandlers() {
      this.input.setTopOnly(true);
      this.input.on('gameobjectdown', (pointer, gameObject) => {
        if (this.serviceOver) return;
        pointer.event.stopPropagation();
        this.movePlayerTo(gameObject, () => this.interactWithStation(gameObject));
      });

      this.input.on('pointerdown', (pointer) => {
        if (this.serviceOver) return;
        if (pointer.wasTouch || pointer.button === 0) {
          this.movePlayerToPoint(pointer.worldX, pointer.worldY);
        }
      });
    }

    createEvents() {
      this.events.once('shutdown', () => {
        this.input.removeAllListeners();
      });
    }

    movePlayerTo(gameObject, actionCallback) {
      const worldPoint = gameObject.getWorldTransformMatrix().transformPoint(0, 0);
      const targetX = clamp(worldPoint.x, this.physics.world.bounds.left + 24, this.physics.world.bounds.right - 24);
      const targetY = clamp(worldPoint.y + 20, this.physics.world.bounds.top + 24, this.physics.world.bounds.bottom - 24);
      this.setPlayerTarget(targetX, targetY, actionCallback);
    }

    movePlayerToPoint(x, y) {
      const targetX = clamp(x, this.physics.world.bounds.left + 16, this.physics.world.bounds.right - 16);
      const targetY = clamp(y, this.physics.world.bounds.top + 16, this.physics.world.bounds.bottom - 16);
      this.setPlayerTarget(targetX, targetY, null);
    }

    setPlayerTarget(x, y, action) {
      this.playerTarget = { x, y, action };
      const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, x, y);
      this.physics.velocityFromRotation(angle, this.playerSpeed, this.player.body.velocity);
      this.player.flipX = x < this.player.x;
      this.cancelCurrentAction();
    }

    cancelCurrentAction() {
      if (this.currentAction) {
        this.currentAction.cancelled = true;
        if (this.actionMeter) {
          this.actionMeter.destroy();
          this.actionMeter = null;
        }
      }
      this.currentAction = null;
    }

    update(time, delta) {
      if (this.serviceOver) {
        this.player.body.setVelocity(0);
        return;
      }

      if (this.playerTarget) {
        const distance = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          this.playerTarget.x,
          this.playerTarget.y
        );
        if (distance < 10) {
          this.player.body.setVelocity(0, 0);
          const action = this.playerTarget.action;
          this.playerTarget = null;
          if (action) {
            this.beginAction(action);
          }
        }
      }

      if (this.currentAction) {
        this.currentAction.elapsed += delta;
        if (this.actionMeter) {
          const progress = Phaser.Math.Clamp(this.currentAction.elapsed / this.currentAction.duration, 0, 1);
          this.actionMeter.scaleX = progress;
        }
        if (this.currentAction.elapsed >= this.currentAction.duration) {
          const { onComplete } = this.currentAction;
          if (!this.currentAction.cancelled) {
            onComplete();
          }
          if (this.actionMeter) {
            this.actionMeter.destroy();
            this.actionMeter = null;
          }
          this.currentAction = null;
        }
      }

      if (this.playerShadow) {
        this.playerShadow.setPosition(this.player.x, this.player.y + 10);
      }
      if (this.inventoryIcon.visible) {
        this.inventoryIcon.setPosition(this.player.x, this.player.y - 38);
      }

      this.updateZombie(delta);
      this.updateLevelTimer(delta);
      this.updateOrders(delta);
    }

    beginAction(callback) {
      const result = callback();
      if (!result) {
        return;
      }
      const { duration, onComplete, meterLabel } = result;
      this.currentAction = { duration, onComplete, elapsed: 0, cancelled: false };
      if (this.actionMeter) {
        this.actionMeter.destroy();
      }
      const meterWidth = 40;
      const meter = this.add.graphics();
      meter.fillStyle(0x000000, 0.55);
      meter.fillRect(0, 0, meterWidth, 6);
      meter.fillStyle(0xf6de8d, 1);
      meter.fillRect(0, 0, 1, 6);
      meter.setDepth(9);
      meter.x = this.player.x - meterWidth / 2;
      meter.y = this.player.y - 52;
      this.actionMeter = meter;
      if (meterLabel) {
        this.showFloatingText(meterLabel, this.player.x, this.player.y - 70, '#fff6cf');
      }
    }

    interactWithStation(gameObject) {
      const stationType = gameObject.getData('type');
      if (stationType === 'crate') {
        return this.handleCrateInteraction(gameObject);
      }
      if (stationType === 'prep') {
        return this.handlePrepInteraction(gameObject);
      }
      if (stationType === 'cook') {
        return this.handleCookInteraction(gameObject);
      }
      if (stationType === 'plating') {
        return this.handlePlatingInteraction(gameObject);
      }
      return null;
    }

    handleCrateInteraction(gameObject) {
      if (this.playerItem) {
        this.showFloatingText('Hands full!', this.player.x, this.player.y - 60, '#ff8a7a');
        return null;
      }
      const key = gameObject.getData('key');
      const itemConfig = INGREDIENTS[key];
      return {
        duration: 700,
        meterLabel: 'Grab',
        onComplete: () => {
          this.playerItem = { key, stage: 'raw' };
          this.updateInventoryIcon();
          this.events.emit('inventory-changed', this.playerItem);
          this.showFloatingText(`${itemConfig.label}`, this.player.x, this.player.y - 58, '#9fe8a3');
        },
      };
    }

    handlePrepInteraction() {
      if (!this.playerItem) {
        this.showFloatingText('Bring an ingredient!', this.player.x, this.player.y - 60, '#ff8a7a');
        return null;
      }
      const itemConfig = INGREDIENTS[this.playerItem.key];
      if (!itemConfig.requiresPrep) {
        this.showFloatingText('No prep needed', this.player.x, this.player.y - 60, '#f7e3a3');
        return null;
      }
      if (this.playerItem.stage !== 'raw') {
        this.showFloatingText('Already prepped', this.player.x, this.player.y - 60, '#f7e3a3');
        return null;
      }
      return {
        duration: 1300,
        meterLabel: 'Chop',
        onComplete: () => {
          this.playerItem.stage = 'prepped';
          this.updateInventoryIcon();
          this.events.emit('inventory-changed', this.playerItem);
          this.showFloatingText('Chopped!', this.player.x, this.player.y - 58, '#9fe8a3');
        },
      };
    }

    handleCookInteraction(gameObject) {
      if (!this.playerItem) {
        this.showFloatingText('Need an item!', this.player.x, this.player.y - 60, '#ff8a7a');
        return null;
      }
      const cookType = gameObject.getData('cookType');
      const itemConfig = INGREDIENTS[this.playerItem.key];
      if (itemConfig.cookType !== cookType) {
        this.showFloatingText('Wrong station', this.player.x, this.player.y - 60, '#ffb16f');
        return null;
      }
      if (itemConfig.requiresPrep && this.playerItem.stage !== 'prepped') {
        this.showFloatingText('Prep first!', this.player.x, this.player.y - 60, '#ffb16f');
        return null;
      }
      if (this.playerItem.stage === 'cooked') {
        this.showFloatingText('Already cooked', this.player.x, this.player.y - 60, '#f7e3a3');
        return null;
      }
      if (gameObject.getData('busy')) {
        this.showFloatingText('Occupied!', this.player.x, this.player.y - 60, '#ff8a7a');
        return null;
      }
      gameObject.setData('busy', true);
      gameObject.alpha = 0.9;
      return {
        duration: 1700,
        meterLabel: 'Cook',
        onComplete: () => {
          gameObject.setData('busy', false);
          gameObject.alpha = 1;
          this.playerItem.stage = 'cooked';
          this.updateInventoryIcon();
          this.events.emit('inventory-changed', this.playerItem);
          this.showFloatingText('Perfect!', this.player.x, this.player.y - 58, '#9fe8a3');
        },
      };
    }

    handlePlatingInteraction() {
      if (!this.playerItem) {
        this.showFloatingText('Need food!', this.player.x, this.player.y - 60, '#ff8a7a');
        return null;
      }
      if (this.playerItem.stage !== 'cooked') {
        this.showFloatingText('Cook it fully!', this.player.x, this.player.y - 60, '#ffb16f');
        return null;
      }
      const targetOrder = this.findOrderForIngredient(this.playerItem.key);
      if (!targetOrder) {
        this.showFloatingText('No order needs that', this.player.x, this.player.y - 60, '#f7e3a3');
        return null;
      }
      return {
        duration: 600,
        meterLabel: 'Plate',
        onComplete: () => {
          const delivered = this.deliverItemToOrder(targetOrder.id, this.playerItem.key);
          if (delivered) {
            this.playerItem = null;
            this.updateInventoryIcon();
            this.events.emit('inventory-changed', this.playerItem);
            this.showFloatingText('Served!', this.player.x, this.player.y - 58, '#9fe8a3');
          } else {
            this.showFloatingText('Too late!', this.player.x, this.player.y - 58, '#ff8a7a');
          }
        },
      };
    }

    updateInventoryIcon() {
      if (!this.playerItem) {
        this.inventoryIcon.setVisible(false);
        return;
      }
      this.inventoryIcon.setTexture(`ingredient-${this.playerItem.key}`);
      this.inventoryIcon.setVisible(true);
    }

    findOrderForIngredient(ingredientKey) {
      return this.activeOrders.find((order) => order.remaining.includes(ingredientKey));
    }

    deliverItemToOrder(orderId, ingredientKey) {
      const order = this.activeOrders.find((entry) => entry.id === orderId);
      if (!order) {
        return false;
      }
      const index = order.remaining.indexOf(ingredientKey);
      if (index === -1) {
        return false;
      }
      order.remaining.splice(index, 1);
      order.delivered += 1;
      this.events.emit('orders-updated', this.activeOrders);

      if (order.remaining.length === 0) {
        this.completeOrder(order);
      }
      return true;
    }

    completeOrder(order) {
      const points = order.recipe.points ?? DIFFICULTY_POINTS[order.recipe.difficulty] ?? 0;
      this.score += points;
      this.completedOrders += 1;
      this.showFloatingText(`+${points}`, this.player.x, this.player.y - 80, '#b4ff9c');
      this.events.emit('score-changed', this.score);

      Phaser.Utils.Array.Remove(this.activeOrders, order);
      this.events.emit('orders-updated', this.activeOrders);
    }

    failOrder(order) {
      Phaser.Utils.Array.Remove(this.activeOrders, order);
      this.failedOrders += 1;
      this.showFloatingText('Order missed!', this.player.x, this.player.y - 60, '#ff8a7a');
      this.events.emit('orders-updated', this.activeOrders);
    }

    spawnOrder() {
      if (this.serviceOver) {
        return;
      }
      if (this.activeOrders.length >= MAX_ACTIVE_ORDERS) {
        return;
      }
      let recipe = null;
      if (this.scriptedOrders.length > 0) {
        recipe = this.scriptedOrders.shift();
      } else if (this.allowRandomOrders) {
        let pool = RECIPES;
        if (this.levelConfig.allowedDifficulties && this.levelConfig.allowedDifficulties.length > 0) {
          pool = RECIPES.filter((entry) => this.levelConfig.allowedDifficulties.includes(entry.difficulty));
        }
        if (pool.length > 0) {
          recipe = pickRandom(pool);
        }
      }
      if (!recipe) {
        return;
      }
      const order = {
        id: `order-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        recipe,
        remaining: [...recipe.ingredients],
        delivered: 0,
        timeRemaining: recipe.timeLimit,
      };
      this.activeOrders.push(order);
      this.events.emit('orders-updated', this.activeOrders);
      this.showFloatingText('New order!', 820, 120, '#fff6cf');
    }

    updateZombie(delta) {
      if (!this.zombieTarget) return;
      const distance = Phaser.Math.Distance.Between(
        this.zombie.x,
        this.zombie.y,
        this.zombieTarget.x,
        this.zombieTarget.y
      );
      if (distance < 12) {
        this.zombie.body.setVelocity(0, 0);
        return;
      }
      const angle = Phaser.Math.Angle.Between(
        this.zombie.x,
        this.zombie.y,
        this.zombieTarget.x,
        this.zombieTarget.y
      );
      this.physics.velocityFromRotation(angle, 45, this.zombie.body.velocity);
      this.zombie.flipX = this.zombieTarget.x < this.zombie.x;
      if (this.zombieShadow) {
        this.zombieShadow.setPosition(this.zombie.x, this.zombie.y + 10);
      }
      if (this.zombieSpeech.visible) {
        this.zombieSpeech.setPosition(this.zombie.x, this.zombie.y - 52);
      }
    }

    pickZombieDestination() {
      if (this.serviceOver) {
        return;
      }
      const bounds = this.physics.world.bounds;
      const padding = 40;
      this.zombieTarget = new Phaser.Math.Vector2(
        Phaser.Math.Between(bounds.left + padding, bounds.right - padding),
        Phaser.Math.Between(bounds.top + padding, bounds.bottom - padding)
      );
    }

    makeZombieTalk() {
      const phrase = pickRandom(ZOMBIE_CHATTER);
      this.zombieSpeech.setText(phrase);
      this.zombieSpeech.setVisible(true);
      this.tweens.add({
        targets: this.zombieSpeech,
        alpha: { from: 0, to: 1 },
        duration: 200,
        yoyo: false,
      });
      this.time.delayedCall(1700, () => {
        this.tweens.add({
          targets: this.zombieSpeech,
          alpha: { from: 1, to: 0 },
          duration: 400,
          onComplete: () => {
            this.zombieSpeech.setVisible(false);
            this.zombieSpeech.alpha = 1;
          },
        });
      });
    }

    updateLevelTimer(delta) {
      this.levelTimeRemaining -= delta / 1000;
      if (this.levelTimeRemaining <= 0 && !this.serviceOver) {
        this.levelTimeRemaining = 0;
        this.endService();
      }
      this.events.emit('timer-tick', this.levelTimeRemaining);
    }

    updateOrders(delta) {
      const seconds = delta / 1000;
      for (let i = this.activeOrders.length - 1; i >= 0; i -= 1) {
        const order = this.activeOrders[i];
        order.timeRemaining = Math.max(0, order.timeRemaining - seconds);
        if (order.timeRemaining <= 0) {
          this.failOrder(order);
        }
      }
    }

    endService() {
      this.serviceOver = true;
      this.player.body.setVelocity(0, 0);
      this.time.removeAllEvents();
      const passed = this.score >= this.levelTargetScore;
      this.events.emit('service-complete', {
        score: this.score,
        completed: this.completedOrders,
        failed: this.failedOrders,
        duration: this.levelDuration,
        target: this.levelTargetScore,
        passed,
        levelIndex: this.levelIndex,
        totalLevels: LEVELS.length,
      });
      this.showFloatingText('Service Complete!', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, '#fff6cf');
    }

    showFloatingText(text, x, y, color = '#ffffff') {
      const label = this.add.text(x, y, text, {
        fontFamily: 'Press Start 2P',
        fontSize: '12px',
        color,
        align: 'center',
        stroke: '#0d0d12',
        strokeThickness: 4,
      }).setDepth(10).setOrigin(0.5, 1);

      this.tweens.add({
        targets: label,
        y: y - 20,
        alpha: { from: 1, to: 0 },
        duration: 1400,
        ease: 'Sine.easeOut',
        onComplete: () => label.destroy(),
      });
    }
  }

  class UIScene extends Phaser.Scene {
    constructor() {
      super('UIScene');
    }

    init(data) {
      this.levelDuration = data.duration;
      this.levelIndex = data.levelIndex ?? 0;
      this.totalLevels = data.totalLevels ?? LEVELS.length;
      this.levelName = data.levelName ?? `Level ${this.levelIndex + 1}`;
      this.targetScore = data.targetScore ?? 0;
      this.introText = data.introText ?? '';
    }

    create() {
      this.gameScene = this.scene.get('GameScene');

      this.scoreText = this.add.text(40, 24, `Score: 0/${this.targetScore}`, {
        fontFamily: 'Press Start 2P',
        fontSize: '16px',
        color: '#fff8d6',
        stroke: '#111214',
        strokeThickness: 6,
      }).setDepth(20);

      this.timerText = this.add.text(GAME_WIDTH / 2, 24, 'Time: 0:00', {
        fontFamily: 'Press Start 2P',
        fontSize: '16px',
        color: '#fff8d6',
        stroke: '#111214',
        strokeThickness: 6,
      }).setOrigin(0.5, 0).setDepth(20);

      this.levelText = this.add.text(GAME_WIDTH / 2, 54, `${this.levelName} · Goal: ${this.targetScore} pts`, {
        fontFamily: 'Press Start 2P',
        fontSize: '12px',
        color: '#fff8d6',
        align: 'center',
        stroke: '#111214',
        strokeThickness: 6,
      })
        .setOrigin(0.5, 0)
        .setDepth(20);

      this.inventoryText = this.add.text(GAME_WIDTH - 40, 24, 'Hands: Empty', {
        fontFamily: 'Press Start 2P',
        fontSize: '12px',
        color: '#fff8d6',
        align: 'right',
        stroke: '#111214',
        strokeThickness: 6,
      }).setOrigin(1, 0).setDepth(20);

      this.ordersPanel = this.add.container(40, 80);
      this.ordersPanel.setDepth(20);

      if (this.introText) {
        this.overlayText = this.add
          .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.2, this.introText, {
            fontFamily: 'Press Start 2P',
            fontSize: '16px',
            color: '#fff8d6',
            align: 'center',
            stroke: '#14151c',
            strokeThickness: 6,
            wordWrap: { width: GAME_WIDTH * 0.7 },
          })
          .setOrigin(0.5)
          .setDepth(25);

        this.time.delayedCall(5200, () => {
          if (this.overlayText) {
            this.tweens.add({
              targets: this.overlayText,
              alpha: { from: 1, to: 0 },
              duration: 600,
              onComplete: () => this.overlayText.destroy(),
            });
          }
        });
      }

      this.gameScene.events.on('score-changed', this.updateScore, this);
      this.gameScene.events.on('timer-tick', this.updateTimer, this);
      this.gameScene.events.on('inventory-changed', this.updateInventory, this);
      this.gameScene.events.on('orders-updated', this.refreshOrders, this);
      this.gameScene.events.on('service-complete', this.showSummary, this);

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.gameScene.events.off('score-changed', this.updateScore, this);
        this.gameScene.events.off('timer-tick', this.updateTimer, this);
        this.gameScene.events.off('inventory-changed', this.updateInventory, this);
        this.gameScene.events.off('orders-updated', this.refreshOrders, this);
        this.gameScene.events.off('service-complete', this.showSummary, this);
      });
    }

    formatTime(seconds) {
      const total = Math.max(0, Math.ceil(seconds));
      const minutes = Math.floor(total / 60);
      const secs = total % 60;
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    updateScore(score) {
      this.scoreText.setText(`Score: ${score}/${this.targetScore}`);
    }

    updateTimer(remaining) {
      this.timerText.setText(`Time: ${this.formatTime(remaining)}`);
    }

    updateInventory(item) {
      if (!item) {
        this.inventoryText.setText('Hands: Empty');
        return;
      }
      const stage = item.stage === 'raw' ? 'raw' : item.stage;
      this.inventoryText.setText(
        `Hands: ${INGREDIENTS[item.key].label}\n(${stage.toUpperCase()})`
      );
    }

    refreshOrders(orders) {
      this.ordersPanel.removeAll(true);
      const cardHeight = 94;
      const cardSpacing = 102;
      orders.forEach((order, index) => {
        const y = index * cardSpacing;
        const bg = this.add.graphics();
        bg.fillStyle(0x141821, 0.84);
        bg.fillRoundedRect(0, y, 280, cardHeight, 12);
        bg.lineStyle(2, 0xf7e3a3, 1);
        bg.strokeRoundedRect(0, y, 280, cardHeight, 12);

        const title = this.add.text(12, y + 8, order.recipe.name, {
          fontFamily: 'Press Start 2P',
          fontSize: '12px',
          color: '#fff8d6',
          wordWrap: { width: 260 },
        });

        const timeText = this.add.text(260, y + 8, this.formatTime(order.timeRemaining), {
          fontFamily: 'Press Start 2P',
          fontSize: '10px',
          color: '#f7e3a3',
          align: 'right',
        }).setOrigin(1, 0);

        const ingredientsRow = this.add.container(18, y + 38);
        order.recipe.ingredients.forEach((ingredientKey, ingredientIndex) => {
          const icon = this.add.image(ingredientIndex * 36, 0, `ingredient-${ingredientKey}`)
            .setOrigin(0, 0)
            .setScale(1.2);
          const delivered = order.remaining.indexOf(ingredientKey) === -1;
          if (delivered) {
            icon.setTint(0xa5ffb4);
          }
          ingredientsRow.add(icon);
        });

        const pointsValue = order.recipe.points ?? DIFFICULTY_POINTS[order.recipe.difficulty] ?? 0;
        const difficultyLabel = DIFFICULTY_LABELS[order.recipe.difficulty] ?? 'Recipe';
        const metaText = this.add.text(
          12,
          y + 66,
          `${pointsValue} pts · ${difficultyLabel}`,
          {
            fontFamily: 'Press Start 2P',
            fontSize: '10px',
            color: '#f7e3a3',
          }
        );

        this.ordersPanel.add([bg, title, timeText, ingredientsRow, metaText]);
      });
    }

    showSummary(summary) {
      const { score, completed, failed, duration, target, passed, levelIndex, totalLevels } = summary;
      const levelNumber = levelIndex + 1;
      const isFinalLevel = levelIndex === totalLevels - 1;
      const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6)
        .setDepth(30);
      const panel = this.add.graphics();
      panel.fillStyle(0x141821, 0.92);
      panel.fillRoundedRect(GAME_WIDTH / 2 - 220, GAME_HEIGHT / 2 - 140, 440, 260, 16);
      panel.lineStyle(4, 0xf7e3a3, 1);
      panel.strokeRoundedRect(GAME_WIDTH / 2 - 220, GAME_HEIGHT / 2 - 140, 440, 260, 16);
      panel.setDepth(31);

      const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 118, 'Service Complete!', {
        fontFamily: 'Press Start 2P',
        fontSize: '18px',
        color: '#fff8d6',
        align: 'center',
      }).setOrigin(0.5).setDepth(32);

      const statusLine = this.add.text(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2 - 82,
        passed ? `Level ${levelNumber} cleared!` : `Level ${levelNumber} failed`,
        {
          fontFamily: 'Press Start 2P',
          fontSize: '14px',
          color: passed ? '#9fe8a3' : '#ff8a7a',
          align: 'center',
        }
      )
        .setOrigin(0.5)
        .setDepth(32);

      const details = [
        `Shift length: ${this.formatTime(duration)}`,
        `Orders served: ${completed}`,
        `Orders missed: ${failed}`,
        `Goal: ${target} pts`,
        `Final score: ${score} pts`,
      ];

      details.forEach((line, i) => {
        this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20 + i * 32, line, {
          fontFamily: 'Press Start 2P',
          fontSize: '12px',
          color: '#fff8d6',
          align: 'center',
        }).setOrigin(0.5).setDepth(32);
      });

      let ctaText = passed ? 'Tap to continue' : 'Tap to retry';
      if (passed && !isFinalLevel) {
        ctaText = `Tap to begin Level ${levelNumber + 1}`;
      }
      if (!passed) {
        ctaText = `Tap to retry Level ${levelNumber}`;
      }
      if (passed && isFinalLevel) {
        ctaText = 'Tap to replay from the tutorial';
      }

      const thankYouText = passed && isFinalLevel
        ? "The rest of the game is still in development.\nThank you for playing! - BigRigDev"
        : '';

      if (thankYouText) {
        this.add
          .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 76, thankYouText, {
            fontFamily: 'Press Start 2P',
            fontSize: '12px',
            color: '#fff8d6',
            align: 'center',
            wordWrap: { width: 380 },
          })
          .setOrigin(0.5)
          .setDepth(32);
      }

      const restart = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 120, ctaText, {
        fontFamily: 'Press Start 2P',
        fontSize: '14px',
        color: '#9fe8a3',
        align: 'center',
      }).setOrigin(0.5).setDepth(32);

      this.input.once('pointerdown', () => {
        this.scene.stop('GameScene');
        this.scene.stop();
        let nextLevel = levelIndex;
        if (passed && !isFinalLevel) {
          nextLevel = levelIndex + 1;
        } else if (passed && isFinalLevel) {
          nextLevel = 0;
        }
        this.scene.start('GameScene', { levelIndex: nextLevel });
      });
    }
  }

  function createGameInstance() {
    if (window.blockyKitchenGame) {
      return window.blockyKitchenGame;
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: '#10131a',
      parent: 'game-root',
      pixelArt: true,
      scene: [BootScene, GameScene, UIScene],
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { y: 0 },
          debug: false,
        },
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    window.blockyKitchenGame = game;
    return game;
  }

  window.BlockyKitchenGame = {
    create: createGameInstance,
  };
})();
