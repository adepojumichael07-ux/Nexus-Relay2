const INCIDENTS = {
  medical: { label: "Medical emergency", number: "112", agency: "National emergency / LASAMBUS" },
  fire: { label: "Fire", number: "112", agency: "Lagos Fire and Rescue / 112" },
  accident: { label: "Road accident", number: "122", agency: "FRSC" },
  flood: { label: "Flood / disaster", number: "767", agency: "LASEMA" },
  security: { label: "Security / crime", number: "112", agency: "Nigeria Police / 112" },
  collapse: { label: "Building collapse", number: "767", agency: "LASEMA / NEMA" },
  missing: { label: "Missing person", number: "112", agency: "Police emergency" },
  other: { label: "Other incident", number: "112", agency: "General emergency" }
};

const STORE_KEY = "meshalert-packets-v1";
const NODE_KEY = "meshalert-node-id";

const nodeId = localStorage.getItem(NODE_KEY) || `node-${Math.random().toString(36).slice(2, 8)}`;
localStorage.setItem(NODE_KEY, nodeId);

const els = {
  net: document.querySelector("#net"),
  form: document.querySelector("#form"),
  incident: document.querySelector("#incident"),
  number: document.querySelector("#number"),
  agency: document.querySelector("#agency"),
  details: document.querySelector("#details"),
  locText: document.querySelector("#locText"),
  locMeta: document.querySelector("#locMeta"),
  mapLink: document.querySelector("#mapLink"),
  refreshLoc: document.querySelector("#refreshLoc"),
  feed: document.querySelector("#feed"),
  peers: document.querySelector("#peers"),
  hops: document.querySelector("#hops"),
  cloud: document.querySelector("#cloud"),
  exportBtn: document.querySelector("#exportBtn"),
  importBtn: document.querySelector("#importBtn"),
  dialog: document.querySelector("#bundleDialog"),
  bundle: document.querySelector("#bundle"),
  applyBundle: document.querySelector("#applyBundle"),
  closeDialog: document.querySelector("#closeDialog")
};

let locationFix = null;
let packets = loadPackets();

function loadPackets() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); }
  catch { return []; }
}
function savePackets() {
  localStorage.setItem(STORE_KEY, JSON.stringify(packets.slice(0, 80)));
  render();
}

function setNet() {
  const online = navigator.onLine;
  els.net.textContent = online ? "Link up" : "Blackout mode";
  els.net.className = `badge ${online ? "online" : "offline"}`;
  els.cloud.textContent = online ? "Cloud sync ready" : "Cloud unreachable — storing locally";
}

function fillNumbers() {
  const item = INCIDENTS[els.incident.value];
  els.number.value = item.number;
  els.agency.textContent = item.agency;
}

function captureLocation() {
  els.locText.textContent = "Detecting location…";
  els.locMeta.textContent = "GPS requested from this device";
  if (!navigator.geolocation) {
    els.locText.textContent = "Location unavailable";
    els.locMeta.textContent = "This browser has no geolocation API";
    return;
  }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude, longitude, accuracy } = pos.coords;
    locationFix = {
      lat: Number(latitude.toFixed(6)),
      lng: Number(longitude.toFixed(6)),
      accuracy: Math.round(accuracy),
      capturedAt: new Date().toISOString()
    };
    els.locText.textContent = `${locationFix.lat}, ${locationFix.lng}`;
    els.locMeta.textContent = `Auto-detected · ±${locationFix.accuracy} m`;
    els.mapLink.href = `https://maps.google.com/?q=${locationFix.lat},${locationFix.lng}`;
    els.mapLink.hidden = false;
    if (navigator.onLine) {
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${locationFix.lat}&lon=${locationFix.lng}`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (res.ok) {
          const data = await res.json();
          if (data.display_name) els.locMeta.textContent = data.display_name;
        }
      } catch { /* offline or blocked reverse geocode */ }
    }
  }, (err) => {
    els.locText.textContent = "Location blocked";
    els.locMeta.textContent = err.message || "Allow location access and try again";
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
}

function render() {
  const queued = packets.filter((p) => p.status !== "synced").length;
  els.peers.textContent = `${1 + Math.min(packets.length, 3)} local nodes`;
  els.hops.textContent = `${queued} queued`;
  if (!packets.length) {
    els.feed.innerHTML = `<li class="empty">No alerts yet. A sent alert stays on this phone until a peer or cloud link can carry it.</li>`;
    return;
  }
  els.feed.innerHTML = packets.slice(0, 12).map((p) => `
    <li>
      <b>${INCIDENTS[p.incident]?.label || p.incident}</b> · ${p.number}
      <div>${p.details || "No extra details"}</div>
      <div class="meta">${p.lat}, ${p.lng} · hop ${p.hops} · ${p.status} · ${new Date(p.createdAt).toLocaleString()}</div>
    </li>
  `).join("");
}

function makePacket(form) {
  if (!locationFix) throw new Error("Wait for automatic location before sending.");
  return {
    id: crypto.randomUUID(),
    nodeId,
    incident: form.incident,
    number: form.number.trim(),
    details: form.details.trim(),
    lat: locationFix.lat,
    lng: locationFix.lng,
    accuracy: locationFix.accuracy,
    createdAt: new Date().toISOString(),
    hops: 0,
    path: [nodeId],
    status: navigator.onLine ? "pending-cloud" : "mesh-queued"
  };
}

async function tryCloud(packet) {
  if (!navigator.onLine) return false;
  try {
    const res = await fetch("https://httpbin.org/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "meshalert-demo", packet })
    });
    return res.ok;
  } catch {
    return false;
  }
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(els.form));
  let packet;
  try { packet = makePacket(data); }
  catch (err) { alert(err.message); return; }
  packets.unshift(packet);
  savePackets();
  const synced = await tryCloud(packet);
  packet.status = synced ? "synced" : "mesh-queued";
  savePackets();
  els.details.value = "";
});

els.incident.addEventListener("change", fillNumbers);
els.refreshLoc.addEventListener("click", captureLocation);
window.addEventListener("online", async () => {
  setNet();
  for (const packet of packets) {
    if (packet.status === "synced") continue;
    if (await tryCloud(packet)) packet.status = "synced";
  }
  savePackets();
});
window.addEventListener("offline", setNet);

els.exportBtn.addEventListener("click", () => {
  const bundle = {
    from: nodeId,
    at: new Date().toISOString(),
    packets: packets.filter((p) => p.status !== "synced").map((p) => ({ ...p, hops: p.hops + 1, path: [...p.path, nodeId] }))
  };
  els.bundle.value = JSON.stringify(bundle);
  els.dialog.showModal();
});

els.importBtn.addEventListener("click", () => {
  els.bundle.value = "";
  els.dialog.showModal();
});

els.applyBundle.addEventListener("click", () => {
  try {
    const bundle = JSON.parse(els.bundle.value);
    const incoming = Array.isArray(bundle) ? bundle : bundle.packets || [];
    let added = 0;
    for (const packet of incoming) {
      if (!packet.id || packets.some((p) => p.id === packet.id)) continue;
      packets.unshift({ ...packet, status: "mesh-queued" });
      added += 1;
    }
    savePackets();
    els.dialog.close();
    if (added) alert(`${added} alert(s) received from a nearby mesh bundle.`);
  } catch {
    alert("That bundle is not valid JSON.");
  }
});
els.closeDialog.addEventListener("click", () => els.dialog.close());

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

fillNumbers();
setNet();
captureLocation();
render();
