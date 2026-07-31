import type { Cell, DoctrineLevel, GameState, ToolId } from './types';
import { makeRng, randomSeed, type Rng } from './rng';
import { W, H, CELL, TYPES, TOOLS, LEGEND_KEYS, isWooded, pineLabel, HORIZON, DENSITY, DOCTRINE, DOCTRINE_SWITCH } from './params';
import { idx, inb } from './util';
import { generate } from './terrain';
import { moisture, fuel, crownRisk, biodiversity, closedShare, isManaged, defendable, meanDensity, managedShare, hardenedShare } from './model';
import { applyTool, toolById, type LogMsg } from './tools';
import { sectorStats, SECTOR_KINDS } from './sectors';
import {
  POLICIES, policyById, canApply, activate, deactivate, postFireWindow, ACCEPT,
  costOf, socialOf, upkeepOf, type PolicyId,
} from './policies';
import { startSummer, endSeason } from './season';
import { newFireRun, stepFire, type FireRun } from './fire';
import { afterFireReport } from './report';
import { draw, resizeCanvas, drawSwatch, type DrawOpts } from './render';
import { bilan } from './score';

/**
 * UI controller. Owns the DOM wiring, the animation loop and the season flow.
 * All model logic lives in the pure modules; this file only orchestrates.
 */
export function mount(root: HTMLElement, opts: { seed?: number; maxYears?: number } = {}): void {
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const cv = q<HTMLCanvasElement>('[data-sim-cv]');
  const ctx = cv.getContext('2d');
  if (!ctx) return; // fallback content stays visible

  const rng: Rng = makeRng(opts.seed ?? randomSeed());
  const state: GameState = {
    w: W, h: H, grid: [], sectors: [], year: 1, maxYears: opts.maxYears ?? HORIZON.long,
    pa: 8, drought: 0.35, lastDrought: 0.35, burnedCum: 0, lost: 0, wind: null,
    doctrine: 2, suppressedCum: 0, yearsAtCran1: 0, burnedEver: 0,
    spentCum: 0, bigFireYear: 0, bigFireDone: false,
    accept: ACCEPT.start, policies: [],
  };

  let tool: ToolId | null = null;
  /** Policy armed and waiting for a sector to be designated (§3.2). */
  let armed: PolicyId | null = null;
  let busy = false;
  let hover: { x: number; y: number } | null = null;
  let run: FireRun = newFireRun(false);
  let bigFireThisYear = false; // is this season's fire the scheduled great fire?
  let sectorView = false;

  // ---- rendering ----
  const hoverSector = () => (hover ? state.grid[idx(hover.x, hover.y)].sector : -1);
  /** Sectors a designated policy may be applied to, for the map highlight. */
  const eligible = (): number[] => {
    if (!armed) return [];
    const p = policyById(armed);
    return state.sectors
      .filter((s) => canApply(p, s.kind) && !state.policies.some((a) => a.id === p.id && a.sector === s.id))
      .map((s) => s.id);
  };
  const render = () => {
    const o: DrawOpts = {
      hover, embers: run.embers, busy, tool, sectorView,
      hoverSector: hoverSector(), eligibleSectors: eligible(),
    };
    draw(ctx, state, o);
  };

  // ---- log ----
  const logEl = q('[data-sim-log]');
  const say = (text: string, cls?: 'hot' | 'good') => {
    const p = document.createElement('p');
    if (cls) p.className = cls;
    p.innerHTML = text;
    logEl.insertBefore(p, logEl.firstChild);
  };
  const sayYear = () => {
    const p = document.createElement('p');
    p.className = 'yr';
    p.textContent = `Année ${state.year}`;
    logEl.insertBefore(p, logEl.firstChild);
  };
  const flush = (msgs: LogMsg[]) => msgs.forEach((m) => say(m.text, m.cls));

  // ---- slow-variable dashboard (amendment §2.3): leading indicators shown as
  // trends (bar + threshold marker + year-on-year arrow), so the drift is
  // visible before the crisis. ----
  interface Ind { key: string; label: string; value: () => number; max: number; mark?: number; adverseUp: boolean; }
  const INDICATORS: Ind[] = [
    { key: 'dens', label: 'Densité moyenne', value: () => meanDensity(state.grid), max: DENSITY.gameMax, mark: DENSITY.threshold, adverseUp: true },
    { key: 'closed', label: 'Paysage fermé', value: () => closedShare(state.grid), max: 100, adverseUp: true },
    { key: 'managed', label: 'Sous gestion', value: () => managedShare(state.grid), max: 100, adverseUp: false },
    { key: 'hard', label: 'Bâti durci', value: () => hardenedShare(state.grid), max: 100, adverseUp: false },
    { key: 'drought', label: 'Sécheresse', value: () => Math.round(state.drought * 100), max: 100, adverseUp: true },
  ];
  const prevInd: Record<string, number> = {};
  const buildDash = () => {
    const host = q('[data-sim-dash]');
    for (const ind of INDICATORS) {
      const row = document.createElement('div');
      row.className = 'sim-ind';
      row.dataset.k = ind.key;
      const markHtml = ind.mark ? `<i class="mark" style="left:${(ind.mark / ind.max) * 100}%"></i>` : '';
      row.innerHTML =
        `<div class="sim-ind__top"><span>${ind.label}</span><span class="trend" data-trend></span></div>` +
        `<div class="sim-ind__bar"><span data-fill></span>${markHtml}</div>`;
      host.appendChild(row);
    }
  };
  const updateDash = () => {
    for (const ind of INDICATORS) {
      const v = ind.value();
      const row = q<HTMLElement>(`.sim-ind[data-k="${ind.key}"]`);
      const fill = row.querySelector<HTMLElement>('[data-fill]')!;
      const pct = Math.min(100, (v / ind.max) * 100);
      fill.style.width = `${pct}%`;
      // Adverse when past the marked threshold (density) or simply high/low.
      const adverse = ind.mark ? v > ind.mark : ind.adverseUp ? pct > 55 : pct < 45;
      row.classList.toggle('is-adverse', adverse);
      const prev = prevInd[ind.key];
      const trendEl = row.querySelector<HTMLElement>('[data-trend]')!;
      if (prev === undefined || Math.abs(v - prev) < ind.max * 0.02) trendEl.textContent = '→';
      else trendEl.textContent = v > prev ? '↑' : '↓';
    }
  };
  /** Snapshot indicator values (called once per year) for the trend arrows. */
  const snapshotDash = () => { for (const ind of INDICATORS) prevInd[ind.key] = ind.value(); };

  // ---- HUD ----
  const hud = () => {
    q('[data-sim-year]').textContent = String(state.year);
    q('[data-sim-max]').textContent = String(state.maxYears);
    q('[data-sim-pa]').textContent = String(state.pa);
    q('[data-sim-patag]').textContent = `${state.pa} PA`;
    q('[data-sim-drought]').textContent = state.drought.toFixed(2);
    q<HTMLElement>('[data-sim-needle]').style.left = `${state.drought * 100}%`;
    let tot = 0;
    let ok = 0;
    for (const c of state.grid) if (c.t === 'bati') { tot++; if (!c.destroyed) ok++; }
    q('[data-sim-bati]').textContent = String(ok);
    q('[data-sim-batit]').textContent = String(tot);
    q('[data-sim-bio]').textContent = String(biodiversity(state.grid));
    q('[data-sim-brul]').textContent = String(Math.round((state.burnedEver / state.grid.length) * 100));
    q('[data-sim-perte]').textContent = String(state.lost);
    q('[data-sim-closed]').textContent = String(closedShare(state.grid));
    q('[data-sim-accept]').textContent = String(Math.round(state.accept));
    q<HTMLElement>('[data-sim-acceptbar]').style.width = `${state.accept}%`;
    updateDash();
    root.querySelectorAll<HTMLButtonElement>('.sim-tool').forEach((b) => {
      const t = toolById(b.dataset.id as ToolId);
      b.disabled = busy || state.pa < t.pa;
    });
    root.querySelectorAll<HTMLButtonElement>('.sim-pol').forEach((b) => {
      const P = policyById(b.dataset.id as PolicyId);
      b.disabled = busy || state.pa < P.cost || state.accept < P.social;
    });
    renderActive();
    q<HTMLButtonElement>('[data-sim-go]').disabled = busy;
  };

  // ---- tooltip (lever hints + cell read-out) ----
  const tip = q('[data-sim-tip]');
  const hideTip = () => { tip.hidden = true; };
  const showTip = (html: string) => { tip.innerHTML = html; tip.hidden = false; };
  // Left edge of the tools panel: tooltips stay to its left, over the map, so
  // they never cover the levers.
  const panelLeft = () => q('[data-sim-tools]').getBoundingClientRect().left;
  const clampY = (y: number, h: number) => Math.max(8, Math.min(y, window.innerHeight - h - 8));

  // Anchor by the right edge (button.left - gap) so the tooltip grows leftward
  // and its right edge is always clear of the lever, whatever its width.
  const placeTipAtEl = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    tip.style.left = 'auto';
    tip.style.right = `${Math.max(8, window.innerWidth - (r.left - 12))}px`;
    const h = tip.offsetHeight;
    tip.style.top = `${clampY(r.top + r.height / 2 - h / 2, h)}px`;
  };
  const placeTipAtCursor = (cx: number, cy: number) => {
    tip.style.right = 'auto';
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let x = cx + 14;
    if (x + w > panelLeft() - 8) x = cx - w - 14; // stay clear of the panel
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${clampY(cy + 14, h)}px`;
  };

  // ---- tools palette ----
  const buildTools = () => {
    const host = q('[data-sim-tools]');
    TOOLS.forEach((T) => {
      const b = document.createElement('button');
      b.className = 'sim-tool';
      b.setAttribute('aria-pressed', 'false');
      b.dataset.id = T.id;
      b.innerHTML = `<span class="gl">${T.gl}</span><span><span class="nm">${T.nm}</span><br><span class="zn">${T.zn}</span></span><span class="pa">${T.pa} PA</span>`;
      b.onclick = () => pick(T.id);
      b.onmouseenter = () => { showTip(T.hint); placeTipAtEl(b); };
      b.onmouseleave = hideTip;
      b.onfocus = () => { showTip(T.hint); placeTipAtEl(b); };
      b.onblur = hideTip;
      host.appendChild(b);
    });
    const lg = q('[data-sim-legend]');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const S = 30;
    LEGEND_KEYS.forEach((k) => {
      const item = document.createElement('span');
      item.className = 'sim-legend-item';
      const sc = document.createElement('canvas');
      sc.width = S * dpr;
      sc.height = S * dpr;
      sc.style.width = `${S}px`;
      sc.style.height = `${S}px`;
      const sx = sc.getContext('2d');
      if (sx) { sx.setTransform(dpr, 0, 0, dpr, 0, 0); drawSwatch(sx, k, S); }
      item.appendChild(sc);
      const lbl = document.createElement('span');
      lbl.textContent = TYPES[k].n;
      item.appendChild(lbl);
      lg.appendChild(item);
    });
  };
  const syncPressed = () => {
    root.querySelectorAll<HTMLButtonElement>('.sim-tool').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.id === tool ? 'true' : 'false');
    });
    root.querySelectorAll<HTMLButtonElement>('.sim-pol').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.id === armed ? 'true' : 'false');
    });
  };
  const pick = (id: ToolId) => {
    tool = tool === id ? null : id;
    armed = null; // the two registers are exclusive
    syncPressed();
    render();
  };
  const arm = (id: PolicyId) => {
    armed = armed === id ? null : id;
    tool = null;
    syncPressed();
    render();
  };

  // ---- policy palette (amendment §3, §4) ----
  const buildPolicies = () => {
    const host = q('[data-sim-pols]');
    POLICIES.forEach((P) => {
      const b = document.createElement('button');
      b.className = 'sim-pol';
      b.setAttribute('aria-pressed', 'false');
      b.dataset.id = P.id;
      b.innerHTML =
        `<span class="gl">${P.gl}</span>` +
        `<span><span class="nm">${P.nm}</span><br><span class="zn">${P.zn}</span></span>` +
        `<span class="cost"><b>${P.cost}</b> PA<br><i>${P.social}</i> ⌾</span>`;
      b.onclick = () => arm(P.id);
      const hint =
        `${P.hint}<br><br><span style="opacity:.75">Entretien ${P.upkeep} PA/an` +
        (P.socialUpkeep ? ` et ${P.socialUpkeep} ⌾/an` : '') +
        ` · effet plein en ${P.delay} an${P.delay > 1 ? 's' : ''}.</span>`;
      b.onmouseenter = () => { showTip(hint); placeTipAtEl(b); };
      b.onmouseleave = hideTip;
      b.onfocus = () => { showTip(hint); placeTipAtEl(b); };
      b.onblur = hideTip;
      host.appendChild(b);
    });
  };

  /** Policies in force, with adoption progress and a way to lift them. */
  const renderActive = () => {
    const host = q('[data-sim-active]');
    if (!state.policies.length) {
      host.innerHTML = '<p class="sim-active__empty">Aucune politique en vigueur. Les leviers ponctuels soulagent tout de suite ; les politiques transforment lentement.</p>';
      return;
    }
    host.innerHTML = state.policies
      .map((a) => {
        const P = policyById(a.id);
        const s = state.sectors[a.sector];
        const pct = Math.round(a.ramp * 100);
        return `<div class="sim-active__row">
          <div class="sim-active__top">
            <span><b>${P.gl} ${P.nm}</b><br><small>${s ? s.name : '—'}</small></span>
            <button type="button" data-sim-lift="${a.id}:${a.sector}" title="Lever cette politique">✕</button>
          </div>
          <div class="sim-active__bar"><span style="width:${pct}%"></span></div>
          <small>${pct < 100 ? `montée en charge ${pct}%` : 'plein effet'}${s ? ` · ${upkeepOf(P, s)} PA/an` : ''}</small>
        </div>`;
      })
      .join('');
    host.querySelectorAll<HTMLButtonElement>('[data-sim-lift]').forEach((b) => {
      b.onclick = () => {
        const [id, sec] = b.dataset.simLift!.split(':');
        const P = policyById(id as PolicyId);
        const s = state.sectors[Number(sec)];
        deactivate(state, id as PolicyId, Number(sec));
        say(`« ${P.nm} » levée sur ${s ? s.name : 'ce secteur'}. Ce qui a été obtenu reste ; l'entretien s'arrête.`);
        hud();
      };
    });
  };

  /**
   * Sector card (amendment §3.2): the aggregate the player will actually decide
   * on once policies replace per-cell levers. Shown on top of the cell read-out
   * so the two grains stay distinguishable.
   */
  const describeSector = (c: Cell): string => {
    const s = state.sectors[c.sector];
    if (!s) return '';
    // With a policy armed, the read-out becomes a quote for this perimeter:
    // the same policy costs more on a whole versant than on one hamlet crown.
    if (armed) {
      const P = policyById(armed);
      if (!canApply(P, s.kind)) {
        return `<b>${s.name}</b><br><span style="opacity:.75">« ${P.nm} » ne se désigne pas sur ce type de secteur (${SECTOR_KINDS[s.kind].label.toLowerCase()}).</span>`;
      }
      const cost = costOf(P, s);
      const social = socialOf(P, s);
      const afford = state.pa >= cost && state.accept >= social;
      return (
        `<b>${P.nm}</b><br>sur <b>${s.name}</b> · ${s.cells.length} parcelles<br>` +
        `<span style="color:${afford ? '#9fd08a' : '#f0b58c'}">${cost} PA et ${social} ⌾ à l'engagement</span>` +
        `<br><span style="opacity:.75">puis ${upkeepOf(P, s)} PA/an · plein effet dans ${P.delay} an${P.delay > 1 ? 's' : ''}</span>`
      );
    }
    const st = sectorStats(state.grid, s);
    const bits: string[] = [`${st.cells} parcelles`];
    if (st.wooded) bits.push(`densité moy. ${st.meanDensity} tiges/ha`, `${st.closedPct}% fermé`, `${st.managedPct}% géré`);
    if (st.bati) bits.push(`${st.batiOk}/${st.bati} bâti debout, ${st.batiHard} durci${st.batiHard > 1 ? 's' : ''}`);
    if (st.grazed) bits.push(`${st.grazed} pâturée${st.grazed > 1 ? 's' : ''}`);
    if (st.burntPct) bits.push(`${st.burntPct}% brûlé`);
    return `<b>${s.name}</b><br><span style="opacity:.75">${SECTOR_KINDS[s.kind].label} · ${bits.join(' · ')}</span><hr style="border:none;border-top:1px solid rgba(255,255,255,.18);margin:.45rem 0">`;
  };

  const describe = (c: Cell): string => {
    const nom = c.t === 'pin' ? `${TYPES[c.t].n} (${pineLabel(c.species)})` : TYPES[c.t].n;
    return (
      describeSector(c) +
      `<b>${nom}</b> · humidité ${Math.round(moisture(c, state.drought) * 100)}%` +
      ` · combustible ${Math.round(fuel(c) * 100)}%` +
      ` · risque de passage en cime ${Math.round(crownRisk(c) * 100)}%` +
      (isWooded(c.t)
        ? ` · ${Math.round(c.age)} ans · densité ${Math.round(c.density)} tiges/ha` +
          (isManaged(c) ? ' · <span style="color:#9fd08a">géré</span>' : ' · <span style="color:#f0b58c">non géré</span>')
        : '') +
      (c.graze > 0 ? ' · pâturée' : '') + (c.hard ? ' · durcie' : '') +
      (c.wet > 0 ? ' · nappe soutenue' : '') +
      (c.disturb > 1 ? ' · <span style="color:#f0b58c">sol perturbé</span>' : '') +
      (c.t === 'bati'
        ? defendable(state.grid, c)
          ? ' · <span style="color:#9fd08a">défendable</span>'
          : ' · <span style="color:#f0b58c">non défendable</span>'
        : '')
    );
  };

  // ---- pointer ----
  const cellAt = (e: MouseEvent) => {
    const r = cv.getBoundingClientRect();
    const sc = (W * CELL) / r.width;
    const x = Math.floor(((e.clientX - r.left) * sc) / CELL);
    const y = Math.floor(((e.clientY - r.top) * sc) / CELL);
    return { x, y };
  };
  cv.addEventListener('mousemove', (e) => {
    const { x, y } = cellAt(e);
    hover = inb(x, y) ? { x, y } : null;
    if (hover && !busy && !tool) { showTip(describe(state.grid[idx(x, y)])); placeTipAtCursor(e.clientX, e.clientY); }
    else hideTip();
    render();
  });
  cv.addEventListener('mouseleave', () => { hover = null; hideTip(); render(); });
  cv.addEventListener('click', (e) => {
    if (busy) return;
    const { x, y } = cellAt(e);
    if (!inb(x, y)) return;
    const c = state.grid[idx(x, y)];

    // A designated policy takes the whole sector under the cursor (§3.2).
    if (armed) {
      const P = policyById(armed);
      const s = state.sectors[c.sector];
      if (!s) return;
      const err = activate(state, P, s);
      if (err) { say(err, 'hot'); hud(); return; }
      say(`<b>${P.nm}</b> engagée sur ${s.name} (${s.cells.length} parcelles). Plein effet dans ${P.delay} an${P.delay > 1 ? 's' : ''}.`, 'good');
      armed = null;
      syncPressed();
      render();
      hud();
      return;
    }

    if (!tool) return;
    const T = toolById(tool);
    if (state.pa < T.pa) return;
    const res = applyTool(state, c, tool);
    flush(res.messages);
    if (res.spend) { state.pa -= T.pa; state.spentCum += T.pa; }
    render();
    hud();
  });

  // ---- sector view (amendment §3.2) ----
  const sectorBtn = q<HTMLButtonElement>('[data-sim-sectors]');
  sectorBtn.addEventListener('click', () => {
    sectorView = !sectorView;
    sectorBtn.setAttribute('aria-pressed', String(sectorView));
    render();
  });

  // ---- season flow ----
  q<HTMLButtonElement>('[data-sim-go]').onclick = () => { if (!busy) summer(); };

  // ---- doctrine de lutte (amendment §5) ----
  // Deliberately no warning about what cran 1 does over time: the player has to
  // read it in the slow-variable gauges, and only the report after the great
  // fire says it outright.
  const buildDoctrine = () => {
    const host = q('[data-sim-doctrine]');
    ([1, 2, 3] as DoctrineLevel[]).forEach((lvl) => {
      const D = DOCTRINE[lvl];
      const b = document.createElement('button');
      b.className = 'sim-cran';
      b.type = 'button';
      b.dataset.cran = String(lvl);
      b.setAttribute('aria-pressed', String(state.doctrine === lvl));
      b.innerHTML = `<span class="lbl">${D.short}</span><span class="cst">${D.pa} PA${D.social ? ` · ${D.social} ⌾` : ''}</span>`;
      const hint = `<b>${D.label}</b><br>${D.hint}<br><br><span style="opacity:.75">Changer de doctrine coûte ${DOCTRINE_SWITCH.pa} PA et ${DOCTRINE_SWITCH.social} ⌾.</span>`;
      b.onclick = () => setDoctrine(lvl);
      b.onmouseenter = () => { showTip(hint); placeTipAtEl(b); };
      b.onmouseleave = hideTip;
      b.onfocus = () => { showTip(hint); placeTipAtEl(b); };
      b.onblur = hideTip;
      host.appendChild(b);
    });
  };

  const setDoctrine = (lvl: DoctrineLevel) => {
    if (busy || lvl === state.doctrine) return;
    if (state.pa < DOCTRINE_SWITCH.pa || state.accept < DOCTRINE_SWITCH.social) {
      say(`Changer de doctrine coûte ${DOCTRINE_SWITCH.pa} PA et ${DOCTRINE_SWITCH.social} ⌾. Pas les moyens cette année.`, 'hot');
      return;
    }
    state.pa -= DOCTRINE_SWITCH.pa;
    state.spentCum += DOCTRINE_SWITCH.pa;
    state.accept = Math.max(0, state.accept - DOCTRINE_SWITCH.social);
    state.doctrine = lvl;
    say(`Doctrine de lutte : <b>${DOCTRINE[lvl].label.toLowerCase()}</b>.`, 'good');
    root.querySelectorAll<HTMLButtonElement>('.sim-cran').forEach((b) => {
      b.setAttribute('aria-pressed', String(Number(b.dataset.cran) === lvl));
    });
    hud();
  };

  const summer = () => {
    busy = true;
    snapshotDash(); // record this year's indicators before the season changes them
    hud();
    sayYear();
    bigFireThisYear = state.year >= state.bigFireYear && !state.bigFireDone;
    const res = startSummer(state, rng);
    flush(res.messages);
    hud();
    render();
    if (!res.fireStarted) { window.setTimeout(finishSeason, 600); return; }
    run = newFireRun(false);
    runFire();
  };

  const runFire = () => {
    if (!run.escaped && !state.grid.some((c) => c.fs !== 0)) run = newFireRun(false);
    const timer = window.setInterval(() => {
      const active = stepFire(state, run, rng);
      render();
      if (!active) {
        window.clearInterval(timer);
        report();
      }
    }, 110);
  };

  const report = () => {
    const { burnedThis, structHit, spots, escaped } = run;
    // The post-fire window opens before the report is read, so its effect on
    // what is now affordable is visible on the very next turn (§3.3).
    const opportunity = postFireWindow(state, structHit, burnedThis);
    // Attributed after-fire report (amendment §2.2). Desired top-to-bottom order
    // in the journal: header, attributed lines, then the raw summary. The log
    // prepends, so emit in reverse.
    const lines: LogMsg[] = [
      ...afterFireReport(state, run, bigFireThisYear),
      ...(opportunity ? [opportunity] : []),
      {
        text: (escaped ? 'Échappée maîtrisée. ' : '') +
          `Feu éteint : <b>${burnedThis}</b> parcelles parcourues, ${spots} projection${spots > 1 ? 's' : ''} de braises.`,
        cls: structHit ? 'hot' : 'good',
      },
    ];
    for (let i = lines.length - 1; i >= 0; i--) say(lines[i].text, lines[i].cls);
    run = newFireRun(false);
    window.setTimeout(finishSeason, 700);
  };

  const finishSeason = () => {
    const res = endSeason(state, rng);
    flush(res.messages);
    if (res.finished) { busy = false; return finish(); }
    // A prescribed burn that got away becomes a real fire, out of season, on a
    // landscape that had not rehydrated. It runs before the player acts again.
    if (res.escaped) { hud(); render(); run = newFireRun(true); runEscapeFire(); return; }
    busy = false;
    hud();
    render();
  };

  const runEscapeFire = () => {
    const timer = window.setInterval(() => {
      const active = stepFire(state, run, rng);
      render();
      if (!active) {
        window.clearInterval(timer);
        say(
          `Reprise en main du brûlage échappé : <b>${run.burnedThis}</b> parcelles parcourues` +
            (run.structHit ? `, ${run.structHit} bâtiment${run.structHit > 1 ? 's' : ''} touché${run.structHit > 1 ? 's' : ''}` : '') + '.',
          'hot',
        );
        for (const c of state.grid) { c.fs = 0; c.crown = false; }
        run = newFireRun(false);
        busy = false;
        hud();
        render();
      }
    }, 110);
  };

  // ---- modals & sources pane ----
  // Overlays move to <body> so `position:fixed` is viewport-relative even while
  // the page-load transform is still on an ancestor (otherwise they drift down).
  const veil = q('[data-sim-veil]');
  const card = q('[data-sim-card]');
  const pane = q('[data-sim-pane]');
  const paneCard = q('[data-sim-pane-card]');
  document.body.appendChild(veil);
  document.body.appendChild(pane);
  document.body.appendChild(tip); // fixed-position, unaffected by ancestor transforms
  // Relocate the server-rendered sources section into the pane (it stays in
  // flow, and thus readable, when JavaScript is off).
  const sources = document.querySelector('[data-sim-sources]');
  if (sources) paneCard.appendChild(sources);

  const modal = (title: string, eyebrow: string, html: string) => {
    card.innerHTML = `<div class="eyebrow">${eyebrow}</div><h3>${title}</h3>${html}`;
    veil.hidden = false;
  };
  const closeModal = () => { veil.hidden = true; };
  const openPane = () => { pane.hidden = false; };
  const closePane = () => { pane.hidden = true; };

  veil.addEventListener('click', (e) => { if (e.target === veil) closeModal(); });
  pane.addEventListener('click', (e) => { if (e.target === pane) closePane(); });
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-sim-short]')) { state.maxYears = HORIZON.short; hud(); closeModal(); }
    if (t.closest('[data-sim-close]')) closeModal();
    if (t.closest('[data-sim-restart]')) location.reload();
    if (t.closest('[data-sim-info]')) openPane();
    if (t.closest('[data-sim-pane-close]')) closePane();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePane(); closeModal(); }
  });

  const finish = () => {
    const b = bilan(state);
    const gaugesHtml = b.gauges
      .map(
        (g) => `<div class="sim-gauge">
          <div class="sim-gauge__top"><span>${g.label}</span><b>${g.value}</b></div>
          <div class="sim-gauge__bar"><span style="width:${g.value}%"></span></div>
          <div class="sim-gauge__note">${g.quality}</div>
        </div>`,
      )
      .join('');
    modal(
      `Bilan · ${state.maxYears} étés`, 'Fin de mandat',
      `<p class="muted">Pas de note unique : ces quatre jauges ne se maximisent pas ensemble. Le grand feu est arrivé quoi qu'on fasse (${b.burnedPct}% de la carte parcourue sur la partie) ; brûler n'est pas perdre. Ce qui se juge, c'est ce qu'il en reste, axe par axe.</p>
      <div class="sim-gauges">${gaugesHtml}</div>
      <button data-sim-restart>Rejouer</button>`,
    );
  };

  const intro = () => {
    modal(
      'Tenir le versant', 'Diois · après le feu',
      `<p>Un feu vient de parcourir le versant. Chaque année, vous agissez sur le paysage et sur le bâti, puis vient l'été. Le grand feu reviendra : la question n'est pas de l'empêcher, mais de ce qu'il en restera.</p>
      <ul>
        <li><b>Au contact du bâti</b>, on durcit : les maisons brûlent surtout par les braises, que seule la zone 0 arrête. Les secours ne tiennent le front que si l'apron est traité et la pente douce.</li>
        <li><b>À l'échelle du paysage</b>, on entretient : éclaircie, troupeaux, brûlage dirigé, mosaïque de feuillus.</li>
        <li><b>Sans rien faire, le paysage se ferme</b> : la densité monte seule et la sévérité grimpe. Et le pin noir, lui, ne repousse pas après un feu de cime.</li>
      </ul>
      <p class="muted">Éteindre chaque départ paraît prudent, mais prive le paysage des petits feux qui l'entretiennent. À vous de voir combien de temps cela tient.</p>
      <div class="sim-modes">
        <button data-sim-close>Partie longue · ${HORIZON.long} étés</button>
        <button class="ghost" data-sim-short>Une décennie · ${HORIZON.short} étés</button>
      </div>`,
    );
  };

  // ---- boot ----
  resizeCanvas(cv, ctx);
  generate(state, rng);
  buildTools();
  buildPolicies();
  buildDoctrine();
  buildDash();
  snapshotDash();
  hud();
  render();
  intro();
  say("Année 1 : le versant sort d'un incendie. À vous de décider ce qui repousse.");
  window.addEventListener('resize', () => { resizeCanvas(cv, ctx); render(); });
}
