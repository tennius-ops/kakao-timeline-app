/**
 * 카카오맵 타임라인 (My Timeline) - 메인 스크립트
 * - 카카오맵 JavaScript SDK 모드 & 즉시 실행 미리보기 지도(Leaflet) 하이브리드 지원
 * - 날짜별 방문 장소 기록, 시간순 자동 정렬, 이동 경로(Polyline) 그리기, 거리 자동 계산
 */

const STORAGE_KEY_DATA = "kakao_timeline_records_v1";
const STORAGE_KEY_API = "kakao_timeline_js_key";

// 현재 앱 상태
const state = {
  currentDate: getTodayString(),
  recordsByDate: {}, // { "2026-11-17": [ { id, name, category, transport, arrivalTime, departureTime, address, lat, lng, memo } ] }
  engine: "preview", // "kakao" | "preview"
  showRouteLine: true,
  activePlaceId: null,
  // 지도 인스턴스 및 오버레이 보관함
  kakaoMap: null,
  kakaoOverlays: [],
  kakaoPolyline: null,
  kakaoPlacesService: null,
  kakaoGeocoder: null,
  leafletMap: null,
  leafletLayerGroup: null,
};

// 내장 주요 장소 사전 (카카오 키 입력 전에도 검색 테스트가 바로 되도록 지원)
const BUILTIN_PLACES = [
  { name: "강남역 2호선", address: "서울 강남구 강남대로 396", lat: 37.497952, lng: 127.027619, category: "🚉 교통/역" },
  { name: "성수 카페거리", address: "서울 성동구 성수이로 78", lat: 37.543525, lng: 127.056002, category: "☕ 카페" },
  { name: "서울숲 공원", address: "서울 성동구 뚝섬로 273", lat: 37.544388, lng: 127.037442, category: "🌳 공원/여가" },
  { name: "코엑스 별마당도서관", address: "서울 강남구 영동대로 513", lat: 37.511555, lng: 127.059526, category: "🛍️ 쇼핑" },
  { name: "남산서울타워", address: "서울 용산구 남산공원길 105", lat: 37.551169, lng: 126.988227, category: "🌳 공원/여가" },
  { name: "여의도 더현대 서울", address: "서울 영등포구 여의대로 108", lat: 37.52587, lng: 126.928446, category: "🛍️ 쇼핑" },
  { name: "홍대입구역", address: "서울 마포구 양화로 160", lat: 37.557192, lng: 126.925381, category: "🚉 교통/역" },
  { name: "광화문광장", address: "서울 종로구 세종대로 172", lat: 37.572525, lng: 126.97691, category: "🌳 공원/여가" },
  { name: "잠실 롯데월드타워", address: "서울 송파구 올림픽로 300", lat: 37.512562, lng: 127.102543, category: "🛍️ 쇼핑" },
  { name: "판교테크노밸리", address: "경기 성남시 분당구 판교역로", lat: 37.402056, lng: 127.10891, category: "🏢 회사/학교" },
];

// 오늘 날짜 YYYY-MM-DD 반환
function getTodayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 현재 시각 HH:MM 반환
function getCurrentTimeString(offsetMinutes = 0) {
  const now = new Date(Date.now() + offsetMinutes * 60000);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// 두 좌표(위도, 경도) 사이의 직선 거리(km) 계산 (하버사인 공식)
function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // 지구 반지름 (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 샘플 데이터 생성 (처음 실행했을 때 바로 타임라인을 볼 수 있도록!)
function createSampleDataForDate(dateStr) {
  return [
    {
      id: "sample-1",
      name: "우리집 (출발)",
      category: "🏠 집",
      transport: "🚶 도보",
      arrivalTime: "08:30",
      departureTime: "09:00",
      address: "서울 성동구 왕십리로",
      lat: 37.5472,
      lng: 127.0438,
      memo: "상쾌하게 하루 시작! 아침 챙겨 먹고 출발~",
    },
    {
      id: "sample-2",
      name: "성수 로스터리 카페",
      category: "☕ 카페",
      transport: "🚶 도보",
      arrivalTime: "09:20",
      departureTime: "11:30",
      address: "서울 성동구 성수이로 78",
      lat: 37.5435,
      lng: 127.056,
      memo: "아이스 바닐라라떼 마시면서 타임라인 앱 기획 & 코딩 💻",
    },
    {
      id: "sample-3",
      name: "서울숲 산책로",
      category: "🌳 공원/여가",
      transport: "🚲 자전거/킥보드",
      arrivalTime: "12:00",
      departureTime: "13:30",
      address: "서울 성동구 뚝섬로 273",
      lat: 37.5444,
      lng: 127.0374,
      memo: "점심 먹고 따릉이 타고 서울숲 한 바퀴 산책!",
    },
    {
      id: "sample-4",
      name: "코엑스 별마당도서관",
      category: "🛍️ 쇼핑",
      transport: "🚇 지하철/버스",
      arrivalTime: "14:15",
      departureTime: "17:00",
      address: "서울 강남구 영동대로 513",
      lat: 37.5116,
      lng: 127.0595,
      memo: "새로 나온 IT 책 구경하고 저녁 약속 장소로 이동!",
    },
    {
      id: "sample-5",
      name: "강남역 맛집 거리",
      category: "🍽️ 식당",
      transport: "🚇 지하철/버스",
      arrivalTime: "17:30",
      departureTime: "19:30",
      address: "서울 강남구 강남대로 396",
      lat: 37.498,
      lng: 127.0276,
      memo: "맛있는 저녁 식사! 오늘 하루도 알차게 보냈다 ✨",
    },
  ];
}

// 로컬 스토리지에서 데이터 불러오기
function loadDataFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DATA);
    if (raw) {
      state.recordsByDate = JSON.parse(raw);
    } else {
      // 최초 방문 시 오늘 날짜에 샘플 데이터 세팅
      state.recordsByDate[state.currentDate] = createSampleDataForDate(state.currentDate);
      saveDataToStorage();
    }
  } catch (err) {
    console.error("데이터 로드 실패:", err);
    state.recordsByDate[state.currentDate] = createSampleDataForDate(state.currentDate);
  }
}

// 로컬 스토리지에 데이터 저장하기
function saveDataToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(state.recordsByDate));
  } catch (err) {
    console.error("데이터 저장 실패:", err);
  }
}

// 현재 날짜의 타임라인 배열 가져오기 (도착 시간순 정렬 보장)
function getCurrentRecords() {
  const list = state.recordsByDate[state.currentDate] || [];
  list.sort((a, b) => (a.arrivalTime || "").localeCompare(b.arrivalTime || ""));
  return list;
}

// ===================================================
// 지도 엔진 초기화 (카카오맵 SDK vs 미리보기 지도)
// ===================================================
function initMapEngine() {
  const savedKakaoKey = localStorage.getItem(STORAGE_KEY_API);
  if (savedKakaoKey && savedKakaoKey.trim().length > 10) {
    document.getElementById("kakaoKeyInput").value = savedKakaoKey.trim();
    loadKakaoMapSdk(savedKakaoKey.trim());
  } else {
    initPreviewLeafletMap();
  }
}

// 1) 실제 카카오맵 SDK 동적 로드 및 초기화
function loadKakaoMapSdk(appKey) {
  updateEngineStatusUI("loading", "카카오맵 연결 중...");

  // 이미 kakao.maps가 로드되어 있는 경우
  if (window.kakao && window.kakao.maps) {
    setupKakaoMapInstance();
    return;
  }

  const existingScript = document.getElementById("kakao-sdk-script");
  if (existingScript) existingScript.remove();

  const script = document.createElement("script");
  script.id = "kakao-sdk-script";
  script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
    appKey
  )}&libraries=services&autoload=false`;
  script.onload = () => {
    if (window.kakao && window.kakao.maps) {
      window.kakao.maps.load(() => {
        setupKakaoMapInstance();
      });
    } else {
      handleKakaoLoadFailure();
    }
  };
  script.onerror = () => {
    handleKakaoLoadFailure();
  };
  document.head.appendChild(script);
}

function handleKakaoLoadFailure() {
  alert(
    "카카오맵 SDK를 불러오지 못했어요! 😢\n\n" +
      "1) 카카오 JavaScript 키가 맞는지\n" +
      "2) 카카오 디벨로퍼스 [플랫폼 > Web]에 현재 주소(예: http://localhost 또는 http://127.0.0.1)가 등록되어 있는지 확인해주세요!\n\n" +
      "우선 즉시 사용 가능한 미리보기 지도로 전환할게요."
  );
  initPreviewLeafletMap();
}

function setupKakaoMapInstance() {
  // 기존 Leaflet 지도가 있으면 정리
  if (state.leafletMap) {
    state.leafletMap.remove();
    state.leafletMap = null;
  }

  const mapContainer = document.getElementById("map");
  mapContainer.innerHTML = "";

  const center = new kakao.maps.LatLng(37.535, 127.04);
  const options = {
    center,
    level: 6,
  };

  state.kakaoMap = new kakao.maps.Map(mapContainer, options);
  state.kakaoPlacesService = new kakao.maps.services.Places();
  state.kakaoGeocoder = new kakao.maps.services.Geocoder();
  state.engine = "kakao";

  updateEngineStatusUI("kakao", "카카오맵 엔진 ON");

  // 카카오 지도 클릭 이벤트: 클릭한 위치에 새 발자취 추가 모달 열기
  kakao.maps.event.addListener(state.kakaoMap, "click", (mouseEvent) => {
    const latlng = mouseEvent.latLng;
    const lat = Number(latlng.getLat().toFixed(6));
    const lng = Number(latlng.getLng().toFixed(6));

    // 역지오코딩(좌표 -> 주소 변환)
    if (state.kakaoGeocoder) {
      state.kakaoGeocoder.coord2Address(lng, lat, (result, status) => {
        let addr = "지도에서 선택한 위치";
        if (status === kakao.maps.services.Status.OK && result[0]) {
          addr = result[0].road_address
            ? result[0].road_address.address_name
            : result[0].address.address_name;
        }
        openPlaceModalForCreate({ lat, lng, address: addr });
      });
    } else {
      openPlaceModalForCreate({ lat, lng, address: "지도에서 선택한 위치" });
    }
  });

  renderAll();
  fitMapBounds();
}

// 2) 키 없이도 즉시 작동하는 미리보기 지도(Leaflet) 초기화
function initPreviewLeafletMap() {
  state.engine = "preview";
  updateEngineStatusUI("preview", "미리보기 지도 (키 설정 가능)");

  const mapContainer = document.getElementById("map");
  if (state.leafletMap) {
    state.leafletMap.remove();
  }
  mapContainer.innerHTML = "";

  state.leafletMap = L.map("map", {
    zoomControl: false,
  }).setView([37.535, 127.04], 13);

  L.control.zoom({ position: "bottomleft" }).addTo(state.leafletMap);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap & CartoDB",
    maxZoom: 19,
  }).addTo(state.leafletMap);

  state.leafletLayerGroup = L.layerGroup().addTo(state.leafletMap);

  // 지도 클릭 이벤트
  state.leafletMap.on("click", (e) => {
    const lat = Number(e.latlng.lat.toFixed(6));
    const lng = Number(e.latlng.lng.toFixed(6));
    openPlaceModalForCreate({
      lat,
      lng,
      address: `위도 ${lat}, 경도 ${lng} 부근`,
    });
  });

  renderAll();
  fitMapBounds();
}

function updateEngineStatusUI(mode, text) {
  const dot = document.getElementById("engineStatusDot");
  const label = document.getElementById("engineStatusText");
  dot.className = "status-dot " + (mode === "kakao" ? "kakao" : "preview");
  label.textContent = text;
}

// ===================================================
// 화면 렌더링 (타임라인 리스트 + 통계 + 지도 마커/경로선)
// ===================================================
function renderAll() {
  const records = getCurrentRecords();
  renderStats(records);
  renderTimelineList(records);
  renderMapMarkersAndRoute(records);
}

// 상단 요약 통계 계산 및 표시
function renderStats(records) {
  document.getElementById("statPlaces").textContent = `${records.length}곳`;

  let totalDist = 0;
  const transportCount = {};

  for (let i = 0; i < records.length; i++) {
    if (i > 0) {
      totalDist += getDistanceKm(
        records[i - 1].lat,
        records[i - 1].lng,
        records[i].lat,
        records[i].lng
      );
      const tr = records[i].transport || "🚶 도보";
      transportCount[tr] = (transportCount[tr] || 0) + 1;
    }
  }

  document.getElementById("statDistance").textContent = `${totalDist.toFixed(1)} km`;

  let mainTransport = "-";
  let maxCnt = 0;
  for (const [k, cnt] of Object.entries(transportCount)) {
    if (cnt > maxCnt) {
      maxCnt = cnt;
      mainTransport = k;
    }
  }
  if (records.length === 1) {
    mainTransport = records[0].transport || "🚶 도보";
  }
  document.getElementById("statTransport").textContent = mainTransport;
}

// 왼쪽 타임라인 카드 리스트 렌더링
function renderTimelineList(records) {
  const container = document.getElementById("timelineList");
  container.innerHTML = "";

  if (records.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🗺️</div>
        <h3>이 날짜에는 아직 기록된 발자취가 없어요!</h3>
        <p>
          오른쪽 지도를 <strong>클릭</strong>하거나 상단의 <strong>[장소 추가]</strong>,
          <strong>[예시 보기]</strong> 버튼을 눌러 타임라인을 채워보세요.
        </p>
      </div>
    `;
    return;
  }

  records.forEach((item, index) => {
    const node = document.createElement("div");
    node.className = "timeline-node";

    // 이전 장소로부터의 이동 거리 & 이동 수단 배지 (2번째 장소부터 표시)
    let transitHtml = "";
    if (index > 0) {
      const prev = records[index - 1];
      const distKm = getDistanceKm(prev.lat, prev.lng, item.lat, item.lng);
      const distText =
        distKm < 1 ? `${Math.round(distKm * 1000)}m 이동` : `${distKm.toFixed(2)}km 이동`;
      transitHtml = `
        <div class="transit-segment">
          <span>${escapeHtml(item.transport || "🚶 도보")}</span>
          <span>·</span>
          <span class="transit-distance">${distText}</span>
        </div>
      `;
    }

    const timeRange = item.departureTime
      ? `${item.arrivalTime} ~ ${item.departureTime}`
      : `${item.arrivalTime} 도착`;

    node.innerHTML = `
      ${transitHtml}
      <div class="node-Pin">${index + 1}</div>
      <div class="place-card ${state.activePlaceId === item.id ? "active" : ""}" data-id="${item.id}">
        <div class="place-card-header">
          <div class="place-title-group">
            <span class="place-category-badge">${escapeHtml(item.category || "📌 기타")}</span>
            <span class="place-name">${escapeHtml(item.name)}</span>
          </div>
          <span class="place-time">${escapeHtml(timeRange)}</span>
        </div>
        <div class="place-address">📍 ${escapeHtml(item.address || "주소 정보 없음")}</div>
        ${
          item.memo
            ? `<div class="place-memo">${escapeHtml(item.memo)}</div>`
            : ""
        }
        <div class="place-actions">
          <button class="card-btn edit" data-action="edit" data-id="${item.id}">✏️ 수정</button>
          <button class="card-btn delete" data-action="delete" data-id="${item.id}">🗑️ 삭제</button>
        </div>
      </div>
    `;

    // 카드 클릭 시 지도 중심 이동
    const cardEl = node.querySelector(".place-card");
    cardEl.addEventListener("click", (e) => {
      const actionBtn = e.target.closest("button[data-action]");
      if (actionBtn) {
        e.stopPropagation();
        const action = actionBtn.dataset.action;
        if (action === "edit") {
          openPlaceModalForEdit(item.id);
        } else if (action === "delete") {
          deletePlaceRecord(item.id);
        }
        return;
      }
      focusOnPlace(item);
    });

    container.appendChild(node);
  });
}

// 지도 위에 번호 마커와 이동 경로(Polyline) 그리기
function renderMapMarkersAndRoute(records) {
  if (state.engine === "kakao" && state.kakaoMap) {
    renderKakaoMarkersAndRoute(records);
  } else if (state.leafletMap) {
    renderLeafletMarkersAndRoute(records);
  }
}

// 카카오맵 마커 & 폴리라인 렌더링
function renderKakaoMarkersAndRoute(records) {
  // 기존 오버레이 제거
  state.kakaoOverlays.forEach((ov) => ov.setMap(null));
  state.kakaoOverlays = [];
  if (state.kakaoPolyline) {
    state.kakaoPolyline.setMap(null);
    state.kakaoPolyline = null;
  }

  if (records.length === 0) return;

  const linePath = [];

  records.forEach((item, idx) => {
    const pos = new kakao.maps.LatLng(item.lat, item.lng);
    linePath.push(pos);

    const markerEl = document.createElement("div");
    markerEl.className = "timeline-map-marker";
    markerEl.innerHTML = `
      <span class="marker-num">${idx + 1}</span>
      <span class="marker-label">${escapeHtml(item.name)}</span>
    `;
    markerEl.addEventListener("click", (e) => {
      e.stopPropagation();
      focusOnPlace(item);
    });

    const customOverlay = new kakao.maps.CustomOverlay({
      position: pos,
      content: markerEl,
      yAnchor: 1,
    });
    customOverlay.setMap(state.kakaoMap);
    state.kakaoOverlays.push(customOverlay);
  });

  // 장소들을 순서대로 잇는 이동 경로선(Polyline)
  if (state.showRouteLine && linePath.length >= 2) {
    state.kakaoPolyline = new kakao.maps.Polyline({
      path: linePath,
      strokeWeight: 5,
      strokeColor: "#2563eb",
      strokeOpacity: 0.85,
      strokeStyle: "shortdash",
    });
    state.kakaoPolyline.setMap(state.kakaoMap);
  }
}

// 미리보기 지도(Leaflet) 마커 & 폴리라인 렌더링
function renderLeafletMarkersAndRoute(records) {
  if (!state.leafletLayerGroup) return;
  state.leafletLayerGroup.clearLayers();

  if (records.length === 0) return;

  const latlngs = [];

  records.forEach((item, idx) => {
    latlngs.push([item.lat, item.lng]);

    const icon = L.divIcon({
      className: "custom-leaflet-div-icon",
      html: `
        <div class="timeline-map-marker">
          <span class="marker-num">${idx + 1}</span>
          <span class="marker-label">${escapeHtml(item.name)}</span>
        </div>
      `,
      iconSize: [0, 0],
    });

    const marker = L.marker([item.lat, item.lng], { icon }).addTo(state.leafletLayerGroup);
    marker.on("click", () => {
      focusOnPlace(item);
    });
  });

  if (state.showRouteLine && latlngs.length >= 2) {
    L.polyline(latlngs, {
      color: "#2563eb",
      weight: 4,
      opacity: 0.85,
      dashArray: "8, 8",
    }).addTo(state.leafletLayerGroup);
  }
}

// 특정 장소 클릭 시 지도 부드럽게 이동 & 카드 하이라이트
function focusOnPlace(item) {
  state.activePlaceId = item.id;
  renderTimelineList(getCurrentRecords());

  if (state.engine === "kakao" && state.kakaoMap) {
    const moveLatLon = new kakao.maps.LatLng(item.lat, item.lng);
    state.kakaoMap.panTo(moveLatLon);
  } else if (state.leafletMap) {
    state.leafletMap.flyTo([item.lat, item.lng], 15, { duration: 0.6 });
  }
}

// 하루 전체 경로가 한눈에 들어오도록 지도 범위(Bounds) 자동 조절
function fitMapBounds() {
  const records = getCurrentRecords();
  if (records.length === 0) return;

  if (state.engine === "kakao" && state.kakaoMap) {
    const bounds = new kakao.maps.LatLngBounds();
    records.forEach((r) => bounds.extend(new kakao.maps.LatLng(r.lat, r.lng)));
    state.kakaoMap.setBounds(bounds);
  } else if (state.leafletMap) {
    const bounds = L.latLngBounds(records.map((r) => [r.lat, r.lng]));
    state.leafletMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
  }
}

// ===================================================
// 장소 추가 / 수정 / 삭제 및 GPS 현재 위치 기록
// ===================================================
function openPlaceModalForCreate(prefill = {}) {
  document.getElementById("modalTitle").textContent = "📍 새로운 발자취 추가";
  document.getElementById("editPlaceId").value = "";
  document.getElementById("placeName").value = prefill.name || "";
  document.getElementById("placeCategory").value = prefill.category || "☕ 카페";
  document.getElementById("placeTransport").value = prefill.transport || "🚶 도보";
  document.getElementById("arrivalTime").value = prefill.arrivalTime || getCurrentTimeString(0);
  document.getElementById("departureTime").value = prefill.departureTime || getCurrentTimeString(60);
  document.getElementById("placeAddress").value = prefill.address || "";

  // 기본 좌표: 지도 중심
  let defaultLat = 37.5435;
  let defaultLng = 127.056;
  if (state.engine === "kakao" && state.kakaoMap) {
    const c = state.kakaoMap.getCenter();
    defaultLat = Number(c.getLat().toFixed(6));
    defaultLng = Number(c.getLng().toFixed(6));
  } else if (state.leafletMap) {
    const c = state.leafletMap.getCenter();
    defaultLat = Number(c.lat.toFixed(6));
    defaultLng = Number(c.lng.toFixed(6));
  }

  document.getElementById("placeLat").value = prefill.lat ?? defaultLat;
  document.getElementById("placeLng").value = prefill.lng ?? defaultLng;
  document.getElementById("placeMemo").value = prefill.memo || "";

  document.getElementById("placeModal").classList.remove("hidden");
  document.getElementById("placeName").focus();
}

function openPlaceModalForEdit(placeId) {
  const records = getCurrentRecords();
  const target = records.find((r) => r.id === placeId);
  if (!target) return;

  document.getElementById("modalTitle").textContent = "✏️ 발자취 수정하기";
  document.getElementById("editPlaceId").value = target.id;
  document.getElementById("placeName").value = target.name;
  document.getElementById("placeCategory").value = target.category || "☕ 카페";
  document.getElementById("placeTransport").value = target.transport || "🚶 도보";
  document.getElementById("arrivalTime").value = target.arrivalTime || "09:00";
  document.getElementById("departureTime").value = target.departureTime || "";
  document.getElementById("placeAddress").value = target.address || "";
  document.getElementById("placeLat").value = target.lat;
  document.getElementById("placeLng").value = target.lng;
  document.getElementById("placeMemo").value = target.memo || "";

  document.getElementById("placeModal").classList.remove("hidden");
}

function closePlaceModal() {
  document.getElementById("placeModal").classList.add("hidden");
}

function handleSavePlaceForm(e) {
  e.preventDefault();
  const editId = document.getElementById("editPlaceId").value;
  const payload = {
    id: editId || "place-" + Date.now(),
    name: document.getElementById("placeName").value.trim(),
    category: document.getElementById("placeCategory").value,
    transport: document.getElementById("placeTransport").value,
    arrivalTime: document.getElementById("arrivalTime").value,
    departureTime: document.getElementById("departureTime").value,
    address: document.getElementById("placeAddress").value.trim(),
    lat: parseFloat(document.getElementById("placeLat").value),
    lng: parseFloat(document.getElementById("placeLng").value),
    memo: document.getElementById("placeMemo").value.trim(),
  };

  if (!state.recordsByDate[state.currentDate]) {
    state.recordsByDate[state.currentDate] = [];
  }

  const list = state.recordsByDate[state.currentDate];
  if (editId) {
    const idx = list.findIndex((item) => item.id === editId);
    if (idx !== -1) list[idx] = payload;
  } else {
    list.push(payload);
  }

  state.activePlaceId = payload.id;
  saveDataToStorage();
  closePlaceModal();
  renderAll();
  focusOnPlace(payload);
}

function deletePlaceRecord(placeId) {
  if (!confirm("이 발자취 기록을 삭제할까요?")) return;
  const list = state.recordsByDate[state.currentDate] || [];
  state.recordsByDate[state.currentDate] = list.filter((item) => item.id !== placeId);
  saveDataToStorage();
  renderAll();
}

// GPS(내 현재 위치) 기록 기능
function recordCurrentGpsLocation() {
  if (!navigator.geolocation) {
    alert("이 브라우저에서는 GPS 위치 기능을 지원하지 않아요 😢");
    return;
  }

  const btn = document.getElementById("btnTrackGps");
  const originalText = btn.innerHTML;
  btn.innerHTML = "<span>⏳</span> 위치 찾는 중...";

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      btn.innerHTML = originalText;
      const lat = Number(pos.coords.latitude.toFixed(6));
      const lng = Number(pos.coords.longitude.toFixed(6));
      openPlaceModalForCreate({
        name: "현재 내 위치",
        address: `GPS 측정 위치 (${lat}, ${lng})`,
        lat,
        lng,
        memo: "실시간 GPS로 기록한 발자취 🛰️",
      });
    },
    (err) => {
      btn.innerHTML = originalText;
      alert(
        "현재 위치를 가져오지 못했어요! 브라우저의 위치 권한 허용 여부를 확인해주세요.\n(오류: " +
          err.message +
          ")"
      );
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

// ===================================================
// 장소 키워드 검색 (카카오 Places API + 내장 장소 사전)
// ===================================================
function performPlaceSearch() {
  const query = document.getElementById("searchInput").value.trim();
  const resultList = document.getElementById("searchResults");

  if (!query) {
    resultList.classList.add("hidden");
    return;
  }

  // 카카오맵 엔진이 켜져 있고 Places 서비스가 있는 경우 실시간 카카오 장소 검색!
  if (state.engine === "kakao" && state.kakaoPlacesService) {
    state.kakaoPlacesService.keywordSearch(query, (data, status) => {
      if (status === kakao.maps.services.Status.OK) {
        const items = data.slice(0, 7).map((d) => ({
          name: d.place_name,
          address: d.road_address_name || d.address_name,
          lat: parseFloat(d.y),
          lng: parseFloat(d.x),
          category: "📌 기타",
        }));
        renderSearchResultDropdown(items);
      } else {
        renderSearchResultDropdown([]);
      }
    });
    return;
  }

  // 미리보기 지도 모드일 때: 내장 핫플레이스 사전 검색
  const matched = BUILTIN_PLACES.filter(
    (p) => p.name.includes(query) || p.address.includes(query)
  );
  renderSearchResultDropdown(
    matched.length > 0 ? matched : BUILTIN_PLACES.slice(0, 5)
  );
}

function renderSearchResultDropdown(items) {
  const resultList = document.getElementById("searchResults");
  resultList.innerHTML = "";

  if (items.length === 0) {
    resultList.innerHTML = `<li class="search-result-item"><span>검색 결과가 없어요 😢</span></li>`;
    resultList.classList.remove("hidden");
    return;
  }

  items.forEach((place) => {
    const li = document.createElement("li");
    li.className = "search-result-item";
    li.innerHTML = `
      <strong>${escapeHtml(place.name)}</strong>
      <span>${escapeHtml(place.address)} · 클릭하여 타임라인에 추가</span>
    `;
    li.addEventListener("click", () => {
      resultList.classList.add("hidden");
      if (state.engine === "kakao" && state.kakaoMap) {
        state.kakaoMap.panTo(new kakao.maps.LatLng(place.lat, place.lng));
      } else if (state.leafletMap) {
        state.leafletMap.flyTo([place.lat, place.lng], 15);
      }
      openPlaceModalForCreate({
        name: place.name,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        category: place.category || "☕ 카페",
      });
    });
    resultList.appendChild(li);
  });

  resultList.classList.remove("hidden");
}

// ===================================================
// 날짜 변경 & JSON 백업 / 복원
// ===================================================
function setDate(newDateStr) {
  state.currentDate = newDateStr;
  document.getElementById("datePicker").value = newDateStr;
  state.activePlaceId = null;
  renderAll();
  fitMapBounds();
}

function shiftDate(days) {
  const parts = state.currentDate.split("-").map(Number);
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  dt.setDate(dt.getDate() + days);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  setDate(`${y}-${m}-${d}`);
}

function exportTimelineJson() {
  const dataStr = JSON.stringify(state.recordsByDate, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `my-kakao-timeline-${state.currentDate}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importTimelineJson(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (typeof parsed === "object" && parsed !== null) {
        state.recordsByDate = { ...state.recordsByDate, ...parsed };
        saveDataToStorage();
        renderAll();
        fitMapBounds();
        alert("타임라인 기록을 성공적으로 불러왔어요! 🎉");
      }
    } catch (err) {
      alert("올바른 JSON 파일이 아니에요 😢");
    }
  };
  reader.readAsText(file);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ===================================================
// 이벤트 리스너 연결 및 앱 시작
// ===================================================
document.addEventListener("DOMContentLoaded", () => {
  loadDataFromStorage();

  // 날짜 입력창 초기화
  const datePicker = document.getElementById("datePicker");
  datePicker.value = state.currentDate;
  datePicker.addEventListener("change", (e) => {
    if (e.target.value) setDate(e.target.value);
  });

  document.getElementById("btnPrevDay").addEventListener("click", () => shiftDate(-1));
  document.getElementById("btnNextDay").addEventListener("click", () => shiftDate(1));
  document.getElementById("btnToday").addEventListener("click", () => setDate(getTodayString()));

  // 장소 추가 / GPS / 샘플 불러오기 버튼
  document.getElementById("btnAddPlace").addEventListener("click", () => openPlaceModalForCreate());
  document.getElementById("btnTrackGps").addEventListener("click", recordCurrentGpsLocation);
  document.getElementById("btnLoadSample").addEventListener("click", () => {
    state.recordsByDate[state.currentDate] = createSampleDataForDate(state.currentDate);
    saveDataToStorage();
    renderAll();
    fitMapBounds();
  });

  // 장소 모달 닫기 및 저장
  document.getElementById("btnClosePlaceModal").addEventListener("click", closePlaceModal);
  document.getElementById("btnCancelPlace").addEventListener("click", closePlaceModal);
  document.getElementById("placeForm").addEventListener("submit", handleSavePlaceForm);

  // 카카오 API 키 설정 모달
  const keyModal = document.getElementById("keyModal");
  document.getElementById("btnOpenKeyModal").addEventListener("click", () => {
    keyModal.classList.remove("hidden");
  });
  document.getElementById("btnCloseKeyModal").addEventListener("click", () => {
    keyModal.classList.add("hidden");
  });
  document.getElementById("btnSaveKakaoKey").addEventListener("click", () => {
    const key = document.getElementById("kakaoKeyInput").value.trim();
    if (!key) {
      alert("카카오 JavaScript API 키를 입력해주세요!");
      return;
    }
    localStorage.setItem(STORAGE_KEY_API, key);
    keyModal.classList.add("hidden");
    loadKakaoMapSdk(key);
  });
  document.getElementById("btnResetPreview").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY_API);
    keyModal.classList.add("hidden");
    initPreviewLeafletMap();
  });

  // 검색창 이벤트
  document.getElementById("btnSearch").addEventListener("click", performPlaceSearch);
  document.getElementById("searchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      performPlaceSearch();
    }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-box") && !e.target.closest("#searchResults")) {
      document.getElementById("searchResults").classList.add("hidden");
    }
  });

  // 우측 하단 지도 컨트롤
  document.getElementById("btnFitBounds").addEventListener("click", fitMapBounds);
  document.getElementById("btnToggleLine").addEventListener("click", (e) => {
    state.showRouteLine = !state.showRouteLine;
    e.currentTarget.classList.toggle("active", state.showRouteLine);
    renderMapMarkersAndRoute(getCurrentRecords());
  });

  // 하단 JSON 내보내기 / 불러오기 / 비우기
  document.getElementById("btnExportJson").addEventListener("click", exportTimelineJson);
  document.getElementById("inputImportJson").addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      importTimelineJson(e.target.files[0]);
      e.target.value = "";
    }
  });
  document.getElementById("btnClearDay").addEventListener("click", () => {
    if (!confirm(`${state.currentDate}의 모든 발자취를 비울까요?`)) return;
    state.recordsByDate[state.currentDate] = [];
    saveDataToStorage();
    renderAll();
  });

  // 지도 엔진 시작!
  initMapEngine();
});
