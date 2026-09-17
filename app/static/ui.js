/* Custom pickers (bottom sheet on phone, dialog on desktop) and the entry form.
   Markup: <div class="picker" data-title="Category">
             <input type="hidden" name="category_id" value="3">
             <button type="button" class="field">…</button>
             <ul hidden><li data-value="3" data-type="Spending" data-class="chase cc">Dining Out</li>…</ul>
           </div>
   Date:   <div class="picker date" data-title="Date"><input type="hidden" name="date" value="2026-09-17"><button …></div> */
(function () {
  const CHEV = '<svg class="chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>';
  const TICK = '<svg class="tick" viewBox="0 0 24 24"><path d="m5 12 5 5L20 7"/></svg>';
  let open = null;

  function sheet(title, build) {
    close();
    const bd = document.createElement('div'); bd.className = 'backdrop';
    bd.innerHTML = `<div class="sheet" role="dialog" aria-label="${title}"><header><span>${title}</span><button type="button" class="ghost sm">Done</button></header><div class="body"></div></div>`;
    bd.addEventListener('click', e => { if (e.target === bd) close(); });
    bd.querySelector('header button').addEventListener('click', close);
    build(bd.querySelector('.body'));
    document.body.appendChild(bd); open = bd;
    requestAnimationFrame(() => bd.classList.add('show'));
    document.addEventListener('keydown', esc);
  }
  function esc(e) { if (e.key === 'Escape') close(); }
  function close() {
    if (!open) return; const bd = open; open = null;
    bd.classList.remove('show'); document.removeEventListener('keydown', esc);
    setTimeout(() => bd.remove(), 160);
  }

  function dotHTML(cls) {
    return cls ? `<span class="acct ${cls}"><span class="dot"></span></span>` : '';
  }
  function renderField(p) {
    const input = p.querySelector('input'), btn = p.querySelector('.field');
    const li = [...p.querySelectorAll('li')].find(l => l.dataset.value === input.value);
    const label = p.dataset.title;
    if (li) btn.innerHTML = `<span class="k">${label}</span><span class="v">${dotHTML(li.dataset.class)}${li.textContent}</span>${CHEV}`;
    else btn.innerHTML = `<span class="k">${label}</span><span class="v ph">${p.dataset.placeholder || 'Choose'}</span>${CHEV}`;
  }
  function openList(p) {
    const input = p.querySelector('input');
    sheet(p.dataset.title, body => {
      let group = null;
      p.querySelectorAll('li').forEach(li => {
        if (li.dataset.group && li.dataset.group !== group) {
          group = li.dataset.group; const g = document.createElement('div'); g.className = 'opt-group'; g.textContent = group; body.appendChild(g);
        }
        const b = document.createElement('button'); b.type = 'button'; b.className = 'opt';
        b.setAttribute('aria-selected', li.dataset.value === input.value);
        b.innerHTML = `${dotHTML(li.dataset.class)}<span>${li.textContent}</span>${li.dataset.hint ? `<span class="hint">${li.dataset.hint}</span>` : ''}${TICK}`;
        b.addEventListener('click', () => { set(p, li.dataset.value); close(); });
        body.appendChild(b);
      });
    });
  }
  function set(p, value) {
    const input = p.querySelector('input'); input.value = value; renderField(p);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---- date ----
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  function fmtDate(s) {
    const d = parse(s), t = new Date(); t.setHours(0,0,0,0);
    const diff = Math.round((t - d) / 864e5);
    if (diff === 0) return 'Today'; if (diff === 1) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + (d.getFullYear() !== t.getFullYear() ? ` ${d.getFullYear()}` : '');
  }
  function renderDate(p) {
    const input = p.querySelector('input'), btn = p.querySelector('.field');
    btn.innerHTML = `<span class="k">${p.dataset.title}</span><span class="v">${fmtDate(input.value)}</span>${CHEV}`;
  }
  function openDate(p) {
    const input = p.querySelector('input'); let view = parse(input.value); view.setDate(1);
    sheet(p.dataset.title, body => {
      const cal = document.createElement('div'); cal.className = 'cal'; body.appendChild(cal);
      const draw = () => {
        const sel = input.value, today = iso(new Date());
        const y = view.getFullYear(), m = view.getMonth();
        const first = new Date(y, m, 1), start = new Date(first); start.setDate(1 - first.getDay());
        let html = `<div class="quick"><button type="button" class="chip">Today</button><button type="button" class="chip">Yesterday</button></div>
          <div class="head"><button type="button" class="ghost" data-nav="-1">‹</button><span>${MONTHS[m]} ${y}</span><button type="button" class="ghost" data-nav="1">›</button></div><div class="grid">`;
        'SMTWTFS'.split('').forEach(c => html += `<div class="dow">${c}</div>`);
        for (let i = 0; i < 42; i++) {
          const d = new Date(start); d.setDate(start.getDate() + i); const s = iso(d);
          html += `<button type="button" class="d${d.getMonth() !== m ? ' other' : ''}${s === today ? ' today' : ''}${s === sel ? ' sel' : ''}" data-d="${s}">${d.getDate()}</button>`;
        }
        cal.innerHTML = html + '</div>';
        cal.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => { view.setMonth(view.getMonth() + Number(b.dataset.nav)); draw(); }));
        cal.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => { input.value = b.dataset.d; renderDate(p); close(); }));
        const [t, yst] = cal.querySelectorAll('.quick .chip');
        t.addEventListener('click', () => { input.value = today; renderDate(p); close(); });
        yst.addEventListener('click', () => { const d = new Date(); d.setDate(d.getDate() - 1); input.value = iso(d); renderDate(p); close(); });
      };
      draw();
    });
  }

  function init(root) {
    root.querySelectorAll('.picker').forEach(p => {
      if (p.dataset.ready) return; p.dataset.ready = 1;
      const isDate = p.classList.contains('date');
      (isDate ? renderDate : renderField)(p);
      p.querySelector('.field').addEventListener('click', () => (isDate ? openDate : openList)(p));
    });
  }
  window.UI = { init, set, close, renderField, renderDate };
  document.addEventListener('DOMContentLoaded', () => init(document));
  document.addEventListener('htmx:afterSwap', e => init(e.target));
})();

/* Entry form: category type decides which of From / To are shown. */
(function () {
  const HINT = { 'Money in': 'Money in fills To only.', 'Spending': 'Spending fills From only.', 'Transfer': 'A transfer fills From and To.',
                 'Saving': 'Saving leaves From. To is optional.', 'Loan': 'A loan payment leaves From. To is optional.' };
  function shape(form) {
    const cat = form.querySelector('[name=category_id]');
    const li = [...form.querySelectorAll('.picker.cat li')].find(l => l.dataset.value === cat.value);
    const type = li ? li.dataset.type : 'Spending';
    const from = form.querySelector('.picker.from'), to = form.querySelector('.picker.to');
    from.hidden = type === 'Money in'; to.hidden = type === 'Spending';
    if (from.hidden) UI.set(from, ''); if (to.hidden) UI.set(to, '');
    form.querySelector('.hint-line').textContent = HINT[type] || '';
  }
  window.Entry = {
    shape,
    favorite(el) {
      const f = document.getElementById('entry'); const d = el.dataset;
      UI.set(f.querySelector('.picker.cat'), d.cat); shape(f);
      if (!f.querySelector('.picker.from').hidden) UI.set(f.querySelector('.picker.from'), d.from || '');
      if (!f.querySelector('.picker.to').hidden) UI.set(f.querySelector('.picker.to'), d.to || '');
      f.querySelector('[name=what]').value = d.label || '';
      const amt = f.querySelector('[name=amount]');
      if (d.amount) { amt.value = d.amount; f.querySelector('button[type=submit]').focus(); } else { amt.value = ''; amt.focus(); }
      document.querySelectorAll('.chips .chip').forEach(c => c.classList.toggle('on', c === el));
    }
  };
  document.addEventListener('DOMContentLoaded', () => {
    const f = document.getElementById('entry'); if (!f) return;
    shape(f);
    f.querySelector('[name=category_id]').addEventListener('change', () => shape(f));
  });
})();
