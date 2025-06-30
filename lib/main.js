const map = L.map("map").setView([35.681236, 139.767125], 13); // 東京駅周辺
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// 座標計算機
function calculateCoords(lat, lon, respawnLat, respawnLon, pre = 3, exp = 0) {
  // 指定有効数字 pre で切り捨て
  function truncateToPrecision(value, precision) {
    const factor = Math.pow(10, precision);
    return Math.trunc(value * factor) / factor;
  }
  lat = truncateToPrecision(lat, pre);
  lon = truncateToPrecision(lon, pre);
  respawnLat = truncateToPrecision(respawnLat, pre);
  respawnLon = truncateToPrecision(respawnLon, pre);

  const dy = ((lat - respawnLat) * Math.pow(10, exp))
    .toFixed(pre)
    .replace(/\.?0+$/, "");
  const dx = ((lon - respawnLon) * Math.pow(10, exp))
    .toFixed(pre)
    .replace(/\.?0+$/, "");
  return { dy, dx };
}

// calculateCoords呼び出し時に設定値を取得
function getCoordsSettings() {
  let pre = parseInt(document.getElementById("coord-pre")?.value, 10);
  let exp = parseInt(document.getElementById("coord-exp")?.value, 10);
  // localStorageから取得（未入力時）
  if (isNaN(pre)) pre = parseInt(localStorage.getItem("coord-pre"), 10) || 3;
  if (isNaN(exp)) exp = parseInt(localStorage.getItem("coord-exp"), 10) || 0;
  return { pre, exp };
}

// 設定保存
function saveCoordsSettings() {
  const pre = parseInt(document.getElementById("coord-pre")?.value, 10);
  const exp = parseInt(document.getElementById("coord-exp")?.value, 10);
  if (!isNaN(pre)) localStorage.setItem("coord-pre", pre);
  if (!isNaN(exp)) localStorage.setItem("coord-exp", exp);
}

// 座標取得関数
function getRespawnCoordsFromUrlOrLast() {
  const url = new URL(window.location);
  let lat = url.searchParams.get("respawnLat");
  let lon = url.searchParams.get("respawnLon");
  if (lat && lon) {
    return { lat: parseFloat(lat), lon: parseFloat(lon) };
  }
  // なければ最後のリスポーン地点を取得し、URLに書き込む
  const respawnList = JSON.parse(localStorage.getItem("respawn-list") || "[]");
  const selectedRespawnIdx = Number(
    localStorage.getItem("selected-respawn-idx") || 0
  );
  const respawn = respawnList[selectedRespawnIdx];
  if (respawn) {
    url.searchParams.set("respawnLat", respawn.lat);
    url.searchParams.set("respawnLon", respawn.lng);
    url.searchParams.set("respawnName", respawn.name);
    window.history.replaceState({}, "", url);
    return { lat: respawn.lat, lon: respawn.lng };
  }
  return null;
}

// ハーヴァサインの公式を用いて、緯度と経路から原点までの直線距離を計算
function distanceFromOrigin(lat, lon) {
  const R = 6371; // 地球の半径 (km)
  const lat1 = 0; // 0, 0 の緯度
  const lon1 = 0; // 0, 0 の経度

  const dLat = toRadians(lat - lat1);
  const dLon = toRadians(lon - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

// 中心座標を取得して表示する関数
function updateCenterCoords() {
  const center = map.getCenter();
  const respawnCoords = getRespawnCoordsFromUrlOrLast();
  let text;
  if (respawnCoords) {
    const { pre, exp } = getCoordsSettings();
    const { dx, dy } = calculateCoords(
      center.lat,
      center.lng,
      respawnCoords.lat,
      respawnCoords.lon,
      pre,
      exp
    );
    text = `${distanceFromOrigin(dy, dx).toFixed(2)} [km] (${dy}, ${dx})`;
  } else {
    text = `(${center.lat.toFixed(6)}, ${center.lng.toFixed(6)})`;
  }
  const coordsElem = document.getElementById("center-coords");
  if (coordsElem) coordsElem.textContent = text;

  // URLパラメータを更新
  const url = new URL(window.location);
  url.searchParams.set("lat", center.lat.toFixed(6));
  url.searchParams.set("lon", center.lng.toFixed(6));
  window.history.replaceState({}, "", url);
}

// 地図移動時に座標を更新
// map.on("move", updateCenterCoords); // ← これを無効化
map.on("moveend", updateCenterCoords); // ドラッグ終了やズーム終了時のみ更新
// 初期表示
updateCenterCoords();

// 現在地ボタンの取得
const locateBtn = document.querySelector("#floating-menu button");
locateBtn.addEventListener("click", function () {
  if (!navigator.geolocation) {
    alert("このブラウザは位置情報取得に対応していません");
    return;
  }
  locateBtn.disabled = true;
  locateBtn.textContent = "取得中...";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      map.setView([lat, lng], 16);
      locateBtn.textContent = "現在地の取得";
      locateBtn.disabled = false;
    },
    (err) => {
      alert("位置情報の取得に失敗しました");
      locateBtn.textContent = "現在地の取得";
      locateBtn.disabled = false;
    }
  );
});

document.addEventListener("DOMContentLoaded", async function () {
  // default_respawn.jsonの読み込み
  async function loadDefaultRespawn() {
    const res = await fetch("./lib/default_respawn.json");
    if (!res.ok) return [];
    return await res.json();
  }

  // リスポーンリストの取得・保存
  function getRespawnList() {
    const data = localStorage.getItem("respawn-list");
    if (data) return JSON.parse(data);
    return null;
  }
  function saveRespawnList(list) {
    localStorage.setItem("respawn-list", JSON.stringify(list));
  }

  // リスポーンリストの初期化
  let respawnList = getRespawnList();
  if (!respawnList) {
    respawnList = await loadDefaultRespawn();
    saveRespawnList(respawnList);
  }

  // 選択中リスポーンindex
  let selectedRespawnIdx = 0;

  // 選択中リスポーン地点をURLパラメータに反映
  function updateRespawnParams() {
    const item = respawnList[selectedRespawnIdx];
    if (!item) return;
    const url = new URL(window.location);
    url.searchParams.set("respawnName", item.name);
    url.searchParams.set("respawnLat", item.lat);
    url.searchParams.set("respawnLon", item.lng);
    window.history.replaceState({}, "", url);
  }

  // 新規作成ボタンをrespawn-listの直後に挿入
  function insertAddButton() {
    let addBtn = document.getElementById("add-respawn-btn");
    if (!addBtn) {
      addBtn = document.createElement("button");
      addBtn.id = "add-respawn-btn";
      addBtn.textContent = "新規作成";
      addBtn.style.background = "#1976d2";
      addBtn.style.color = "#fff";
      addBtn.style.marginTop = "8px";
      addBtn.style.width = "100%";
      addBtn.style.borderRadius = "8px";
      addBtn.style.border = "none";
      addBtn.style.padding = "8px 0";
      addBtn.style.fontSize = "1rem";
      addBtn.addEventListener("click", function () {
        respawnNameInput.value = "";
        respawnLatInput.value = "";
        respawnLngInput.value = "";
        selectedRespawnIdx = respawnList.length; // 新規作成用index
        renderRespawnList();
      });
    }
    const listElem = document.getElementById("respawn-list");
    if (listElem && addBtn.parentNode !== listElem.parentNode) {
      listElem.parentNode.insertBefore(addBtn, listElem.nextSibling);
    }
  }

  // リスポーンリスト描画
  function renderRespawnList() {
    const listElem = document.getElementById("respawn-list");
    listElem.innerHTML = "";
    respawnList.forEach((item, idx) => {
      const div = document.createElement("div");
      div.className =
        "respawn-item" + (idx === selectedRespawnIdx ? " selected" : "");
      div.innerHTML = `
        <input type="radio" name="respawn-select" ${
          idx === selectedRespawnIdx ? "checked" : ""
        } data-idx="${idx}">
        <span class="respawn-name">${item.name}</span>
        <span class="respawn-coords">(${item.lat.toFixed(
          6
        )}, ${item.lng.toFixed(6)})</span>
        <button class="delete-respawn">×</button>
      `;
      div
        .querySelector('input[type="radio"]')
        .addEventListener("change", () => {
          selectedRespawnIdx = idx;
          renderRespawnList();
          updateRespawnParams();
        });
      div.querySelector(".delete-respawn").addEventListener("click", () => {
        if (respawnList.length <= 1) {
          alert("最低1つは残す必要があります");
          return;
        }
        respawnList.splice(idx, 1);
        if (selectedRespawnIdx >= respawnList.length)
          selectedRespawnIdx = respawnList.length - 1;
        saveRespawnList(respawnList);
        renderRespawnList();
        updateRespawnParams();
      });
      listElem.appendChild(div);
    });
    insertAddButton();
    updateRespawnParams();
  }

  // 設定画面の表示・非表示制御
  const settingsBtn = document.getElementById("floating-menu-settings");
  const settingsModal = document.getElementById("settings-modal");
  const closeSettingsBtn = document.getElementById("close-settings");
  const setCurrentCenterBtn = document.getElementById("set-current-center");
  const saveRespawnBtn = document.getElementById("save-respawn");
  const respawnNameInput = document.getElementById("respawn-name");
  const respawnLatInput = document.getElementById("respawn-lat");
  const respawnLngInput = document.getElementById("respawn-lng");

  settingsBtn.addEventListener("click", function () {
    renderRespawnList();
    // 選択中の値をフォームにセット
    if (respawnList[selectedRespawnIdx]) {
      const item = respawnList[selectedRespawnIdx];
      respawnNameInput.value = item.name;
      respawnLatInput.value = item.lat;
      respawnLngInput.value = item.lng;
    } else {
      respawnNameInput.value = "";
      respawnLatInput.value = "";
      respawnLngInput.value = "";
    }
    settingsModal.classList.add("active");
    settingsModal.style.display = "flex";
    // Esc キーを押下して閉じる（キャンセル）
    window.addEventListener(
      "keydown",
      function (e) {
        if (e.key === "Escape" && !e.isComposing) {
          closeSettingsBtn.click();
        }
      },
      { once: true }
    );
  });
  closeSettingsBtn.addEventListener("click", function () {
    settingsModal.classList.remove("active");
    settingsModal.style.display = "none";
  });
  // モーダルの外側をクリックして閉じる（キャンセル）
  settingsModal.addEventListener("click", function () {
    closeSettingsBtn.click();
  });
  // ただし、モーダルの本体をクリックしては閉じない
  settingsModal
    .querySelector(".modal-content")
    .addEventListener("click", (e) => {
      e.stopPropagation();
    });
  setCurrentCenterBtn.addEventListener("click", function () {
    const c = map.getCenter();
    respawnLatInput.value = c.lat.toFixed(6);
    respawnLngInput.value = c.lng.toFixed(6);
  });
  saveRespawnBtn.addEventListener("click", function () {
    const name = respawnNameInput.value.trim() || "No name";
    const lat = parseFloat(respawnLatInput.value);
    const lng = parseFloat(respawnLngInput.value);
    if (!isNaN(lat) && !isNaN(lng)) {
      // 新規作成 / 上書きか判定
      const isNew = !respawnList.some(
        (item, idx) => idx === selectedRespawnIdx
      );
      if (isNew) {
        respawnList.push({ name, lat, lng });
        selectedRespawnIdx = respawnList.length - 1;
      } else {
        respawnList[selectedRespawnIdx] = { name, lat, lng };
      }
      saveRespawnList(respawnList);
      alert("リスポーン地点を保存しました");
      renderRespawnList();
      settingsModal.classList.remove("active");
      settingsModal.style.display = "none";
    } else {
      alert("有効な座標を入力してください");
    }
  });

  // リストクリックでフォームに反映
  document.getElementById("respawn-list").addEventListener("click", (e) => {
    const radio = e.target.closest('input[type="radio"]');
    if (radio) {
      const idx = parseInt(radio.dataset.idx);
      if (!isNaN(idx)) {
        selectedRespawnIdx = idx;
        const item = respawnList[selectedRespawnIdx];
        respawnNameInput.value = item.name;
        respawnLatInput.value = item.lat;
        respawnLngInput.value = item.lng;
      }
    }
  });

  // ページ初期表示時にURLパラメータまたは最後の選択を反映
  function selectRespawnFromParamsOrLast() {
    const url = new URL(window.location);
    const pname = url.searchParams.get("respawnName");
    const plat = url.searchParams.get("respawnLat");
    const plon = url.searchParams.get("respawnLon");
    let found = false;
    if (pname && plat && plon) {
      // パラメータに一致する地点を探す
      const idx = respawnList.findIndex(
        (item) =>
          item.name === pname &&
          String(item.lat) === String(Number(plat)) &&
          String(item.lng) === String(Number(plon))
      );
      if (idx >= 0) {
        selectedRespawnIdx = idx;
        found = true;
      } else {
        // パラメータで新規地点を一時的に追加
        respawnList.push({ name: pname, lat: Number(plat), lng: Number(plon) });
        selectedRespawnIdx = respawnList.length - 1;
        saveRespawnList(respawnList);
        found = true;
      }
    }
    if (!found) {
      // 何もなければ最後の選択を使う（localStorageのまま）
      // 何もしない
    }
    renderRespawnList();
  }

  // --- ページ初期化時に呼び出し ---
  selectRespawnFromParamsOrLast();

  // Share With X ボタンのリダイレクト処理
  const shareBtn = document.getElementById("floating-menu-share");
  if (shareBtn) {
    shareBtn.addEventListener("click", function () {
      const url = window.location.href;
      const coordsElem = document.getElementById("center-coords");
      const text = coordsElem ? coordsElem.textContent : "";
      // リスポーン地点名取得
      const respawnName =
        new URL(window.location).searchParams.get("respawnName") || "";
      const shareUrl = `http://twitter.com/share?url=${encodeURIComponent(
        url
      )}&text=${encodeURIComponent(text + " from " + respawnName)}`;
      window.open(shareUrl, "_blank");
    });
  }
});
