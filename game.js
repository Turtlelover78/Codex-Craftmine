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
  scene.fog = new THREE.Fog(0x87c9ff, 38, 170);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    360
  );
  camera.rotation.order = "YXZ";

  const ambient = new THREE.HemisphereLight(0xd7ecff, 0x4b5d43, 0.95);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 1.05);
  sun.position.set(22, 36, 15);
  scene.add(sun);

  const WORLD_RADIUS = 34;
  const WORLD_FLOOR = -8;
  const WORLD_TOP_SCAN = 42;
  const BLOCK_REACH = 6;

  const PLAYER_RADIUS = 0.3;
  const PLAYER_HEIGHT = 1.8;
  const PLAYER_EYE_HEIGHT = 1.62;
  const GRAVITY = 25;

  const HOTBAR_BLOCKS = ["grass", "dirt", "stone", "wood", "sand", "leaves"];
  let selectedBlockIndex = 0;

  const inventory = {
    grass: 24,
    dirt: 24,
    stone: 24,
    wood: 12,
    sand: 12,
    leaves: 8
  };

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
    walkSpeed: 5.7,
    sprintSpeed: 8.4,
    jumpSpeed: 9.0,
    onGround: false,
    health: 20,
    maxHealth: 20,
    deaths: 0,
    fallStartY: 0
  };

  const worldClock = {
    timeOfDay: 0.27,
    dayLengthSeconds: 240
  };

  const keys = Object.create(null);
  let pointerLocked = false;
  let messageTimer = 0;
  let daylightLevel = 1;

  buildHotbar();
  generateWorld();
  spawnPlayer(false);
  updateSky(0);
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
        refreshHotbar();
      }
    }
    if (event.code === "Space") {
      event.preventDefault();
    }
  });

  document.addEventListener("keyup", (event) => {
    keys[event.code] = false;
  });

  window.addEventListener("wheel", (event) => {
    if (!pointerLocked) {
      return;
    }
    const direction = Math.sign(event.deltaY);
    if (!direction) {
      return;
    }
    selectedBlockIndex =
      (selectedBlockIndex + direction + HOTBAR_BLOCKS.length) % HOTBAR_BLOCKS.length;
    refreshHotbar();
  });

  window.addEventListener("mousedown", (event) => {
    if (!pointerLocked) {
      return;
    }

    if (event.button === 0) {
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

    updateSky(dt);
    updateCamera();
    updateHud();
    updateMessage(dt);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  function updatePlayer(dt) {
    const wasOnGround = player.onGround;
    const moveForward = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const moveSide = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const moveSpeed = keys.ShiftLeft || keys.ShiftRight ? player.sprintSpeed : player.walkSpeed;

    tmpVec.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    tmpVec2.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

    const moveDir = new THREE.Vector3(0, 0, 0);
    moveDir.addScaledVector(tmpVec, moveForward);
    moveDir.addScaledVector(tmpVec2, moveSide);
    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
    }

    player.vel.x = moveDir.x * moveSpeed;
    player.vel.z = moveDir.z * moveSpeed;

    if (keys.Space && player.onGround) {
      player.vel.y = player.jumpSpeed;
      player.onGround = false;
      player.fallStartY = player.pos.y;
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

    let hitGround = false;
    const nextY = player.pos.clone();
    const movingDown = player.vel.y <= 0;
    nextY.y += player.vel.y * dt;
    if (!collidesAt(nextY)) {
      player.pos.y = nextY.y;
    } else {
      if (movingDown) {
        hitGround = true;
      }
      player.vel.y = 0;
    }

    const groundProbe = player.pos.clone();
    groundProbe.y -= 0.08;
    player.onGround = hitGround || collidesAt(groundProbe);

    if (!wasOnGround && player.onGround) {
      applyFallDamage();
    } else if (wasOnGround && !player.onGround) {
      player.fallStartY = player.pos.y;
    } else if (!player.onGround && player.vel.y > 0) {
      player.fallStartY = Math.max(player.fallStartY, player.pos.y);
    }

    if (player.pos.y < WORLD_FLOOR - 24) {
      damagePlayer(player.maxHealth, "You fell into the void.");
    }
  }

  function applyFallDamage() {
    const fallDistance = player.fallStartY - player.pos.y;
    if (fallDistance <= 3.5) {
      return;
    }

    const damage = Math.floor(fallDistance - 3);
    if (damage > 0) {
      damagePlayer(damage, `Fall damage: -${damage} HP`);
    }
  }

  function updateSky(dt) {
    worldClock.timeOfDay =
      (worldClock.timeOfDay + dt / worldClock.dayLengthSeconds) % 1;

    const angle = worldClock.timeOfDay * Math.PI * 2;
    const sunX = Math.cos(angle) * 45;
    const sunY = Math.sin(angle) * 45;
    sun.position.set(sunX, sunY, 18);

    daylightLevel = THREE.MathUtils.clamp((sunY + 8) / 20, 0.05, 1);

    ambient.intensity = 0.3 + daylightLevel * 0.7;
    sun.intensity = 0.06 + daylightLevel * 1.08;

    const dayColor = new THREE.Color(0x87c9ff);
    const duskColor = new THREE.Color(0x6e84c5);
    const nightColor = new THREE.Color(0x101826);

    const skyColor = new THREE.Color();
    if (daylightLevel > 0.35) {
      const blendToDay = (daylightLevel - 0.35) / 0.65;
      skyColor.copy(duskColor).lerp(dayColor, blendToDay);
    } else {
      const blendToDusk = daylightLevel / 0.35;
      skyColor.copy(nightColor).lerp(duskColor, blendToDusk);
    }

    scene.background.copy(skyColor);
    scene.fog.color.copy(skyColor);
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

  function generateWorld() {
    for (let x = -WORLD_RADIUS; x <= WORLD_RADIUS; x++) {
      for (let z = -WORLD_RADIUS; z <= WORLD_RADIUS; z++) {
        if (x * x + z * z > (WORLD_RADIUS + 1) * (WORLD_RADIUS + 1)) {
          continue;
        }

        const h = terrainY(x, z);
        terrainHeight.set(columnKey(x, z), h);
        const startY = Math.max(WORLD_FLOOR, h - 4);

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
        if (h >= 3 && treeNoise > 0.978 && Math.abs(x) + Math.abs(z) > 8) {
          growTree(x, h + 1, z);
        }
      }
    }
  }

  function growTree(x, y, z) {
    addBlock(x, y, z, "wood");
    addBlock(x, y + 1, z, "wood");
    addBlock(x, y + 2, z, "wood");
    addBlock(x, y + 3, z, "wood");

    for (let ox = -2; ox <= 2; ox++) {
      for (let oy = 2; oy <= 5; oy++) {
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
    const wave = Math.sin(x * 0.19) * 2.1 + Math.cos(z * 0.17) * 1.9;
    const ridge = Math.sin((x + z) * 0.08) * 1.7;
    const bumpy = (hash2(x, z) - 0.5) * 2.8;
    return Math.floor(5 + wave + ridge + bumpy);
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
      return null;
    }
    scene.remove(block.mesh);
    blocks.delete(key);
    const idx = solidMeshes.indexOf(block.mesh);
    if (idx >= 0) {
      solidMeshes.splice(idx, 1);
    }
    return block;
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
    if (!pos || pos.y <= WORLD_FLOOR) {
      return;
    }

    const removed = removeBlock(pos.x, pos.y, pos.z);
    if (!removed) {
      return;
    }

    updateColumnAfterChange(pos.x, pos.z, pos.y, false);
    if (Object.prototype.hasOwnProperty.call(inventory, removed.type)) {
      inventory[removed.type] += 1;
      refreshHotbar();
    }
    showMessage(`Mined ${removed.type}`, "#e6f3ff", 350);
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

    if (y < WORLD_FLOOR || y > WORLD_TOP_SCAN + 20) {
      return;
    }
    if (hasBlock(x, y, z)) {
      return;
    }
    if (wouldIntersectPlayerBlock(x, y, z)) {
      return;
    }

    const type = HOTBAR_BLOCKS[selectedBlockIndex];
    if ((inventory[type] || 0) <= 0) {
      showMessage(`Out of ${type}`, "#ffb6b6", 500);
      return;
    }

    if (addBlock(x, y, z, type)) {
      inventory[type] -= 1;
      refreshHotbar();
      updateColumnAfterChange(x, z, y, true);
      showMessage(`Placed ${type}`, "#d0ffd6", 320);
    }
  }

  function getAimedBlock() {
    raycaster.setFromCamera(centerPointer, camera);
    const hits = raycaster.intersectObjects(solidMeshes, false);
    return hits.length ? hits[0] : null;
  }

  function damagePlayer(amount, reasonText) {
    if (amount <= 0) {
      return;
    }

    player.health -= amount;
    if (player.health > 0) {
      if (reasonText) {
        showMessage(reasonText, "#ffd6d6", 700);
      }
      return;
    }

    player.health = 0;
    player.deaths += 1;
    showMessage("You died. Respawning...", "#ff9f9f", 1300);
    spawnPlayer(true);
  }

  function spawnPlayer(randomSpawn) {
    const spawn = chooseSpawn(randomSpawn ? 10 : 0);
    player.pos.set(spawn.x + 0.5, spawn.y + 0.01, spawn.z + 0.5);
    player.vel.set(0, 0, 0);
    player.health = player.maxHealth;
    player.onGround = false;
    player.fallStartY = player.pos.y;
    if (randomSpawn) {
      player.pitch = 0;
    }
  }

  function chooseSpawn(minDistanceFromCenter) {
    for (let i = 0; i < 180; i++) {
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

    for (let scan = WORLD_TOP_SCAN + 20; scan >= WORLD_FLOOR; scan--) {
      if (hasBlock(bx, scan, bz)) {
        return scan + 1;
      }
    }
    return WORLD_FLOOR + 1;
  }

  function updateColumnAfterChange(x, z, changedY, isAdded) {
    const key = columnKey(x, z);
    if (isAdded) {
      const current = terrainHeight.get(key);
      if (typeof current !== "number" || changedY > current) {
        terrainHeight.set(key, changedY);
      }
      return;
    }

    const current = terrainHeight.get(key);
    if (typeof current === "number" && changedY < current) {
      return;
    }

    for (let scan = WORLD_TOP_SCAN + 20; scan >= WORLD_FLOOR; scan--) {
      if (hasBlock(x, scan, z)) {
        terrainHeight.set(key, scan);
        return;
      }
    }
    terrainHeight.delete(key);
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

  function buildHotbar() {
    HOTBAR_BLOCKS.forEach((name) => {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.dataset.block = name;
      hotbarEl.appendChild(slot);
    });
    refreshHotbar();
  }

  function refreshHotbar() {
    const nodes = hotbarEl.querySelectorAll(".slot");
    nodes.forEach((node, index) => {
      const block = HOTBAR_BLOCKS[index];
      const amount = inventory[block] || 0;
      node.textContent = `${index + 1} ${block} (${amount})`;
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
    const bx = Math.floor(player.pos.x);
    const by = Math.floor(player.pos.y);
    const bz = Math.floor(player.pos.z);
    const dayState = daylightLevel > 0.35 ? "Day" : "Night";
    const held = HOTBAR_BLOCKS[selectedBlockIndex];
    const heldCount = inventory[held] || 0;

    statsEl.textContent =
      `HP: ${Math.ceil(player.health)}/${player.maxHealth}  ` +
      `Deaths: ${player.deaths}  ` +
      `Pos: ${bx},${by},${bz}  ` +
      `${dayState}  ` +
      `Held: ${held} (${heldCount})`;
  }
})();
