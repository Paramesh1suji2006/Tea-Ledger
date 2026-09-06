// ── Firebase init ─────────────────────────────────
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const entriesRef = db.collection("entries");

// ── Sync status ───────────────────────────────────
const syncBadge = document.getElementById("sync-status");

function updateSyncBadge() {
  if (!navigator.onLine) {
    syncBadge.textContent = "Offline";
    syncBadge.className = "sync-badge offline";
    return;
  }
  // Do an actual round trip to Firestore's server to confirm real connectivity
  // (navigator.onLine alone only checks the device's network adapter, not
  // whether Firestore itself is reachable)
  entriesRef.limit(1).get({ source: "server" })
    .then(() => {
      syncBadge.textContent = "Online";
      syncBadge.className = "sync-badge online";
    })
    .catch(() => {
      syncBadge.textContent = "Offline";
      syncBadge.className = "sync-badge offline";
    });
}

updateSyncBadge();
window.addEventListener("online", updateSyncBadge);
window.addEventListener("offline", updateSyncBadge);

// ── Tab switching ─────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "customers") loadCustomers();
  });
});

// ── Set today's date ──────────────────────────────
document.getElementById("entryDate").value = new Date().toISOString().split("T")[0];

// ── Customer autocomplete ─────────────────────────
let allCustomers = []; // { name, phone }

// Load all unique customers from Firestore once
async function loadAllCustomers() {
  const snapshot = await entriesRef.get();
  const map = {};
  snapshot.forEach(doc => {
    const d = doc.data();
    if (!d.phone) return;
    if (!map[d.phone]) map[d.phone] = { name: d.name || "Unknown", phone: d.phone };
  });
  allCustomers = Object.values(map);
}
loadAllCustomers();

const nameInput  = document.getElementById("customerName");
const phoneInput = document.getElementById("customerPhone");
const suggestBox = document.getElementById("nameSuggestions");

let currentMatches = [];

nameInput.addEventListener("input", () => {
  const q = nameInput.value.trim().toLowerCase();
  if (!q) { hideSuggestions(); currentMatches = []; return; }

  currentMatches = allCustomers.filter(c => c.name.toLowerCase().includes(q));
  if (currentMatches.length === 0) { hideSuggestions(); return; }

  suggestBox.innerHTML = currentMatches.map(c => `
    <div class="suggestion-item" data-phone="${c.phone}" data-name="${c.name}">
      <span class="sug-name">${c.name}</span>
      <span class="sug-phone">${c.phone}</span>
    </div>
  `).join("");
  suggestBox.classList.remove("hidden");

  suggestBox.querySelectorAll(".suggestion-item").forEach(item => {
    item.addEventListener("click", () => {
      nameInput.value  = item.dataset.name;
      phoneInput.value = item.dataset.phone;
      hideSuggestions();
    });
  });
});

// Press Enter on name field → auto-fill phone from first match
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && currentMatches.length > 0) {
    e.preventDefault();
    nameInput.value  = currentMatches[0].name;
    phoneInput.value = currentMatches[0].phone;
    hideSuggestions();
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".autocomplete-wrap")) hideSuggestions();
});

function hideSuggestions() {
  suggestBox.classList.add("hidden");
  suggestBox.innerHTML = "";
}

// ── Multiple weights ──────────────────────────────
let weights = []; // array of numbers

const weightInput   = document.getElementById("weightInput");
const weightList    = document.getElementById("weightList");
const weightTotal   = document.getElementById("weightTotal");
const totalVal      = document.getElementById("totalVal");

document.getElementById("addWeightBtn").addEventListener("click", addWeight);
weightInput.addEventListener("keydown", e => { if (e.key === "Enter") addWeight(); });

function addWeight() {
  const val = parseFloat(weightInput.value);
  if (!val || val <= 0) { alert("Enter a valid weight."); return; }
  weights.push(val);
  weightInput.value = "";
  weightInput.focus();
  renderWeights();
}

function renderWeights() {
  weightList.innerHTML = weights.map((w, i) => `
    <div class="weight-chip">
      <span class="chip-val">${w.toFixed(2)} kg</span>
      <button class="chip-remove" data-i="${i}">✕</button>
    </div>
  `).join("");

  weightList.querySelectorAll(".chip-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      weights.splice(parseInt(btn.dataset.i), 1);
      renderWeights();
    });
  });

  const total = weights.reduce((s, w) => s + w, 0);
  if (weights.length > 0) {
    weightTotal.classList.remove("hidden");
    totalVal.textContent = total.toFixed(2);
  } else {
    weightTotal.classList.add("hidden");
  }
  updateNetDisplay();
}

// ── Net weight live update ────────────────────────
function updateNetDisplay() {
  const total = weights.reduce((s, w) => s + w, 0);
  const water = parseFloat(document.getElementById("waterDeduct").value) || 0;
  const tare  = parseFloat(document.getElementById("tareDeduct").value) || 0;
  const net   = Math.max(0, total - water - tare);
  const netDisplay = document.getElementById("netWeightDisplay");
  if (weights.length > 0) {
    netDisplay.classList.remove("hidden");
    document.getElementById("netVal").textContent = net.toFixed(2);
  } else {
    netDisplay.classList.add("hidden");
  }
}

document.getElementById("waterDeduct").addEventListener("input", updateNetDisplay);
document.getElementById("tareDeduct").addEventListener("input", updateNetDisplay);
let lastEntry = null;

document.getElementById("saveBtn").addEventListener("click", async () => {
  const name  = nameInput.value.trim();
  const phone = phoneInput.value.trim();
  const grade = document.getElementById("grade").value;
  const date  = document.getElementById("entryDate").value;
  const water = parseFloat(document.getElementById("waterDeduct").value) || 0;
  const tare  = parseFloat(document.getElementById("tareDeduct").value) || 0;

  if (!name)              { alert("Please enter the customer name."); return; }
  if (!phone)             { alert("Please enter the phone number."); return; }
  if (weights.length === 0) { alert("Please add at least one weight."); return; }
  if (!grade)             { alert("Please select a tea grade."); return; }
  if (!date)              { alert("Please select a date."); return; }

  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const netWeight   = Math.max(0, totalWeight - water - tare);

  const btn = document.getElementById("saveBtn");
  btn.textContent = "Saving…";
  btn.disabled = true;

  try {
    await entriesRef.add({
      name, phone,
      weights: [...weights],
      totalWeight,
      water, tare, netWeight,
      grade, date,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    lastEntry = { name, phone, weights: [...weights], totalWeight, water, tare, netWeight, grade, date };

    // Update local customer cache
    if (!allCustomers.find(c => c.phone === phone)) {
      allCustomers.push({ name, phone });
    }

    showReceipt(lastEntry);

    // Clear form
    nameInput.value  = "";
    phoneInput.value = "";
    weights = [];
    renderWeights();
    document.getElementById("grade").value = "";
    document.getElementById("waterDeduct").value = "";
    document.getElementById("tareDeduct").value = "";
    document.getElementById("netWeightDisplay").classList.add("hidden");

  } catch (err) {
    alert("Error saving: " + err.message);
  } finally {
    btn.textContent = "Save Entry";
    btn.disabled = false;
  }
});

// ── Show receipt ──────────────────────────────────
function showReceipt(entry) {
  document.getElementById("r-name").textContent    = entry.name;
  document.getElementById("r-weights").textContent = entry.weights.map(w => w.toFixed(2) + " kg").join(", ");
  document.getElementById("r-weight").textContent  = entry.totalWeight.toFixed(2) + " kg";
  document.getElementById("r-water").textContent   = "− " + (entry.water || 0).toFixed(2) + " kg";
  document.getElementById("r-tare").textContent    = "− " + (entry.tare || 0).toFixed(2) + " kg";
  document.getElementById("r-net").textContent     = (entry.netWeight || entry.totalWeight).toFixed(2) + " kg";

  // Show/hide deduction rows
  document.getElementById("r-water-row").style.display = (entry.water > 0) ? "flex" : "none";
  document.getElementById("r-tare-row").style.display  = (entry.tare > 0)  ? "flex" : "none";

  document.getElementById("r-grade").textContent   = entry.grade;
  document.getElementById("r-date").textContent    = formatDate(entry.date);
  const receiptEl = document.getElementById("receipt");
  receiptEl.classList.remove("hidden");
  receiptEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ── Send SMS ──────────────────────────────────────
document.getElementById("smsBtn").addEventListener("click", () => {
  if (!lastEntry) return;
  const weightBreakdown = lastEntry.weights.length > 1
    ? `\nWeights: ${lastEntry.weights.map(w => w.toFixed(2) + " kg").join(", ")}`
    : "";
  const water = lastEntry.water || 0;
  const tare  = lastEntry.tare  || 0;
  const net   = lastEntry.netWeight || lastEntry.totalWeight;
  const deductions = [
    water > 0 ? `Water Deduction: ${water.toFixed(2)} kg` : "",
    tare  > 0 ? `Tare Deduction:  ${tare.toFixed(2)} kg`  : ""
  ].filter(Boolean).join("\n");

  const msg =
`Tea Collection Receipt
Customer: ${lastEntry.name}${weightBreakdown}
Gross Weight: ${lastEntry.totalWeight.toFixed(2)} kg${deductions ? "\n" + deductions : ""}
Net Weight: ${net.toFixed(2)} kg
Grade: ${lastEntry.grade}
Date: ${formatDate(lastEntry.date)}
Thank you!`;
  window.location.href = `sms:${lastEntry.phone}?body=${encodeURIComponent(msg)}`;
});

// ── Load customers ────────────────────────────────
async function loadCustomers() {
  const listEl = document.getElementById("customerList");
  listEl.innerHTML = '<p class="empty-msg">Loading…</p>';
  try {
    const snapshot = await entriesRef.get();
    const map = {};
    snapshot.forEach(doc => {
      const d = doc.data();
      if (!d.phone) return;
      const key = d.phone;
      const w = d.totalWeight || d.weight || 0;
      if (!map[key]) map[key] = { name: d.name || "Unknown", phone: d.phone, totalWeight: 0, count: 0 };
      map[key].totalWeight += w;
      map[key].count += 1;
    });
    renderCustomers(Object.values(map).sort((a, b) => (a.name || "").localeCompare(b.name || "")));
  } catch (err) {
    listEl.innerHTML = `<p class="empty-msg">Error: ${err.message}</p>`;
  }
}

function renderCustomers(list) {
  const listEl = document.getElementById("customerList");
  if (list.length === 0) {
    listEl.innerHTML = '<p class="empty-msg">No customers yet. Add the first entry!</p>';
    return;
  }
  listEl.innerHTML = list.map(c => `
    <div class="customer-card" data-phone="${c.phone}">
      <div class="cust-left">
        <div class="cust-name">${c.name}</div>
        <div class="cust-phone">${c.phone}</div>
      </div>
      <div class="cust-right">
        <div class="cust-total">${c.totalWeight.toFixed(2)} kg</div>
        <div class="cust-count">${c.count} visit${c.count > 1 ? "s" : ""}</div>
      </div>
    </div>
  `).join("");
  listEl.querySelectorAll(".customer-card").forEach(card => {
    card.addEventListener("click", () => openCustomerDetail(card.dataset.phone));
  });
}

// ── Search ────────────────────────────────────────
document.getElementById("searchInput").addEventListener("input", async function () {
  const q = this.value.trim().toLowerCase();
  const snapshot = await entriesRef.get();
  const map = {};
  snapshot.forEach(doc => {
    const d = doc.data();
    if ((d.name || "").toLowerCase().includes(q) || (d.phone || "").includes(q)) {
      const key = d.phone;
      const w = d.totalWeight || d.weight || 0;
      if (!map[key]) map[key] = { name: d.name, phone: d.phone, totalWeight: 0, count: 0 };
      map[key].totalWeight += w;
      map[key].count += 1;
    }
  });
  renderCustomers(Object.values(map).sort((a, b) => (a.name || "").localeCompare(b.name || "")));
});

// ── Customer detail ───────────────────────────────
async function openCustomerDetail(phone) {
  document.getElementById("customerList").classList.add("hidden");
  document.getElementById("searchInput").parentElement.style.display = "none";
  const detailEl = document.getElementById("customerDetail");
  detailEl.classList.remove("hidden");

  try {
    const snapshot = await entriesRef.where("phone", "==", phone).get();
    const entries = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    if (!entries.length) {
      // Last entry for this customer was just deleted — go back to the list
      detailEl.classList.add("hidden");
      document.getElementById("customerList").classList.remove("hidden");
      document.getElementById("searchInput").parentElement.style.display = "block";
      loadCustomers();
      return;
    }

    const totalWeight = entries.reduce((s, e) => s + (e.totalWeight || e.weight || 0), 0);
    document.getElementById("detail-name").textContent  = entries[0].name;
    document.getElementById("detail-phone").textContent = phone;
    document.getElementById("detail-summary").innerHTML = `
      <div class="summary-block">
        <div class="summary-label">Total Weight</div>
        <div class="summary-value">${totalWeight.toFixed(2)} kg</div>
      </div>
      <div class="summary-block">
        <div class="summary-label">Total Visits</div>
        <div class="summary-value">${entries.length}</div>
      </div>
    `;
    document.getElementById("detail-entries").innerHTML = entries.map(e => {
      const tw = e.totalWeight || e.weight || 0;
      const breakdown = e.weights && e.weights.length > 1
        ? `<div class="entry-breakdown">${e.weights.map(w => w.toFixed(2) + " kg").join(" + ")}</div>`
        : "";
      return `
        <div class="entry-row">
          <div>
            <div class="entry-date">${formatDate(e.date)}</div>
            <div class="entry-grade">${e.grade}</div>
            ${breakdown}
          </div>
          <div class="entry-right">
            <div class="entry-weight">${tw.toFixed(2)} kg</div>
            <button class="entry-delete-btn" data-id="${e.id}" title="Delete this entry">🗑</button>
          </div>
        </div>
      `;
    }).join("");

    document.getElementById("detail-entries").querySelectorAll(".entry-delete-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this entry? This cannot be undone.")) return;
        btn.disabled = true;
        btn.textContent = "…";
        try {
          await entriesRef.doc(btn.dataset.id).delete();
          loadAllCustomers();      // refresh autocomplete cache
          openCustomerDetail(phone); // refresh this view (or go back if now empty)
        } catch (err) {
          alert("Error deleting entry: " + err.message);
          btn.disabled = false;
          btn.textContent = "🗑";
        }
      });
    });
  } catch (err) {
    document.getElementById("detail-entries").innerHTML = `<p class="empty-msg">Error: ${err.message}</p>`;
  }
}

document.getElementById("backBtn").addEventListener("click", () => {
  document.getElementById("customerDetail").classList.add("hidden");
  document.getElementById("customerList").classList.remove("hidden");
  document.getElementById("searchInput").parentElement.style.display = "block";
});

// ── Helper ────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${months[parseInt(m)-1]} ${y}`;
}