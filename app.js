// Smart Task Manager – app.js (ES Module)
// Handles theme, routing, auth, task CRUD, filters, search, sort, import/export.

let pendingEdit = {
  taskId: null,
  newTitle: "",
  newNotes: ""
};
/******************** UTILITIES ********************/
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const escapeHTML = (str = "") => str.replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const delay = (ms) => new Promise(res => setTimeout(res, ms));

const formatDateTime = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString();
};

/******************** THEME ********************/
const theme = {
  get() { return localStorage.getItem('stm.theme') || 'dark'; },
  set(v) { localStorage.setItem('stm.theme', v); document.body.setAttribute('data-theme', v); }
};
// initialize theme and toggle
(() => {
  theme.set(theme.get());
  const t = $('#themeToggle');
  if (t) t.addEventListener('click', () => theme.set(theme.get() === 'dark' ? 'light' : 'dark'));
})();

/******************** STORAGE LAYER ********************/
const store = {
  keyUsers: 'stm.users',
  keySession: 'stm.activeUser',
  keyTasks: (email) => `stm.tasks.${email}`,
  read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  write(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
  remove(key) { localStorage.removeItem(key); }
};

/******************** AUTH SERVICE (SIMULATED API) ********************/
const auth = {
  async register({ name, email, password }) {
    await delay(350);
    const users = store.read(store.keyUsers, []);
    if (users.some(u => u.email === email)) return { ok: false, message: 'Email already exists' };
    const now = new Date().toISOString();
    const user = { id: uid(), name, email, password, createdAt: now, lastLogin: null };
    users.push(user);
    store.write(store.keyUsers, users);
    return { ok: true, message: 'Registered successfully', user };
  },

  async login({ email, password }) {
    await delay(250);
    const users = store.read(store.keyUsers, []);
    const idx = users.findIndex(u => u.email === email && u.password === password);
    if (idx === -1) return { ok: false, message: 'Invalid email or password' };

    const user = users[idx];
    // previous last login (if none, fall back to createdAt)
    const previousLastLogin = user.lastLogin || user.createdAt;

    // put display data in the active session
    store.write(store.keySession, {
      id: user.id,
      email: user.email,
      name: user.name,
      lastLogin: previousLastLogin
    });

    // update user's lastLogin to "now"
    users[idx] = { ...user, lastLogin: new Date().toISOString() };
    store.write(store.keyUsers, users);

    return { ok: true, message: 'Login successful', user: users[idx] };
  },

  me() { return store.read(store.keySession, null); },
  logout() { store.remove(store.keySession); }
};


/******************** TASK SERVICE (SIMULATED API) ********************/
const tasksApi = {
  async list(email) { await delay(120); return store.read(store.keyTasks(email), []); },
  async create(email, payload) {
    await delay(160);
    const list = store.read(store.keyTasks(email), []);
    const now = new Date().toISOString();
    const task = { id: uid(), title: payload.title, notes: payload.notes || '', due: payload.due || null, completed: false, createdAt: now, updatedAt: now };
    list.push(task); store.write(store.keyTasks(email), list); return task;
  },
  async update(email, id, patch) {
    await delay(140);
    const list = store.read(store.keyTasks(email), []);
    const idx = list.findIndex(t => t.id === id);
    if (idx === -1) throw new Error('Task not found');
    list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
    store.write(store.keyTasks(email), list);
    return list[idx];
  },
  async remove(email, id) {
    await delay(130);
    const list = store.read(store.keyTasks(email), []);
    store.write(store.keyTasks(email), list.filter(t => t.id !== id));
    return true;
  },
  async clearCompleted(email) {
    await delay(130);
    const list = store.read(store.keyTasks(email), []);
    store.write(store.keyTasks(email), list.filter(t => !t.completed));
    return true;
  }
};

/******************** ROUTER ********************/
const views = ['login','register','forgot','app'];
function show(view) {
  views.forEach(v => document.getElementById(`view-${v}`)?.classList.add('hidden'));
  document.getElementById(`view-${view}`)?.classList.remove('hidden');
  const isAuth = !!auth.me();
  $('#logoutBtn')?.classList.toggle('hidden', !isAuth);
  $('#gotoLogin')?.classList.toggle('hidden', isAuth);
  $('#gotoRegister')?.classList.toggle('hidden', isAuth);
}
function navigate() {
  const hash = location.hash.replace('#','') || (auth.me() ? 'app' : 'login');
  if (!views.includes(hash)) return;
  if ((hash === 'login' || hash === 'register' || hash === 'forgot') && auth.me()) { location.hash = 'app'; return; }
  if (hash === 'app' && !auth.me()) { location.hash = 'login'; return; }
  show(hash);
  if (hash === 'app') app.init();
}
window.addEventListener('hashchange', navigate);

$('#gotoLogin')?.addEventListener('click', () => location.hash = 'login');
$('#gotoRegister')?.addEventListener('click', () => location.hash = 'register');
$('#logoutBtn')?.addEventListener('click', () => { auth.logout(); location.hash = 'login'; });

/******************** AUTH FORMS ********************/
// Login
$('#loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#loginEmail').value.trim();
  const password = $('#loginPass').value;
  const res = await auth.login({ email, password });
  const err = $('#loginError');
  if (!res.ok) { err.textContent = res.message; err.classList.remove('hidden'); return; }
  err.classList.add('hidden');
  location.hash = 'app';
});

// Register + strength
const strengthEl = $('#strength');
const computeStrength = (p) => {
  let s = 0; if (p.length >= 6) s++; if (/[A-Z]/.test(p)) s++; if (/[a-z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^\w]/.test(p)) s++;
  if (s <= 2) return { text: 'Weak', cls: 'weak' };
  if (s === 3 || s === 4) return { text: 'Medium', cls: 'medium' };
  return { text: 'Strong', cls: 'strong' };
};
$('#regPass')?.addEventListener('input', (e) => {
  const { text, cls } = computeStrength(e.target.value);
  if (strengthEl) { strengthEl.textContent = text; strengthEl.className = `strength ${cls}`; }
});

$('#registerForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#regName').value.trim();
  const email = $('#regEmail').value.trim();
  const password = $('#regPass').value;
  const password2 = $('#regPass2').value;
  const err = $('#registerError');
  if (password !== password2) { err.textContent = 'Passwords do not match'; err.classList.remove('hidden'); return; }
  const res = await auth.register({ name, email, password });
  if (!res.ok) { err.textContent = res.message; err.classList.remove('hidden'); return; }
  err.classList.add('hidden');
  location.hash = 'login';
});

// Forgot
$('#forgotForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#fpEmail').value.trim();
  const users = store.read(store.keyUsers, []);
  const msg = $('#forgotMsg');
  if (!users.find(u => u.email === email)) { msg.textContent = 'Email not found'; msg.className = 'alert error'; return; }
  await delay(400);
  msg.textContent = 'Reset link sent (simulated).'; msg.className = 'alert ok';
});

/******************** APP CONTROLLER ********************/
const app = (() => {
  let cache = { tasks: [], email: null, filter: 'all', search: '', sort: 'created' };

  const load = async () => {
    const me = auth.me(); if (!me) return;
    cache.email = me.email;
    cache.tasks = await tasksApi.list(cache.email);
    render();
    const wn = $('#welcomeName'); if (wn) wn.textContent = `Signed in as ${me.name}`;
  };

const stats = () => {
  const total = cache.tasks.length;
  const completed = cache.tasks.filter(t => t.completed).length;
  const pending = total - completed;

  $('#statTotal').textContent = total;
  $('#statCompleted').textContent = completed;
  $('#statPending').textContent = pending;

  // ✅ Progress bar update
  let percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  $('#progressFill').style.width = percent + "%";
  $('#progressText').textContent = percent + "% completed";
};


  const render = () => {
    stats();
    const list = $('#taskList'); if (!list) return; list.innerHTML = '';
    let rows = cache.tasks.filter(t => {
      if (cache.filter === 'completed' && !t.completed) return false;
      if (cache.filter === 'pending' && t.completed) return false;
      if (cache.search && !(`${t.title} ${t.notes}`.toLowerCase().includes(cache.search))) return false;
      return true;
    });
    rows.sort((a,b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1; // completed last
      if (cache.sort === 'alpha') return a.title.localeCompare(b.title);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'muted'; empty.style.padding = '8px 2px';
      empty.textContent = 'No tasks to show.'; list.appendChild(empty); return;
    }
    for (const t of rows) list.appendChild(renderTask(t));
  };

 const renderTask = (t) => {
  const el = document.createElement("div");
  el.className = "task" + (t.completed ? " completed" : "");
  el.dataset.id = t.id;

  

  // Checkbox
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = t.completed;
  cb.title = "Mark as completed";

  cb.addEventListener("change", async () => {
    await tasksApi.update(cache.email, t.id, { completed: cb.checked });
    cache.tasks = await tasksApi.list(cache.email);
    render();
  });

  // Middle content
  const mid = document.createElement("div");
  mid.className = "mid";

  const title = document.createElement("div");
  title.className = "title";
  title.innerHTML = `
        <span class="bullet ${t.completed ? "done" : "pending"}"></span>
        ${t.title}
    `;

  const meta = document.createElement("div");
  meta.className = "meta";

  const parts = [`Created: ${formatDateTime(t.createdAt)}`];

  if (t.due) {
    const dueDate = new Date(t.due);
    const today = new Date();

    const isOverdue = dueDate < today && !t.completed;
    const dueClass = isOverdue ? "overdue" : "ontrack";

    parts.push(
      `<span class="due ${dueClass}"><i class="bi bi-calendar"></i> ${dueDate.toDateString()}</span>`
    );
  }

  meta.innerHTML = parts.join(" · ");

  // Notes
  if (t.notes) {
    const notes = document.createElement("div");
    notes.className = "notes";
    notes.innerHTML = `<i class="bi bi-stickies"></i> ${t.notes}`;
    mid.append(title, meta, notes);
  } else {
    mid.append(title, meta);
  }

  // Progress Bar (mini bar inside each task)
  const progressMini = document.createElement("div");
  progressMini.className = "mini-progress";

  progressMini.innerHTML = `
      <div class="bar"><div class="fill ${t.completed ? "full" : ""}"></div></div>
      <span class="mini-text">${t.completed ? "Completed" : "Pending"}</span>
  `;

  mid.append(progressMini);

  // Actions
  const actions = document.createElement("div");
  actions.className = "actions";

  // Edit
  const editBtn = document.createElement("button");
  editBtn.className = "btn icon-btn ghost";
  editBtn.title = "Edit";
  editBtn.innerHTML = `<i class="bi bi-pencil-square"></i>`;
  editBtn.addEventListener("click", () => inlineEdit(el, t));
  

  // Delete
  const delBtn = document.createElement("button");
  delBtn.className = "btn icon-btn ghost";
  delBtn.title = "Delete";
  delBtn.innerHTML = `<i class="bi bi-trash3"></i>`;
  delBtn.addEventListener("click", () => {
  openDeleteModal(t.id);
});
let deleteTaskId = null;

function openDeleteModal(taskId) {
  deleteTaskId = taskId;
  $("#deleteModal").classList.remove("hidden");
}

function closeDeleteModal() {
  $("#deleteModal").classList.add("hidden");
  deleteTaskId = null;
}

// Confirm delete
$("#confirmDelete").addEventListener("click", async () => {
  if (deleteTaskId) {
    await tasksApi.remove(cache.email, deleteTaskId);
    cache.tasks = await tasksApi.list(cache.email);
    closeDeleteModal();
    render();
  }
});

// Cancel delete
$("#cancelDelete").addEventListener("click", closeDeleteModal);

// Click outside modal to close
$("#deleteModal").addEventListener("click", (e) => {
  if (e.target === $("#deleteModal")) {
    closeDeleteModal();
  }
});


  actions.append(editBtn, delBtn);

  el.append(cb, mid, actions);

  return el;
};


  const inlineEdit = (row, t) => {
    const form = document.createElement('form');
    form.className = 'task';
    form.innerHTML = `
      <span></span>
      <div style="display:grid; gap:6px;">
        <div class="input"><i class="bi bi-list-task"></i><input type="text" name="title" value="${escapeHTML(t.title)}" required minlength="2" maxlength="120"/></div>
        <div class="input"><i class="bi bi-card-text"></i><input type="text" name="notes" value="${escapeHTML(t.notes || '')}" maxlength="240"/></div>
      </div>
      <div class="actions">
        <button class="btn success" type="submit"><i class="bi bi-check2"></i></button>
        <button class="btn ghost" type="button" id="cancel"><i class="bi bi-x-lg"></i></button>
      </div>`;
    row.replaceWith(form);
    form.querySelector('#cancel').addEventListener('click', render);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = form.title.value.trim();
      const notes = form.notes.value.trim();
      await tasksApi.update(cache.email, t.id, { title, notes });
      cache.tasks = await tasksApi.list(cache.email); render();
    });
  };

  return {
    async init() {
      // Bind once
      if (!app._bound) {
        $('#taskForm')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const title = $('#taskTitle').value.trim(); if (!title) return;
          const notes = $('#taskNotes').value.trim();
          const due = $('#taskDue').value || null;
          await tasksApi.create(cache.email, { title, notes, due });
          $('#taskForm').reset();
          cache.tasks = await tasksApi.list(cache.email); render();
        });

        $('#filterSelect')?.addEventListener('change', (e) => { cache.filter = e.target.value; render(); });
        $('#searchBox')?.addEventListener('input', (e) => { cache.search = e.target.value.toLowerCase(); render(); });
        $('#sortCreated')?.addEventListener('click', () => { cache.sort = 'created'; render(); });
        $('#sortAlpha')?.addEventListener('click', () => { cache.sort = 'alpha'; render(); });
        $('#clearCompleted')?.addEventListener('click', async () => { await tasksApi.clearCompleted(cache.email); cache.tasks = await tasksApi.list(cache.email); render(); });

        // Export
        $('#exportBtn')?.addEventListener('click', () => {
          const data = JSON.stringify(cache.tasks, null, 2);
          const blob = new Blob([data], { type: 'application/json' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
          a.download = `tasks-${cache.email}.json`; a.click(); URL.revokeObjectURL(a.href);
        });
        // Import
        $('#importBtn')?.addEventListener('click', () => $('#importFile').click());
        $('#importFile')?.addEventListener('change', async (e) => {
          const file = e.target.files[0]; if (!file) return;
          const text = await file.text();
          try {
            const arr = JSON.parse(text);
            if (!Array.isArray(arr)) throw new Error('Invalid file');
            const ok = arr.every(t => typeof t.title === 'string' && t.id);
            if (!ok) throw new Error('Invalid tasks');
            store.write(store.keyTasks(cache.email), arr);
            cache.tasks = await tasksApi.list(cache.email); render();
          } catch (err) { alert('Import failed: ' + err.message); }
        });

        app._bound = true;
      }
      await load();
    }
  };
})();


navigate();