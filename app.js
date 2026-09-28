(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const screens = ['loading-screen', 'setup-screen', 'auth-screen', 'dashboard-screen'];
  const categories = ['Personal', 'Work', 'Study', 'Health', 'Shopping', 'Other'];
  const configName = 'littlelist.supabase.config.v1';
  let client = null;
  let config = null;
  let user = null;
  let tasks = [];
  let view = 'all';
  let editingId = null;
  let deletingId = null;
  let toastTimer = null;

  function showScreen(id) {
    screens.forEach((screen) => { $('#' + screen).hidden = screen !== id; });
    $('#user-chip').hidden = id !== 'dashboard-screen';
    $('#settings-button').hidden = id !== 'dashboard-screen';
    $('#connection-label').textContent = id === 'dashboard-screen' ? 'Connected securely' : 'Private by design';
  }
  function message(id, text, success) {
    const field = $('#' + id);
    field.textContent = text || '';
    field.classList.toggle('is-success', Boolean(success));
  }
  function toast(text) {
    const node = $('#toast');
    node.textContent = text;
    node.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => node.classList.remove('is-visible'), 2400);
  }
  function niceError(error) {
    const text = String(error && error.message ? error.message : 'Something went wrong. Please try again.');
    if (text.toLowerCase().includes('invalid login credentials')) return 'That email and password do not match. Try again or create an account.';
    if (text.toLowerCase().includes('email not confirmed')) return 'Please confirm your email using the link we sent you, then log in.';
    if (text.toLowerCase().includes('already registered')) return 'An account already uses that email. Try logging in instead.';
    if (text.toLowerCase().includes('invalid api key') || text.toLowerCase().includes('invalid jwt')) return 'That project key was not recognized. Check the Project URL and publishable key.';
    if (text.toLowerCase().includes('fetch') || text.toLowerCase().includes('network')) return 'Could not reach the project. Check your internet connection and project URL.';
    if (text.toLowerCase().includes('does not exist') || text.toLowerCase().includes('schema cache')) return 'The task tables are not set up yet. Follow the database setup steps in README.md.';
    if (text.toLowerCase().includes('row-level security') || text.includes('42501')) return 'The database access rules blocked that change. Check that supabase/schema.sql was applied.';
    return text;
  }
  function readConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(configName) || 'null');
      return saved && saved.url && saved.key ? saved : null;
    } catch (error) { return null; }
  }
  function makeClient(url, key) {
    if (!url.trim().startsWith('https://')) throw new Error('Use the full HTTPS Project URL from Supabase.');
    if (!window.supabase || !window.supabase.createClient) throw new Error('The sign-in library could not load. Check your internet connection and reload.');
    return window.supabase.createClient(url.trim().replace(//$/, ''), key.trim(), { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }
  async function connect(url, key, messageId) {
    let next;
    try {
      if (!url.trim() || !key.trim()) throw new Error('Add both the Project URL and publishable key.');
      next = makeClient(url, key);
    } catch (error) { message(messageId, error.message); return; }
    message(messageId, 'Connecting…', true);
    if (client) await client.auth.signOut();
    config = { url: url.trim().replace(//$/, ''), key: key.trim() };
    localStorage.setItem(configName, JSON.stringify(config));
    client = next;
    user = null;
    tasks = [];
    $('#connection-dialog').close();
    await boot();
  }
  async function boot() {
    if (!client) { showScreen('setup-screen'); return; }
    showScreen('loading-screen');
    client.auth.onAuthStateChange((event, session) => window.setTimeout(() => { void applySession(session); }, 0));
    const result = await client.auth.getSession();
    if (result.error) { showScreen('auth-screen'); message('auth-message', niceError(result.error)); return; }
    await applySession(result.data.session);
  }
  async function applySession(session) {
    if (!session || !session.user) {
      user = null;
      tasks = [];
      showScreen(config ? 'auth-screen' : 'setup-screen');
      return;
    }
    if (user && user.id === session.user.id) return;
    user = session.user;
    const email = user.email || 'Your account';
    $('#user-email').textContent = email;
    $('#user-avatar').textContent = email.charAt(0).toUpperCase();
    const first = email.split('@')[0].split(/[._-]/)[0];
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    $('#greeting').textContent = greeting + (first ? ', ' + first : '') + '.';
    showScreen('dashboard-screen');
    await loadTasks();
  }
  async function loadTasks() {
    if (!client || !user) return;
    $('#task-list').textContent = 'Loading your tasks…';
    const result = await client.from('tasks').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    if (result.error) { tasks = []; render(); toast(niceError(result.error)); return; }
    tasks = result.data || [];
    render();
  }
  function dayBounds(date) {
    const d = date || new Date();
    return { start: new Date(d.getFullYear(), d.getMonth(), d.getDate()), end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) };
  }
  function dueToday(task) {
    if (!task.due_at) return false;
    const date = new Date(task.due_at);
    const bounds = dayBounds();
    return date >= bounds.start && date < bounds.end;
  }
  function ordered(items) {
    return items.slice().sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || new Date(a.created_at || 0) - new Date(b.created_at || 0));
  }
  function filteredTasks() {
    const query = $('#task-search').value.trim().toLowerCase();
    const category = $('#category-filter').value;
    const priority = $('#priority-filter').value;
    const end = dayBounds().end;
    return ordered(tasks).filter((task) => {
      if (view === 'today' && (task.completed || !dueToday(task))) return false;
      if (view === 'upcoming' && (task.completed || !task.due_at || new Date(task.due_at) < end)) return false;
      if (view === 'completed' && !task.completed) return false;
      if (category !== 'all' && task.category !== category) return false;
      if (priority !== 'all' && task.priority !== priority) return false;
      const haystack = (task.title + ' ' + (task.notes || '') + ' ' + (task.category || '')).toLowerCase();
      return !query || haystack.includes(query);
    });
  }
  function formatDue(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return '';
    const bounds = dayBounds();
    const tomorrow = new Date(bounds.start.getFullYear(), bounds.start.getMonth(), bounds.start.getDate() + 1);
    const afterTomorrow = new Date(bounds.start.getFullYear(), bounds.start.getMonth(), bounds.start.getDate() + 2);
    let day = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
    if (date >= bounds.start && date < bounds.end) day = 'Today';
    else if (date >= tomorrow && date < afterTomorrow) day = 'Tomorrow';
    const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
    return day + ' · ' + time;
  }
  function button(label, glyph, className, handler, disabled) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'task-action ' + className;
    node.setAttribute('aria-label', label);
    node.title = label;
    node.textContent = glyph;
    node.disabled = Boolean(disabled);
    node.addEventListener('click', handler);
    return node;
  }
  function makeRow(task) {
    const row = document.createElement('article');
    row.className = 'task-row' + (task.completed ? ' is-completed' : '');
    const check = document.createElement('button');
    check.type = 'button';
    check.className = 'check-button';
    check.setAttribute('aria-label', task.completed ? 'Mark ' + task.title + ' as not completed' : 'Mark ' + task.title + ' as completed');
    check.textContent = '✓';
    check.addEventListener('click', () => { void toggleTask(task); });
    const main = document.createElement('div');
    main.className = 'task-main';
    const title = document.createElement('span');
    title.className = 'task-title';
    title.textContent = task.title;
    main.append(title);
    if (task.notes) {
      const note = document.createElement('span');
      note.className = 'task-note-preview';
      note.textContent = '▤  ' + task.notes;
      main.append(note);
    }
    const meta = document.createElement('div');
    meta.className = 'task-meta';
    const category = document.createElement('span');
    category.className = 'category-chip';
    category.textContent = task.category || 'Personal';
    meta.append(category);
    const priorityName = ['low', 'medium', 'high'].includes(task.priority) ? task.priority : 'medium';
    const priority = document.createElement('span');
    priority.className = 'priority-chip priority-' + priorityName;
    priority.textContent = priorityName.charAt(0).toUpperCase() + priorityName.slice(1) + ' priority';
    meta.append(priority);
    if (task.due_at) {
      const due = document.createElement('span');
      const late = !task.completed && new Date(task.due_at) < new Date();
      due.className = 'due-chip' + (late ? ' is-overdue' : '');
      due.textContent = (late ? 'Overdue · ' : '◷ ') + formatDue(task.due_at);
      meta.append(due);
    }
    main.append(meta);
    const actions = document.createElement('div');
    actions.className = 'task-actions';
    const reorderAllowed = view === 'all' && $('#category-filter').value === 'all' && $('#priority-filter').value === 'all' && !$('#task-search').value.trim();
    if (reorderAllowed) {
      const list = ordered(tasks);
      const index = list.findIndex((item) => item.id === task.id);
      actions.append(button('Move up', '↑', 'reorder', () => { void moveTask(task.id, -1); }, index <= 0));
      actions.append(button('Move down', '↓', 'reorder', () => { void moveTask(task.id, 1); }, index < 0 || index === list.length - 1));
    }
    actions.append(button('Edit task and notes', '✎', 'edit', () => openTask(task)));
    actions.append(button('Delete task', '×', 'delete', () => openDelete(task)));
    row.append(check, main, actions);
    return row;
  }
  function render() {
    const completed = tasks.filter((task) => task.completed).length;
    const open = tasks.length - completed;
    const today = tasks.filter((task) => !task.completed && dueToday(task)).length;
    const upcoming = tasks.filter((task) => !task.completed && task.due_at && new Date(task.due_at) >= dayBounds().end).length;
    const visible = filteredTasks();
    $('#open-count').textContent = open;
    $('#today-count').textContent = today;
    $('#done-count').textContent = completed;
    $('#open-detail').textContent = open === 1 ? 'one step at a time' : 'ready when you are';
    $('#nav-all-count').textContent = tasks.length;
    $('#nav-today-count').textContent = today;
    $('#nav-upcoming-count').textContent = upcoming;
    $('#nav-completed-count').textContent = completed;
    $('#heading-count').textContent = visible.length;
    $('#visible-count').textContent = visible.length;
    const labels = { all: ['YOUR SPACE', 'All tasks', 'A little progress, at your pace.'], today: ['A GENTLE PLAN', 'Today', 'Just the steps for today.'], upcoming: ['LOOKING AHEAD', 'Upcoming', 'Your future steps, all in one place.'], completed: ['GIVE YOURSELF CREDIT', 'Completed', 'Look at what you have already done.'] };
    const copy = labels[view];
    $('#list-eyebrow').textContent = copy[0];
    $('#list-heading').childNodes[0].textContent = copy[1] + ' ';
    $('#list-subtitle').textContent = copy[2];
    $('#list-label').textContent = view === 'all' ? 'ALL TASKS' : view === 'today' ? 'DUE TODAY' : view === 'upcoming' ? 'COMING UP' : 'COMPLETED';
    $('#reorder-note').hidden = view !== 'all';
    $('#reorder-note').textContent = view === 'all' ? '↕  Move tasks with the arrows' : '';
    document.querySelectorAll('.view-button').forEach((node) => {
      const selected = node.dataset.view === view;
      node.classList.toggle('is-active', selected);
      node.setAttribute('aria-pressed', String(selected));
    });
    $('#task-list').replaceChildren(...visible.map(makeRow));
    const hasFilter = Boolean($('#task-search').value.trim() || $('#category-filter').value !== 'all' || $('#priority-filter').value !== 'all');
    $('#empty-state').classList.toggle('is-visible', visible.length === 0);
    if (visible.length === 0 && hasFilter) {
      $('#empty-title').textContent = 'No tasks match those filters.';
      $('#empty-copy').textContent = 'Try a different search or clear a filter to see more.';
      $('#empty-add-button').hidden = true;
    } else if (visible.length === 0 && view === 'today' && tasks.length) {
      $('#empty-title').textContent = 'Nothing due today.';
      $('#empty-copy').textContent = 'Enjoy a little breathing room, or add a task whenever you are ready.';
      $('#empty-add-button').hidden = false;
    } else if (visible.length === 0 && view === 'upcoming' && tasks.length) {
      $('#empty-title').textContent = 'Your calendar is open.';
      $('#empty-copy').textContent = 'Add a due date and time when you want to plan ahead.';
      $('#empty-add-button').hidden = false;
    } else if (visible.length === 0 && view === 'completed' && tasks.length) {
      $('#empty-title').textContent = 'Your wins will show up here.';
      $('#empty-copy').textContent = 'Check off a task when you finish it, and give yourself credit.';
      $('#empty-add-button').hidden = true;
    } else {
      $('#empty-title').textContent = 'A clear mind starts here.';
      $('#empty-copy').textContent = 'Add a task above. It doesn’t have to be a big one.';
      $('#empty-add-button').hidden = false;
    }
  }
  async function toggleTask(task) {
    const result = await client.from('tasks').update({ completed: !task.completed }).eq('id', task.id).select().single();
    if (result.error) { toast(niceError(result.error)); return; }
    tasks = tasks.map((item) => item.id === task.id ? result.data : item);
    render();
    toast(result.data.completed ? 'One little thing, done.' : 'Back on your list.');
  }
  async function moveTask(id, direction) {
    const list = ordered(tasks);
    const index = list.findIndex((task) => task.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= list.length) return;
    const first = list[index];
    const second = list[next];
    const firstOrder = Number(first.sort_order) || 0;
    const secondOrder = Number(second.sort_order) || 0;
    const results = await Promise.all([
      client.from('tasks').update({ sort_order: secondOrder }).eq('id', first.id),
      client.from('tasks').update({ sort_order: firstOrder }).eq('id', second.id),
    ]);
    if (results[0].error || results[1].error) { toast(niceError(results[0].error || results[1].error)); await loadTasks(); return; }
    tasks = tasks.map((task) => task.id === first.id ? Object.assign({}, task, { sort_order: secondOrder }) : task.id === second.id ? Object.assign({}, task, { sort_order: firstOrder }) : task);
    render();
  }
  function localInput(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function openTask(task) {
    editingId = task ? task.id : null;
    $('#task-dialog-title').textContent = task ? 'Edit task' : 'Add a task';
    $('#task-save-button').textContent = task ? 'Save changes →' : 'Save task →';
    $('#task-title').value = task ? task.title : '';
    $('#task-notes').value = task ? (task.notes || '') : '';
    $('#task-category').value = task && categories.includes(task.category) ? task.category : 'Personal';
    $('#task-priority').value = task && ['low', 'medium', 'high'].includes(task.priority) ? task.priority : 'medium';
    $('#task-due').value = task && task.due_at ? localInput(task.due_at) : '';
    message('task-message', '');
    $('#task-dialog').showModal();
    $('#task-title').focus();
  }
  async function saveTask(event) {
    event.preventDefault();
    const title = $('#task-title').value.trim();
    if (!title) { message('task-message', 'Please give your task a name.'); return; }
    const dueValue = $('#task-due').value;
    const dueDate = dueValue ? new Date(dueValue) : null;
    if (dueValue && Number.isNaN(dueDate.getTime())) { message('task-message', 'Choose a valid due date and time.'); return; }
    const values = {
      title: title,
      notes: $('#task-notes').value.trim(),
      category: categories.includes($('#task-category').value) ? $('#task-category').value : 'Personal',
      priority: ['low', 'medium', 'high'].includes($('#task-priority').value) ? $('#task-priority').value : 'medium',
      due_at: dueDate ? dueDate.toISOString() : null,
    };
    const save = $('#task-save-button');
    save.disabled = true;
    message('task-message', 'Saving…', true);
    let result;
    if (editingId) result = await client.from('tasks').update(values).eq('id', editingId).select().single();
    else {
      const maxOrder = tasks.reduce((max, task) => Math.max(max, Number(task.sort_order) || 0), -1);
      result = await client.from('tasks').insert(Object.assign({}, values, { user_id: user.id, completed: false, sort_order: maxOrder + 1 })).select().single();
    }
    save.disabled = false;
    if (result.error) { message('task-message', niceError(result.error)); return; }
    if (editingId) tasks = tasks.map((task) => task.id === editingId ? result.data : task);
    else tasks.push(result.data);
    $('#task-dialog').close();
    render();
    toast(editingId ? 'Your task was updated.' : 'Added to your list.');
  }
  function openDelete(task) {
    deletingId = task.id;
    $('#delete-title').textContent = 'Delete “' + task.title + '”?';
    $('#delete-dialog').showModal();
  }
  async function deleteTask() {
    if (!deletingId) return;
    const buttonNode = $('#confirm-delete');
    buttonNode.disabled = true;
    const result = await client.from('tasks').delete().eq('id', deletingId);
    buttonNode.disabled = false;
    if (result.error) { $('#delete-dialog').close(); toast(niceError(result.error)); return; }
    tasks = tasks.filter((task) => task.id !== deletingId);
    deletingId = null;
    $('#delete-dialog').close();
    render();
    toast('Task removed.');
  }
  function setAuthMode(registering) {
    $('#mode-login').classList.toggle('is-selected', !registering);
    $('#mode-register').classList.toggle('is-selected', registering);
    $('#mode-login').setAttribute('aria-pressed', String(!registering));
    $('#mode-register').setAttribute('aria-pressed', String(registering));
    $('#auth-title').textContent = registering ? 'Start with one step.' : 'Welcome back.';
    $('#auth-intro').textContent = registering ? 'Create your account to keep your tasks safe and in sync.' : 'Sign in to pick up where you left off.';
    $('#auth-submit').textContent = registering ? 'Create account →' : 'Log in →';
    $('#auth-password').autocomplete = registering ? 'new-password' : 'current-password';
    $('#confirm-password-wrap').hidden = !registering;
    $('#confirm-password').required = registering;
    $('#auth-form').dataset.mode = registering ? 'register' : 'login';
    message('auth-message', '');
  }
  async function submitAuth(event) {
    event.preventDefault();
    const email = $('#auth-email').value.trim().toLowerCase();
    const password = $('#auth-password').value;
    const registering = $('#auth-form').dataset.mode === 'register';
    if (registering && password !== $('#confirm-password').value) { message('auth-message', 'Those passwords do not match. Please check them.'); $('#confirm-password').focus(); return; }
    const submit = $('#auth-submit');
    submit.disabled = true;
    message('auth-message', registering ? 'Creating your account…' : 'Logging you in…', true);
    const result = registering
      ? await client.auth.signUp({ email: email, password: password, options: { emailRedirectTo: window.location.origin + window.location.pathname } })
      : await client.auth.signInWithPassword({ email: email, password: password });
    submit.disabled = false;
    if (result.error) { message('auth-message', niceError(result.error)); return; }
    if (registering && !result.data.session) { message('auth-message', 'Your account is ready. Check your email for a confirmation link, then come back to log in.', true); return; }
    if (result.data.session) await applySession(result.data.session);
  }
  async function signOut() {
    const result = await client.auth.signOut();
    if (result.error) { toast(niceError(result.error)); return; }
    user = null;
    tasks = [];
    showScreen('auth-screen');
    setAuthMode(false);
    toast('You are signed out.');
  }
  function localDateLabel(date) {
    return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(date).toUpperCase();
  }
  $('#setup-form').addEventListener('submit', (event) => { event.preventDefault(); void connect($('#setup-url').value, $('#setup-key').value, 'setup-message'); });
  $('#connection-form').addEventListener('submit', (event) => { event.preventDefault(); void connect($('#settings-url').value, $('#settings-key').value, 'connection-message'); });
  $('#mode-login').addEventListener('click', () => setAuthMode(false));
  $('#mode-register').addEventListener('click', () => setAuthMode(true));
  $('#auth-form').addEventListener('submit', submitAuth);
  $('#task-form').addEventListener('submit', saveTask);
  $('#add-task-button').addEventListener('click', () => openTask(null));
  $('#empty-add-button').addEventListener('click', () => openTask(null));
  $('#confirm-delete').addEventListener('click', () => { void deleteTask(); });
  $('#sign-out-button').addEventListener('click', () => { void signOut(); });
  $('#settings-button').addEventListener('click', () => {
    $('#settings-url').value = config ? config.url : '';
    $('#settings-key').value = config ? config.key : '';
    message('connection-message', '');
    $('#connection-dialog').showModal();
  });
  document.querySelectorAll('[data-close]').forEach((node) => node.addEventListener('click', () => $('#' + node.dataset.close).close()));
  document.querySelectorAll('.view-button').forEach((node) => node.addEventListener('click', () => { view = node.dataset.view; render(); }));
  $('#task-search').addEventListener('input', render);
  $('#priority-filter').addEventListener('change', render);
  $('#category-filter').addEventListener('change', render);
  $('#delete-dialog').addEventListener('close', () => { deletingId = null; });
  $('#today-label').textContent = localDateLabel(new Date());
  setAuthMode(false);
  config = readConfig();
  if (config) {
    try { client = makeClient(config.url, config.key); void boot(); }
    catch (error) { config = null; showScreen('setup-screen'); message('setup-message', error.message); }
  } else showScreen('setup-screen');
})();
