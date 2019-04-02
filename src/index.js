require(`expose-loader?PIXI!${__PIXI__}`);
require(`expose-loader?p2!${__p2__}`);
require(`expose-loader?Phaser!${__Phaser__}`);

import './index.css';

/**@type {Phaser.State} */
const state = { init, preload, create, update };

/**@type {Phaser.Game} */
const game = new Phaser.Game(400, 288, Phaser.AUTO, 'root', state);

/**@type {Phaser.Tilemap} */let map;
/**@type {Object.<string,Phaser.TilemapLayer>} */let layers = {};

/**@type {Phaser.Sprite}*/let player;
/**@type {Array<string>}10*/let playerRunFrames = [];
/**@type {Array<string>}4*/let playerIdleFrames = [];
/**@type {Array<string>}2*/let playerClimbFrames = [];
/**@type {Array<string>}1*/let playerFallFrames = [];
/**@type {Array<string>}1*/let playerJumpFrames = [];

/**@type {Phaser.Group} */let coins;
/**@type {Array<string>}4*/let coinFrames = [];

/**@type {Phaser.Group} */let ennemies;
/**@type {Array<string>}6*/let ennemyFrames = [];

/**@type {Phaser.Sprite} */let door;
/**@type {Array<string>}2*/let doorFrames = [];

/**@type {object} */let atlasFramesRecord;
let currentLevel = 1;
let levelsCount = 2;

/**@type {Phaser.CursorKeys} */let cursorKeys;

let mobSpeed = 20;

let playerSpeed = 80;
let playerJumpSpeed = -140;
let playerClimbSpeed = 40;
let playerGravity = 300;
let playerMobBounce = 90;
let playerSuperArmor = false;
let playerSuperArmorCoolDown = 0
let playerSuperArmorDelay = 600;
let playerBlinkRate = 80;
let playerBlinkTime = 0;

let startingHealth = 3;
let currentHealth = 3;
let totalCoinsCount = 0;
let totalKillsCount = 0;
let localCoinsCount = 0;
let localKillsCount = 0;
let killsToWin = 0;
let coinsToWin = 0;
let doorIsOpen = false;

/**@type {Phaser.Group} */let coinsCountDisplayGroup;
/**@type {Phaser.Text}*/let coinsCountText;
/**@type {Phaser.Sprite}*/let coinsCountIcon;
/**@type {Phaser.Group} */let playerHealthDisplay;

function init() {
  Phaser.Canvas.setImageRenderingCrisp(game.canvas);
  game.renderer.renderSession.roundPixels = true;
  game.scale.scaleMode = Phaser.ScaleManager.SHOW_ALL;
  game.scale.align(true, true);
  game.scale.minWidth = game.canvas.width;
  game.scale.minHeight = game.canvas.height;
}

function preload() {
  let cachedJSONKeys = game.cache.getKeys(Phaser.Cache.JSON);
  if (!cachedJSONKeys.includes('atlasFramesRecord')) {
    game.load.json('atlasFramesRecord', 'assets/atlas.json');
  }
  let cachedTextureAtlasKeys = game.cache.getKeys(Phaser.Cache.TEXTURE_ATLAS);
  if (!cachedTextureAtlasKeys.includes('atlas')) {
    game.load.atlas('atlas', 'assets/atlas.png', 'assets/atlas.json', undefined, Phaser.Loader.TEXTURE_ATLAS_JSON_HASH);
  }
  let cachedTilemapKeys = game.cache.getKeys(Phaser.Cache.TILEMAP);
  if (!cachedTilemapKeys.includes(`level${currentLevel}`)) {
    game.load.tilemap(
      `level${currentLevel}`,
      `assets/levels/level${currentLevel}.json`,
      undefined,
      Phaser.Tilemap.TILED_JSON
    );
  }
  let cachedImageKeys = game.cache.getKeys(Phaser.Cache.IMAGE);
  if (!cachedImageKeys.includes('tilemap')) {
    game.load.image('tilemap', 'assets/tilemap.png');
  }
}

function create() {
  game.physics.startSystem(Phaser.Physics.ARCADE);
  resetLocalCounters();
  createLevel();
  createEntities();
  createCountersDisplay();
  cursorKeys = game.input.keyboard.createCursorKeys();
  cursorKeys.up.onDown.add(handlePlayerJump);
}

function update() {

  updateCountersDisplay();
  handleWin();
  handlePlayerWasHit();
  handleFail();

  game.physics.arcade.collide(ennemies, layers.hidden, flipX);
  game.physics.arcade.collide(player, layers.ground);
  game.physics.arcade.collide(player, layers.jumpThrough, undefined, jumpThrough);
  game.physics.arcade.overlap(player, coins, collectCoin);
  game.physics.arcade.overlap(player, ennemies, onPlayerVsMobs);
  game.physics.arcade.collide(player, door, goToNextLevel)

  if (!player._onLadder) {
    handlePlayerMovements();
  }
  handlePlayerClimbLadder();

}

function resetLocalCounters() {
  localCoinsCount = 0;
  localKillsCount = 0;
  killsToWin = 0;
  coinsToWin = 0;
  doorIsOpen = false;
  if (currentHealth <= 0) {
    currentHealth = startingHealth;
  }
}

function createLevel() {
  map = game.add.tilemap(`level${currentLevel}`);
  map.addTilesetImage('tilemap');
  for (let iLayer of map.layers) {
    let name = iLayer.name;
    layers[name] = map.createLayer(name);
    map.setCollisionByExclusion([], true, layers[name]);
    if (name === 'hidden') {
      layers[name].alpha = 0;
    }
    if (name === 'jumpThrough') {
      layers[name].getTiles(
        layers[name].x, layers[name].y,
        layers[name].width, layers[name].height,
        true
      ).forEach(tile => {
        tile.setCollision(false, false, true, false);
      });
    }
  }
}

function createEntities() {
  setEntitiesAnimationFrames();
  coins = game.add.group();
  ennemies = game.add.group();
  coins.enableBody = true;
  ennemies.enableBody = true;
  for (let entity of map.objects.entities) {
    let entityName = entity.name;
    let entityProps = null;
    if (entity.properties) {
      entityProps = getTileObjectProps(entity.properties);
    }
    if (entityName === 'coin') {
      coinsToWin++;
      coins.add(createCoin(entity.x, entity.y, entityProps));
    } else if (entityName === 'ennemi') {
      killsToWin++;
      ennemies.add(createEnnemy(entity.x, entity.y, entityProps))
    } else if (entityName === 'door') {
      door = createDoor(entity.x, entity.y, entityProps);
    } else if (entityName === 'player') {
      player = createPlayer(entity.x, entity.y, entityProps);
    }
  }
}

function createCountersDisplay() {
  createCoinsCounterDisplay();
  createHealthDisplay();
}

function handlePlayerJump() {
  if (cursorKeys.up.isDown && player.body.blocked.down) {
    player.body.velocity.y = playerJumpSpeed;
  }
}

function handlePlayerMovements() {

  if (cursorKeys.right.isDown) {
    player.scale.x *= player.scale.x < 0 ? -1 : 1;
    player.body.velocity.x = playerSpeed;
  } else if (cursorKeys.left.isDown) {
    player.scale.x *= player.scale.x > 0 ? -1 : 1;
    player.body.velocity.x = -playerSpeed;
  } else {
    player.body.velocity.x = 0;
  }

  if (player.body.velocity.x && player.body.blocked.down) {
    player.animations.play('run');
  } else if (!player.body.velocity.x && player.body.blocked.down) {
    player.animations.play('idle')
  }

  if (player.body.velocity.y > 0) {
    player.animations.play('fall');
  } else if (player.body.velocity.y < 0) {
    player.animations.play('jump')
  }
}

function handlePlayerClimbLadder() {
  playerGrabLadder();
  playerClimbLadder();
  playerReleaseLadder();
}

function playerGrabLadder() {
  if (!player._onLadder) {
    let ladderTile;
    if (cursorKeys.up.isDown) {
      ladderTile = map.getTileWorldXY(
        player.world.x, player.world.y,
        undefined, undefined,
        layers.ladders
      );
    }
    if (cursorKeys.down.isDown) {
      ladderTile = map.getTileWorldXY(
        player.world.x, player.world.y + player.height,
        undefined, undefined,
        layers.ladders
      );
    }
    if (ladderTile) {
      player._onLadder = true;
      player.body.gravity.y = 0;
    }
  }
}

function playerReleaseLadder() {
  if (player._onLadder) {
    let ladderTile =
      map.getTileWorldXY(
        player.world.x, player.world.y,
        undefined, undefined,
        layers.ladders
      )
      || map.getTileWorldXY(
        player.world.x, player.world.y + player.height,
        undefined, undefined,
        layers.ladders
      );
    if (!ladderTile) {
      player._onLadder = false;
      player.body.gravity.y = playerGravity;
    }
  }
}

function playerClimbLadder() {
  if (player._onLadder) {
    if (cursorKeys.up.isDown) {
      player.body.velocity.y = -playerClimbSpeed;
    } else if (cursorKeys.down.isDown) {
      player.body.velocity.y = playerClimbSpeed;
    } else {
      player.body.velocity.y = 0;
    }

    if (cursorKeys.left.isDown) {
      player.body.velocity.x = -playerClimbSpeed;
    } else if (cursorKeys.right.isDown) {
      player.body.velocity.x = playerClimbSpeed;
    } else {
      player.body.velocity.x = 0;
    }
    if (player.body.velocity.x || player.body.velocity.y) {
      player.animations.play('climb');
    }
  }
}

/**
 * Group entities animation frames by name and put them into their respective arrays
 * Frames are parsed from a json file generated by texture-packer
 * The frames arrays will be used to define entities animations
 */
function setEntitiesAnimationFrames() {
  atlasFramesRecord = game.cache.getJSON('atlasFramesRecord');
  for (let frameName of Object.keys(atlasFramesRecord.frames)) {
    if (/^run/.test(frameName)) playerRunFrames.push(frameName);
    if (/^idle/.test(frameName)) playerIdleFrames.push(frameName);
    if (/^climb/.test(frameName)) playerClimbFrames.push(frameName);
    if (/^fall/.test(frameName)) playerFallFrames.push(frameName);
    if (/^jump/.test(frameName)) playerJumpFrames.push(frameName);
    if (/^coin/.test(frameName)) coinFrames.push(frameName);
    if (/^walk/.test(frameName)) ennemyFrames.push(frameName);
    if (/^door/.test(frameName)) doorFrames.push(frameName);
  }
}

/**
 * 
 * @param {number} x 
 * @param {number} y 
 * @param {object} props
 * @returns {Phaser.Sprite}
 */
function createPlayer(x = 0, y = 0, props) {
  let sprite = game.add.sprite(x, y, 'atlas', playerIdleFrames[0]);
  sprite.anchor.set(.5);
  sprite.x += sprite.width / 2;
  sprite.y += sprite.height / 2;
  game.physics.arcade.enable(sprite);
  sprite.body.setSize(
    (sprite.width / 2) / sprite.scale.x,
    (sprite.height * 3 / 4) / sprite.scale.y,
    sprite.width / 4, sprite.height / 4
  );
  sprite.body.gravity.y = playerGravity;
  sprite._onLadder = false;
  sprite.health = currentHealth;
  sprite.animations.add('idle', playerIdleFrames, 6, true);
  sprite.animations.add('run', playerRunFrames, 20);
  sprite.animations.add('climb', playerClimbFrames, 6);
  sprite.animations.add('fall', playerFallFrames, 6);
  sprite.animations.add('jump', playerJumpFrames, 6);
  sprite.animations.play('idle');
  return sprite;
}

/**
 * 
 * @param {number} x 
 * @param {number} y
 * @param {object} props
 * @returns {Phaser.Sprite} 
 */
function createCoin(x = 0, y = 0, props) {
  let sprite = game.add.sprite(x, y, 'atlas', coinFrames[0]);
  sprite.anchor.set(.5);
  sprite.x += sprite.width / 2;
  sprite.y += sprite.height / 2;
  game.physics.arcade.enable(sprite);
  sprite.body.setSize(
    (sprite.width / 2) / sprite.scale.x,
    (sprite.height / 2) / sprite.scale.y,
    sprite.width / 4, sprite.height / 4
  );
  sprite.animations.add('spin', coinFrames, 8, true);
  sprite.animations.play('spin');
  return sprite;
}

/**
 * 
 * @param {number} x 
 * @param {number} y
 * @param {object} props
 * @returns {Phaser.Sprite} 
 */
function createEnnemy(x = 0, y = 0, props) {
  let sprite = game.add.sprite(x, y, 'atlas', ennemyFrames[0]);
  sprite.anchor.set(.5);
  sprite.x += sprite.width / 2;
  sprite.y += sprite.height / 2;
  game.physics.arcade.enable(sprite);
  sprite.body.setSize(
    (sprite.width / 2) / sprite.scale.x,
    (sprite.height / 2) / sprite.scale.y,
    sprite.width / 4, sprite.height / 4
  );
  sprite.body.velocity.x = mobSpeed;
  sprite.body.bounce.x = 1;
  sprite.animations.add('walk', ennemyFrames, 8, true);
  sprite.animations.play('walk');
  return sprite;
}

/**
 * 
 * @param {number} x 
 * @param {number} y
 * @param {object} props
 * @returns {Phaser.Sprite} 
 */
function createDoor(x = 0, y = 0, props) {
  let sprite = game.add.sprite(x, y, 'atlas', doorFrames[0]);
  game.physics.arcade.enable(sprite);
  sprite.body.immovable = true;
  sprite.animations.add('open', doorFrames);
  return sprite;
}

function updateCountersDisplay() {
  updateCoinsCounterDisplay();
  updateHealthDisplay();
}

function createCoinsCounterDisplay() {
  coinsCountDisplayGroup = game.add.group(undefined, 'coinsCountDisplayGroup');
  coinsCountIcon = game.add.sprite(0, 0, 'atlas', coinFrames[0]);
  coinsCountText = game.add.text(map.tileWidth, 0, `x ${totalCoinsCount}`, {
    fill: 'white',
    font: '12px arial'
  });
  coinsCountDisplayGroup.add(coinsCountIcon)
  coinsCountDisplayGroup.add(coinsCountText);
}

function updateCoinsCounterDisplay() {
  coinsCountText.text = `x ${totalCoinsCount}`;
  coinsCountDisplayGroup.x = game.world.width - (map.tileWidth * 1.2 + coinsCountIcon.width + coinsCountText.width);
  coinsCountDisplayGroup.y = map.tileHeight;
}

function createHealthDisplay() {
  playerHealthDisplay = game.add.group(undefined, 'playerHealthDisplayGroup');
  for (let i = 0; i < player.health; i++) {
    let x = i * (map.tileWidth / 2) + i * 1.2;
    let healthSprite = game.add.sprite(x, 0, 'atlas', 'firstaid.png');
    healthSprite.scale.set(0.25);
    playerHealthDisplay.add(healthSprite);
  }
  playerHealthDisplay.x = map.tileWidth * 1.2;
  playerHealthDisplay.y = map.tileHeight * 1.2;
}

function updateHealthDisplay() {
  if (player.health < playerHealthDisplay.children.length) {
    playerHealthDisplay.removeChildAt(playerHealthDisplay.children.length - 1);
  }
}

/**
 * Objects custom properties generated by Tiled are in an array of objects
 * Each object represents a single Tiled custom property
 * @param {Array<object>} props 
 */
function getTileObjectProps(props) {
  let o = {};
  for (let prop of props) {
    try {
      o[prop.name] = eval(prop.value);
    } catch (err) {
      o[prop.name] = prop.value;
    }
  }
  return o;
}

/**
 * 
 * @param {Phaser.Sprite} sprite 
 */
function flipX(sprite) {
  sprite.scale.x *= -1;
}

/**
 * 
 * @param {Phaser.Sprite} sprite 
 * @param {Phaser.Tile} tile 
 */
function jumpThrough(sprite, tile) {
  if (sprite.world.y < tile.worldY) {
    return true;
  }
  return false;
}

/**
 * 
 * @param {Phaser.Sprite} sprite 
 * @param {Phaser.Sprite} coin 
 */
function collectCoin(sprite, coin) {
  incrementCoinsCounters();
  coin.destroy();
}

/**
 * 
 * @param {Phaser.Sprite} player 
 * @param {Phaser.Sprite} mob 
 */
function onPlayerVsMobs(player, mob) {
  if (player.body.touching.down) {
    incrementKillsCounters();
    player.body.velocity.y = -playerMobBounce;
    mob.destroy();
  } else {
    if (!playerSuperArmor) {
      player.health--;
      currentHealth = player.health;
      playerSuperArmor = true;
      playerSuperArmorCoolDown = Date.now() + playerSuperArmorDelay;
    }
  }
}

function handlePlayerWasHit() {
  if (playerSuperArmor) {
    if (Date.now() >= playerSuperArmorCoolDown) {
      playerSuperArmor = false;
    }
    if (Date.now() >= playerBlinkTime) {
      player.alpha = player.alpha ? 0 : 1;
      playerBlinkTime = Date.now() + playerBlinkRate;
    }
  } else {
    player.alpha = 1;
  }
}

function handleWin() {
  if (
    localCoinsCount === coinsToWin
    && localKillsCount === killsToWin
    && !doorIsOpen
  ) {
    doorIsOpen = true;
    door.frameName = doorFrames[1];
  }
}

function handleFail() {
  if (player.health <= 0) {
    game.state.restart();
  }
}

/**
 * 
 * @param {Phaser.Sprite} player 
 * @param {Phaser.Sprite} door 
 */
function goToNextLevel(player, door) {
  if (doorIsOpen) {
    currentLevel++;
    if (currentLevel > levelsCount) {
      currentLevel = 1;
    }
    game.state.restart();
  }
}

function incrementCoinsCounters() {
  localCoinsCount++;
  totalCoinsCount++;
}

function incrementKillsCounters() {
  localKillsCount++;
  totalKillsCount++;
}

function debugCounters() {
  console.log(`startingHealth: ${startingHealth}`);
  console.log(`totalCoinsCount: ${totalCoinsCount}`);
  console.log(`totalKillsCount: ${totalKillsCount}`);
  console.log(`localCoinsCount: ${localCoinsCount}`);
  console.log(`localKillsCount: ${localKillsCount}`);
  console.log(`killsToWin: ${killsToWin}`);
  console.log(`coinsToWin: ${coinsToWin}`);
}
