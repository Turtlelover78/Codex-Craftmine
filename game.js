(() => {
  "use strict";

  if (typeof THREE === "undefined") {
    alert("Three.js failed to load. Check internet connection and refresh.");
    return;
  }

  const blockerEl = document.getElementById("blocker");
  const startBtn = document.getElementById("startBtn");
  const statsEl = document.getElementById("stats");
  const messageEl = document.getElementById("message");
  const hotbarEl = document.getElementById("hotbar");

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87c9ff);
  scene.fog = new THREE.Fog(0x87c9ff, 30, 120);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    300
  );
  camera.rotation.order = "YXZ";

  const ambient = new THREE.HemisphereLight(0xd7ecff, 0x4b5d43, 0.95);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 1.05);
  sun.position.set(22, 36, 15);
  scene.add(sun);

  const WORLD_RADIUS = 22;
  const WORLD_FLOOR = -3;
  const WORLD_TOP_SCAN = 24;
  const BLOCK_REACH = 6;

  const PLAYER_RADIUS = 0.3;
  const PLAYER_HEIGHT = 1.8;
  const PLAYER_EYE_HEIGHT = 1.62;
  const GRAVITY = 25;

  const HOTBAR_BLOCKS = ["grass", "dirt", "stone", "wood", "sand"];
  let selectedBlockIndex = 0;

  const blocks = new Map();
  const terrainHeight = new Map();
  const solidMeshes = [];

  const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
  const raycaster = new THREE.Raycaster();
  const centerPointer = new THREE.Vector2(0, 0);
  const tmpVec = new THREE.Vector3();
  const tmpVec2 = new THREE.Vector3();

  const materials = buildMaterials();

  const player = {
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    speed: 6.4,
    jumpSpeed: 9.0,
    onGround: false,
    health: 20,
    maxHealth: 20,
    kills: 0,
    deaths: 0,
    attackCooldown: 0
  };

  const enemy = {
    pos: new THREE.Vector3(),
    maxHealth: 20,
    health: 20,
    alive: true,
    attackCooldown: 0,
    respawnTimer: 0,
    kills: 0,
    deaths: 0
  };

  const enemyGroup = buildEnemy();
  const enemyHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 1.8, 0.85),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  scene.add(enemyGroup);
  scene.add(enemyHitbox);

  const keys = Object.create(null);
  let pointerLocked = false;
  let messageTimer = 0;

  buildHotbar();
  generateWorld();
  spawnPlayer(false);
  spawnEnemy(false);
  syncEnemyVisual();
  updateCamera();
  updateHud();

  startBtn.addEventListener("click", () => {
    renderer.domElement.requestPointerLock();
  });

  document.addEventListener("pointerlockchange", () => {
    pointerLocked = document.pointerLockElement === renderer.domElement;
    blockerEl.style.display = pointerLocked ? "none" : "grid";
    if (!pointerLocked) {
      for (const keyName of Object.keys(keys)) {
        keys[keyName] = false;
      }
    }
  });

  document.addEventListener("mousemove", (event) => {
    if (!pointerLocked) {
      return;
    }
    player.yaw -= event.movementX * 0.0022;
    player.pitch -= event.movementY * 0.0022;
    player.pitch = THREE.MathUtils.clamp(player.pitch, -1.54, 1.54);
  });

  document.addEventListener("keydown", (event) => {
    keys[event.code] = true;
    if (event.code.startsWith("Digit")) {
      const index = Number(event.code.replace("Digit", "")) - 1;
      if (index >= 0 && index < HOTBAR_BLOCKS.length) {
        selectedBlockIndex = index;
        refreshHotbarSelection();
      }
    }
    if (event.code === "Space") {
      event.preventDefault();
    }
  });

  document.addEventListener("keyup", (event) => {
    keys[event.code] = false;
  });

  window.addEventListener("mousedown", (event) => {
    if (!pointerLocked) {
      return;
    }

    if (event.button === 0) {
      if (tryAttackEnemy()) {
        return;
      }
      tryBreakBlock();
      return;
    }

    if (event.button === 2) {
      tryPlaceBlock();
    }
  });

  window.addEventListener("contextmenu", (event) => event.preventDefault());

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  animate();

  function animate() {
    const dt = Math.min(clock.getDelta(), 0.05);

    if (pointerLocked) {
      updatePlayer(dt);
    }

    updateEnemy(dt);
    updateCamera();
    updateHud();
    updateMessage(dt);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  function updatePlayer(dt) {
    player.attackCooldown = Math.max(0, player.attackCooldown - dt);

    const moveForward = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const moveSide = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);

    tmpVec.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    tmpVec2.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

    const moveDir = new THREE.Vector3(0, 0, 0);
    moveDir.addScaledVector(tmpVec, moveForward);
    moveDir.addScaledVector(tmpVec2, moveSide);
    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
    }

    player.vel.x = moveDir.x * player.speed;
    player.vel.z = moveDir.z * player.speed;

    if (keys.Space && player.onGround) {
      player.vel.y = player.jumpSpeed;
      player.onGround = false;
    }

    player.vel.y -= GRAVITY * dt;
    player.vel.y = Math.max(player.vel.y, -34);

    const nextX = player.pos.clone();
    nextX.x += player.vel.x * dt;
    if (!collidesAt(nextX)) {
      player.pos.x = nextX.x;
    }

    const nextZ = player.pos.clone();
    nextZ.z += player.vel.z * dt;
    if (!collidesAt(nextZ)) {
      player.pos.z = nextZ.z;
    }

    const nextY = player.pos.clone();
    nextY.y += player.vel.y * dt;
    if (!collidesAt(nextY)) {
      player.pos.y = nextY.y;
      player.onGround = false;
    } else {
      if (player.vel.y < 0) {
        player.onGround = true;
      }
      player.vel.y = 0;
    }

    const groundProbe = player.pos.clone();
    groundProbe.y -= 0.08;
    if (collidesAt(groundProbe)) {
      player.onGround = true;
    }

    if (player.pos.y < WORLD_FLOOR - 10) {
      damagePlayer(999);
    }
  }

  function updateEnemy(dt) {
    if (!enemy.alive) {
      enemy.respawnTimer -= dt;
      if (enemy.respawnTimer <= 0) {
        spawnEnemy(true);
        showMessage("Enemy respawned.", "#cfe3ff", 900);
      }
      return;
    }

    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);

    const toPlayer = new THREE.Vector3(
      player.pos.x - enemy.pos.x,
      0,
      player.pos.z - enemy.pos.z
    );
    const distance = toPlayer.length();

    if (distance > 1.7) {
      toPlayer.normalize();
      const moveSpeed = distance > 14 ? 2.2 : 3.2;
      const nextX = enemy.pos.x + toPlayer.x * moveSpeed * dt;
      const nextZ = enemy.pos.z + toPlayer.z * moveSpeed * dt;
      const nextY = getGroundY(nextX, nextZ);

      if (canEnemyStand(nextX, nextY, nextZ)) {
        enemy.pos.set(nextX, nextY, nextZ);
      }
    }

    if (distance < 2.1 && enemy.attackCooldown <= 0) {
      enemy.attackCooldown = 0.85;
      damagePlayer(3);
      showMessage("Enemy hit you.", "#ffd8d8", 600);
    }

    enemyGroup.lookAt(player.pos.x, enemy.pos.y + 1.35, player.pos.z);
    syncEnemyVisual();
  }

  function updateCamera() {
    camera.position.set(
      player.pos.x,
      player.pos.y + PLAYER_EYE_HEIGHT,
      player.pos.z
    );
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
  }

  function buildMaterials() {
    const grassTop = textureFromColor(0x63c74a, 22);
    const grassSide = textureFromColor(0x4f9d3b, 16);
    const dirt = textureFromColor(0x7b5a3a, 19);
    const stone = textureFromColor(0x8f98a3, 15);
    const wood = textureFromColor(0xa67a4f, 14);
    const sand = textureFromColor(0xd9ca8d, 11);
    const leaves = textureFromColor(0x3f8645, 23);

    return {
      grass: [
        new THREE.MeshLambertMaterial({ map: grassSide }),
        new THREE.MeshLambertMaterial({ map: grassSide }),
        new THREE.MeshLambertMaterial({ map: grassTop }),
        new THREE.MeshLambertMaterial({ map: dirt }),
        new THREE.MeshLambertMaterial({ map: grassSide }),
        new THREE.MeshLambertMaterial({ map: grassSide })
      ],
      dirt: new THREE.MeshLambertMaterial({ map: dirt }),
      stone: new THREE.MeshLambertMaterial({ map: stone }),
      wood: new THREE.MeshLambertMaterial({ map: wood }),
      sand: new THREE.MeshLambertMaterial({ map: sand }),
      leaves: new THREE.MeshLambertMaterial({
        map: leaves,
        transparent: true,
        opacity: 0.95
      })
    };
  }

  function textureFromColor(baseHex, variation) {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");

    const base = hexToRgb(baseHex);
    ctx.fillStyle = `rgb(${base.r}, ${base.g}, ${base.b})`;
    ctx.fillRect(0, 0, 32, 32);

    for (let i = 0; i < 260; i++) {
      const x = (Math.random() * 32) | 0;
      const y = (Math.random() * 32) | 0;
      const delta = ((Math.random() * variation * 2) | 0) - variation;
      const r = clampByte(base.r + delta);
      const g = clampByte(base.g + delta);
      const b = clampByte(base.b + delta);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(x, y, 1, 1);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  function hexToRgb(value) {
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255
    };
  }

  function clampByte(v) {
    return Math.max(0, Math.min(255, v | 0));
  }

  function buildEnemy() {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.95, 0.38),
      new THREE.MeshLambertMaterial({ color: 0x4e81db })
    );
    body.position.y = 0.9;

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.62, 0.62),
      new THREE.MeshLambertMaterial({ color: 0xf0c8a0 })
    );
    head.position.y = 1.7;

    const legLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.78, 0.26),
      new THREE.MeshLambertMaterial({ color: 0x25324f })
    );
    legLeft.position.set(-0.16, 0.39, 0);

    const legRight = legLeft.clone();
    legRight.position.x = 0.16;

    group.add(body, head, legLeft, legRight);
    return group;
  }

  function generateWorld() {
    for (let x = -WORLD_RADIUS; x <= WORLD_RADIUS; x++) {
      for (let z = -WORLD_RADIUS; z <= WORLD_RADIUS; z++) {
        if (x * x + z * z > (WORLD_RADIUS + 1) * (WORLD_RADIUS + 1)) {
          continue;
        }

        const h = terrainY(x, z);
        terrainHeight.set(columnKey(x, z), h);
        const startY = Math.max(WORLD_FLOOR, h - 3);

        for (let y = startY; y <= h; y++) {
          let blockType = "stone";
          if (y === h) {
            blockType = h < 2 ? "sand" : "grass";
          } else if (y >= h - 2) {
            blockType = "dirt";
          }
          addBlock(x, y, z, blockType);
        }

        const treeNoise = hash2(x * 3 + 9, z * 5 - 14);
        if (h >= 3 && treeNoise > 0.978 && Math.abs(x) > 3 && Math.abs(z) > 3) {
          growTree(x, h + 1, z);
        }
      }
    }
  }

  function growTree(x, y, z) {
    addBlock(x, y, z, "wood");
    addBlock(x, y + 1, z, "wood");
    addBlock(x, y + 2, z, "wood");

    for (let ox = -2; ox <= 2; ox++) {
      for (let oy = 2; oy <= 4; oy++) {
        for (let oz = -2; oz <= 2; oz++) {
          const distance = Math.abs(ox) + Math.abs(oz) + Math.abs(oy - 3);
          if (distance <= 4) {
            addBlock(x + ox, y + oy, z + oz, "leaves");
          }
        }
      }
    }
  }

  function terrainY(x, z) {
    const wave = Math.sin(x * 0.23) * 1.8 + Math.cos(z * 0.27) * 1.4;
    const bumpy = (hash2(x, z) - 0.5) * 2.2;
    return Math.floor(4 + wave + bumpy);
  }

  function hash2(x, z) {
    const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }

  function blockKey(x, y, z) {
    return `${x}|${y}|${z}`;
  }

  function columnKey(x, z) {
    return `${x}|${z}`;
  }

  function addBlock(x, y, z, type) {
    const key = blockKey(x, y, z);
    if (blocks.has(key)) {
      return false;
    }

    const mesh = new THREE.Mesh(cubeGeometry, materials[type] || materials.stone);
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    mesh.userData.blockPos = { x, y, z };
    scene.add(mesh);
    blocks.set(key, { x, y, z, type, mesh });
    solidMeshes.push(mesh);
    return true;
  }

  function removeBlock(x, y, z) {
    const key = blockKey(x, y, z);
    const block = blocks.get(key);
    if (!block) {
      return false;
    }
    scene.remove(block.mesh);
    blocks.delete(key);
    const idx = solidMeshes.indexOf(block.mesh);
    if (idx >= 0) {
      solidMeshes.splice(idx, 1);
    }
    return true;
  }

  function hasBlock(x, y, z) {
    return blocks.has(blockKey(x, y, z));
  }

  function collidesAt(position) {
    const minX = position.x - PLAYER_RADIUS;
    const maxX = position.x + PLAYER_RADIUS;
    const minY = position.y;
    const maxY = position.y + PLAYER_HEIGHT;
    const minZ = position.z - PLAYER_RADIUS;
    const maxZ = position.z + PLAYER_RADIUS;

    const startX = Math.floor(minX);
    const endX = Math.floor(maxX);
    const startY = Math.floor(minY);
    const endY = Math.floor(maxY);
    const startZ = Math.floor(minZ);
    const endZ = Math.floor(maxZ);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        for (let z = startZ; z <= endZ; z++) {
          if (!hasBlock(x, y, z)) {
            continue;
          }

          if (
            maxX > x &&
            minX < x + 1 &&
            maxY > y &&
            minY < y + 1 &&
            maxZ > z &&
            minZ < z + 1
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function tryBreakBlock() {
    const hit = getAimedBlock();
    if (!hit || hit.distance > BLOCK_REACH) {
      return;
    }

    const pos = hit.object.userData.blockPos;
    if (!pos) {
      return;
    }
    if (pos.y <= WORLD_FLOOR) {
      return;
    }

    if (removeBlock(pos.x, pos.y, pos.z)) {
      showMessage(`Mined ${pos.x},${pos.y},${pos.z}`, "#e6f3ff", 350);
    }
  }

  function tryPlaceBlock() {
    const hit = getAimedBlock();
    if (!hit || hit.distance > BLOCK_REACH) {
      return;
    }
    if (!hit.face) {
      return;
    }

    const target = hit.object.userData.blockPos;
    const normal = hit.face.normal;
    const x = target.x + Math.round(normal.x);
    const y = target.y + Math.round(normal.y);
    const z = target.z + Math.round(normal.z);

    if (y < WORLD_FLOOR || y > WORLD_TOP_SCAN + 12) {
      return;
    }
    if (hasBlock(x, y, z)) {
      return;
    }
    if (wouldIntersectPlayerBlock(x, y, z) || wouldIntersectEnemyBlock(x, y, z)) {
      return;
    }

    const type = HOTBAR_BLOCKS[selectedBlockIndex];
    if (addBlock(x, y, z, type)) {
      showMessage(`Placed ${type}`, "#d0ffd6", 320);
    }
  }

  function getAimedBlock() {
    raycaster.setFromCamera(centerPointer, camera);
    const hits = raycaster.intersectObjects(solidMeshes, false);
    return hits.length ? hits[0] : null;
  }

  function tryAttackEnemy() {
    if (!enemy.alive || player.attackCooldown > 0) {
      return false;
    }

    raycaster.setFromCamera(centerPointer, camera);
    const hits = raycaster.intersectObject(enemyHitbox, false);
    if (!hits.length || hits[0].distance > 3.3) {
      return false;
    }

    player.attackCooldown = 0.28;
    damageEnemy(4);
    return true;
  }

  function damageEnemy(amount) {
    if (!enemy.alive) {
      return;
    }
    enemy.health -= amount;
    showMessage(`Hit enemy for ${amount}`, "#ffd28a", 380);

    if (enemy.health <= 0) {
      enemy.alive = false;
      enemy.health = 0;
      enemy.deaths += 1;
      player.kills += 1;
      enemy.respawnTimer = 3;
      enemyGroup.visible = false;
      enemyHitbox.visible = false;
      showMessage("Enemy down. Respawn in 3s.", "#8fff9f", 1200);
    }
  }

  function damagePlayer(amount) {
    player.health -= amount;
    if (player.health > 0) {
      return;
    }
    player.health = 0;
    player.deaths += 1;
    enemy.kills += 1;
    showMessage("You died. Respawning...", "#ff9f9f", 1300);
    spawnPlayer(true);
  }

  function spawnPlayer(randomSpawn) {
    const spawn = chooseSpawn(randomSpawn ? 8 : 0);
    player.pos.set(spawn.x + 0.5, spawn.y + 0.01, spawn.z + 0.5);
    player.vel.set(0, 0, 0);
    player.health = player.maxHealth;
    player.onGround = false;
  }

  function spawnEnemy(randomSpawn) {
    const spawn = chooseSpawn(randomSpawn ? 12 : 10);
    enemy.pos.set(spawn.x + 0.5, spawn.y + 0.01, spawn.z + 0.5);
    enemy.health = enemy.maxHealth;
    enemy.alive = true;
    enemy.respawnTimer = 0;
    enemy.attackCooldown = 0;
    enemyGroup.visible = true;
    enemyHitbox.visible = true;
    syncEnemyVisual();
  }

  function chooseSpawn(minDistanceFromCenter) {
    for (let i = 0; i < 120; i++) {
      const x = ((Math.random() * (WORLD_RADIUS * 2 - 4)) | 0) - WORLD_RADIUS + 2;
      const z = ((Math.random() * (WORLD_RADIUS * 2 - 4)) | 0) - WORLD_RADIUS + 2;
      if (x * x + z * z > WORLD_RADIUS * WORLD_RADIUS) {
        continue;
      }

      const distanceToCenter = Math.sqrt(x * x + z * z);
      if (distanceToCenter < minDistanceFromCenter) {
        continue;
      }

      const y = getGroundY(x + 0.5, z + 0.5);
      return { x, y, z };
    }

    const fallbackY = getGroundY(0.5, 0.5);
    return { x: 0, y: fallbackY, z: 0 };
  }

  function getGroundY(x, z) {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    let y = terrainHeight.get(columnKey(bx, bz));
    if (typeof y === "number") {
      return y + 1;
    }

    for (let scan = WORLD_TOP_SCAN; scan >= WORLD_FLOOR; scan--) {
      if (hasBlock(bx, scan, bz)) {
        return scan + 1;
      }
    }
    return WORLD_FLOOR + 1;
  }

  function canEnemyStand(x, y, z) {
    const footX = Math.floor(x);
    const footZ = Math.floor(z);
    const feetY = Math.floor(y);
    const chestY = Math.floor(y + 1);
    if (hasBlock(footX, feetY, footZ)) {
      return false;
    }
    if (hasBlock(footX, chestY, footZ)) {
      return false;
    }
    return true;
  }

  function wouldIntersectPlayerBlock(x, y, z) {
    const minX = player.pos.x - PLAYER_RADIUS;
    const maxX = player.pos.x + PLAYER_RADIUS;
    const minY = player.pos.y;
    const maxY = player.pos.y + PLAYER_HEIGHT;
    const minZ = player.pos.z - PLAYER_RADIUS;
    const maxZ = player.pos.z + PLAYER_RADIUS;

    return (
      maxX > x &&
      minX < x + 1 &&
      maxY > y &&
      minY < y + 1 &&
      maxZ > z &&
      minZ < z + 1
    );
  }

  function wouldIntersectEnemyBlock(x, y, z) {
    if (!enemy.alive) {
      return false;
    }
    const minX = enemy.pos.x - 0.33;
    const maxX = enemy.pos.x + 0.33;
    const minY = enemy.pos.y;
    const maxY = enemy.pos.y + 1.8;
    const minZ = enemy.pos.z - 0.33;
    const maxZ = enemy.pos.z + 0.33;

    return (
      maxX > x &&
      minX < x + 1 &&
      maxY > y &&
      minY < y + 1 &&
      maxZ > z &&
      minZ < z + 1
    );
  }

  function syncEnemyVisual() {
    enemyGroup.position.copy(enemy.pos);
    enemyHitbox.position.set(enemy.pos.x, enemy.pos.y + 0.9, enemy.pos.z);
  }

  function buildHotbar() {
    HOTBAR_BLOCKS.forEach((name, i) => {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.textContent = `${i + 1} ${name}`;
      hotbarEl.appendChild(slot);
    });
    refreshHotbarSelection();
  }

  function refreshHotbarSelection() {
    const nodes = hotbarEl.querySelectorAll(".slot");
    nodes.forEach((node, index) => {
      if (index === selectedBlockIndex) {
        node.classList.add("selected");
      } else {
        node.classList.remove("selected");
      }
    });
  }

  function showMessage(text, color, durationMs) {
    messageEl.textContent = text;
    messageEl.style.color = color || "#f4fbff";
    messageTimer = Math.max(0.2, (durationMs || 1000) / 1000);
  }

  function updateMessage(dt) {
    if (messageTimer <= 0) {
      return;
    }
    messageTimer -= dt;
    if (messageTimer <= 0) {
      messageEl.textContent = "";
    }
  }

  function updateHud() {
    statsEl.textContent =
      `You HP: ${Math.ceil(player.health)}/${player.maxHealth}  ` +
      `Enemy HP: ${Math.ceil(enemy.health)}/${enemy.maxHealth}  ` +
      `Kills: ${player.kills}  Deaths: ${player.deaths}  ` +
      `Enemy K/D: ${enemy.kills}/${enemy.deaths}`;
  }
})();
