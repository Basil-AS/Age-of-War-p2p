<script lang="ts">
  import { act, app, getOrig, toggleMenu, tr, unitStats } from '../lib/app.svelte';
  import { AGE_NAMES, SPECIAL_NAMES, TURRET_NAMES, UNIT_NAMES } from '../lib/i18n';

  const h = $derived(app.hud);
  const L = $derived(app.lang);
  let bar: HTMLElement | undefined = $state();
  /** turret slot whose chooser / sell popover is open (0 = none) */
  let pop = $state(0);

  // the world is laid out above this bar: report its height to the renderer
  $effect(() => {
    const el = bar;
    if (!el) return;
    const tell = () => getOrig()?.setInsets(el.offsetHeight);
    const ro = new ResizeObserver(tell);
    ro.observe(el);
    tell();
    return () => {
      ro.disconnect();
      getOrig()?.setInsets(0);
    };
  });

  const SPECIAL_ICON = ['☄️', '🏹', '✨', '✈️', '🛰️'];
  const uname = (id: number) => UNIT_NAMES[L][id - 1] ?? '';
  const tname = (id: number) => TURRET_NAMES[L][id - 1] ?? '';
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const pct = (a: number, b: number) => `${Math.max(0, Math.min(100, (a / Math.max(1, b)) * 100))}%`;
  const hpColor = (a: number, b: number) => (a / Math.max(1, b) > 0.5 ? '#54d261' : a / Math.max(1, b) > 0.25 ? '#ffb23f' : '#e4483b');
  const fmt = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : String(n));

  function onSlot(slot: { spot: number; open: boolean; id: number }) {
    if (!h) return;
    if (!slot.open) {
      if (h.canAddon && h.slots.find((s) => !s.open)?.spot === slot.spot) act({ t: 'addon' });
      return;
    }
    pop = pop === slot.spot ? 0 : slot.spot;
  }
  function build(id: number, spot: number) {
    act({ t: 'turret', id, spot });
    pop = 0;
  }
  function sell(spot: number) {
    act({ t: 'sell', spot });
    pop = 0;
  }
  const refund = (id: number) => Math.round((getOrig()?.assets.data.TU[id] as [string, number, number] | undefined)?.[1] ?? 0) / 2;
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (pop = 0)} />

{#if h}
  <div class="aw-ui hud" data-testid="hud">
    <!-- top: resources · base health · menu -->
    <div class="top">
      <div class="aw-glass res" data-testid="resources">
        <div class="row"><span class="aw-coin"></span><b data-testid="cash">{fmt(h.cash)}</b></div>
        <div class="row xp"><span>⭐</span><b data-testid="xp">{h.xp}</b>
          {#if h.evolveCost !== null}<i class="meter"><u style="width:{pct(h.xp, h.evolveCost)}"></u></i><small>{h.evolveCost}</small>{/if}
        </div>
      </div>

      <div class="bases">
        <div class="hp mine">
          <div class="lbl"><b>{tr('you')}</b><span>{AGE_NAMES[L][h.tech - 1]}</span><em>{h.hp}</em></div>
          <i class="meter big"><u style="width:{pct(h.hp, h.hpMax)};background:{hpColor(h.hp, h.hpMax)}"></u></i>
        </div>
        <div class="vs">VS</div>
        <div class="hp foe">
          <div class="lbl"><em>{h.eHp}</em><span>{AGE_NAMES[L][h.eTech - 1]}</span><b>{tr('enemy')}</b></div>
          <i class="meter big"><u style="width:{pct(h.eHp, h.eHpMax)};background:{hpColor(h.eHp, h.eHpMax)}"></u></i>
        </div>
      </div>

      <div class="aw-glass tools">
        <span class="time" title={tr('time')}>{mmss(h.seconds)}</span>
        <button class="aw-chip pausebtn" data-testid="pause" aria-label={tr('pause')} onclick={toggleMenu}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1.5" fill="currentColor" /><rect x="14" y="4" width="5" height="16" rx="1.5" fill="currentColor" /></svg></button>
      </div>
    </div>

    <!-- bottom: special · evolve · units · turrets -->
    <div class="bar aw-panel" bind:this={bar} data-testid="control-bar">
      <div class="sec left">
        <button class="special {h.specialReady ? 'ready' : ''}" data-testid="special" style="--p:{h.special}" disabled={!h.specialReady} onclick={() => act({ t: 'special' })} title="{SPECIAL_NAMES[L][h.tech - 1]} (Q)">
          <span class="ic">{SPECIAL_ICON[h.tech - 1]}</span>
          <small>{h.specialReady ? tr('ready') : tr('charging')}</small>
        </button>
        <button class="evolve {h.canEvolve ? 'go' : ''}" data-testid="evolve" disabled={!h.canEvolve} onclick={() => act({ t: 'evolve' })} title="{tr('evolve')} (E)">
          {#if h.evolveCost !== null}
            <span class="t">⬆ {tr('evolve')}</span>
            <small>{AGE_NAMES[L][h.tech]}</small>
            <small class="c">{h.xp} / {h.evolveCost} XP</small>
          {:else}
            <span class="t">★ {tr('max')}</span><small>{tr('maxAge')}</small>
          {/if}
        </button>
      </div>

      <div class="sec mid">
        <div class="cards units">
          {#each h.units as u, i}
            {@const st = unitStats(u.id)}
            <button class="card {u.ok ? '' : 'off'}" data-testid="unit-{i + 1}" onclick={() => act({ t: 'tray', id: u.id })} aria-label={uname(u.id)}>
              <span class="key">{u.id === 16 ? 4 : i + 1}</span>
              {#if app.icons[`u${u.id}`]}<img src={app.icons[`u${u.id}`]} alt="" draggable="false" />{:else}<span class="ph">⚔️</span>{/if}
              <span class="cost" class:poor={!u.ok}><i class="aw-coin"></i>{fmt(u.cost)}</span>
              <span class="tip"><b>{uname(u.id)}</b><br />{tr('statHp')} {st[0] ?? '?'} · {tr('statDmg')} {Math.max(st[1] ?? 0, st[2] ?? 0)}<br /><i class="aw-coin"></i> {u.cost}</span>
            </button>
          {/each}
        </div>
        <div class="queue" data-testid="queue" title={tr('queue')}>
          {#each h.tray as t, i}
            <span class="pip {t ? 'full' : ''}">
              {#if t && app.icons[`u${t}`]}<img src={app.icons[`u${t}`]} alt="" />{/if}
              {#if i === 0 && t}<u style="width:{Math.round(h.progress * 100)}%"></u>{/if}
            </span>
          {/each}
        </div>
      </div>

      <div class="sec right">
        <div class="cards slots">
          {#each h.slots as s}
            <div class="slotwrap">
              <button
                class="card slot {s.open ? (s.id ? 'filled' : 'empty') : 'locked'} {!s.open && h.canAddon && h.slots.find((x) => !x.open)?.spot === s.spot ? 'buyable' : ''}"
                data-testid="slot-{s.spot}"
                onclick={() => onSlot(s)}
                aria-label="{tr('turrets')} {s.spot}"
              >
                {#if !s.open}
                  <span class="lock">🔒</span>
                  {#if h.slots.find((x) => !x.open)?.spot === s.spot && h.addonCost !== null}<span class="cost"><i class="aw-coin"></i>{fmt(h.addonCost)}</span>{/if}
                {:else if s.id}
                  {#if app.icons[`t${s.id}`]}<img src={app.icons[`t${s.id}`]} alt="" draggable="false" />{:else}<span class="ph">🏹</span>{/if}
                {:else}
                  <span class="plus">＋</span>
                {/if}
              </button>
              {#if pop === s.spot}
                <div class="pop aw-panel" data-testid="slot-pop">
                  {#if s.id}
                    <div class="who"><b>{tname(s.id)}</b></div>
                    <button class="aw-btn small" data-testid="sell" onclick={() => sell(s.spot)}>{tr('sell')} +{refund(s.id)}</button>
                  {:else}
                    <div class="who">{tr('emptySlot')}</div>
                    {#each h.turrets as t, ti}
                      <button class="opt {t.ok ? '' : 'off'}" data-testid="buy-turret-{ti + 1}" disabled={!t.ok} onclick={() => build(t.id, s.spot)}>
                        {#if app.icons[`t${t.id}`]}<img src={app.icons[`t${t.id}`]} alt="" />{:else}<span>🏹</span>{/if}
                        <span class="nm">{tname(t.id)}</span>
                        <span class="cost"><i class="aw-coin"></i>{fmt(t.cost)}</span>
                        <span class="key">{'ZXC'[ti]}</span>
                      </button>
                    {/each}
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .hud { position: fixed; inset: 0; z-index: 5; pointer-events: none; }
  .hud > * { pointer-events: auto; }
  b, em, small, span { font-style: normal; }
  /* ── top ── */
  .top { position: absolute; left: 0; right: 0; top: 0; display: flex; align-items: flex-start; gap: 10px; padding: max(8px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) 0 max(10px, env(safe-area-inset-left)); pointer-events: none; }
  .top > * { pointer-events: auto; }
  .res { padding: 6px 12px; min-width: 130px; display: flex; flex-direction: column; gap: 2px; font-size: clamp(1rem, 2.4vh, 1.5rem); }
  .res .row { display: flex; align-items: center; gap: 8px; }
  .res b { font-variant-numeric: tabular-nums; font-weight: 900; color: var(--aw-gold); text-shadow: 0 2px 0 #0009; }
  .res .xp b { color: #ff7a5c; font-size: 0.85em; }
  .res small { opacity: 0.7; font-size: 0.6em; }
  .meter { display: block; width: 64px; height: 8px; border-radius: 6px; background: rgb(0 0 0 / 0.45); overflow: hidden; border: 1px solid #0006; }
  .meter u { display: block; height: 100%; background: linear-gradient(180deg, #ffe27a, #ff9c3b); transition: width 0.25s; text-decoration: none; }
  .meter.big { width: 100%; height: 14px; border-radius: 8px; border: 2px solid var(--aw-line); }
  .bases { flex: 1; display: flex; align-items: center; justify-content: center; gap: 10px; min-width: 0; padding-top: 2px; }
  .hp { flex: 1; max-width: 360px; min-width: 0; }
  .hp .lbl { display: flex; align-items: baseline; gap: 8px; font-size: clamp(0.7rem, 1.7vh, 0.95rem); margin-bottom: 2px; color: #fff; text-shadow: 0 2px 0 #000a, 0 0 8px #0008; }
  .hp .lbl em { font-weight: 900; font-variant-numeric: tabular-nums; margin-left: auto; }
  .hp.foe .lbl em { margin-left: 0; margin-right: auto; }
  .hp.foe .lbl { justify-content: flex-end; }
  .hp.foe .meter u { margin-left: auto; }
  .hp .lbl span { opacity: 0.85; font-size: 0.85em; }
  .vs { font-weight: 900; color: var(--aw-gold); text-shadow: 0 2px 0 #000a; font-family: var(--aw-display); }
  .tools { display: flex; align-items: center; gap: 8px; padding: 4px 6px 4px 12px; }
  .tools .time { font-weight: 800; font-variant-numeric: tabular-nums; }
  /* ── bottom bar ── */
  .bar { position: absolute; left: 0; right: 0; bottom: 0; height: var(--aw-bar-h); border-radius: 0; border-left: 0; border-right: 0; border-bottom: 0; padding: 8px max(12px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)); display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: clamp(8px, 2vw, 28px); --card: calc(var(--aw-bar-h) - 58px); }
  .sec { display: flex; align-items: center; gap: clamp(6px, 1vw, 12px); min-width: 0; }
  .sec.mid { flex-direction: column; justify-content: center; gap: 4px; }
  .pausebtn { width: 38px; padding: 0; min-height: 34px; }
  .cards { display: flex; gap: clamp(5px, 0.9vw, 10px); }
  .card { position: relative; width: var(--card); min-width: 52px; height: var(--card); min-height: 52px; max-width: 120px; border-radius: 12px; border: 2px solid var(--aw-line); background: linear-gradient(180deg, #f4e1b4, #d8b877); box-shadow: 0 3px 0 #2a1807, inset 0 2px 0 rgb(255 255 255 / 0.5); display: grid; place-items: center; padding: 0; cursor: pointer; color: var(--aw-ink); transition: transform 0.08s, filter 0.15s; }
  .card:hover:not(.off):not(.locked) { transform: translateY(-3px); filter: brightness(1.06); }
  .card:active:not(.off) { transform: translateY(1px); box-shadow: 0 1px 0 #2a1807; }
  .card.off { filter: grayscale(0.7) brightness(0.7); cursor: not-allowed; }
  .card { overflow: hidden; }
  .card img { position: absolute; left: 50%; top: 9%; transform: translateX(-50%); height: 62%; width: auto; max-width: 88%; object-fit: contain; pointer-events: none; }
  .ph { font-size: 1.6rem; }
  .key { position: absolute; top: 2px; left: 4px; font-size: 10px; font-weight: 900; background: rgb(0 0 0 / 0.55); color: #fff; border-radius: 5px; padding: 0 5px; text-shadow: none; }
  .cost { position: absolute; bottom: 2px; left: 0; right: 0; text-align: center; font-size: clamp(10px, 1.7vh, 13px); font-weight: 900; color: #3b2300; text-shadow: none; display: flex; align-items: center; justify-content: center; gap: 3px; }
  .cost.poor { color: #a02a1f; }
  .cost :global(.aw-coin) { width: 0.95em; height: 0.95em; }
  .tip { position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%) translateY(4px); min-width: 150px; padding: 8px 10px; border-radius: 10px; background: rgb(24 14 4 / 0.95); color: var(--aw-cream); font-size: 12px; font-weight: 700; line-height: 1.35; text-align: center; pointer-events: none; opacity: 0; transition: opacity 0.12s, transform 0.12s; z-index: 30; border: 1px solid rgb(255 220 150 / 0.35); }
  .card:hover .tip { opacity: 1; transform: translateX(-50%); }
  @media (hover: none) { .tip { display: none; } }
  .queue { display: flex; gap: 5px; }
  .pip { position: relative; width: clamp(22px, 3.4vh, 32px); height: clamp(22px, 3.4vh, 32px); border-radius: 8px; border: 2px solid var(--aw-line); background: rgb(0 0 0 / 0.35); overflow: hidden; display: grid; place-items: center; }
  .pip.full { background: rgb(255 243 210 / 0.8); }
  .pip img { width: 90%; height: 90%; object-fit: contain; }
  .pip u { position: absolute; left: 0; bottom: 0; height: 4px; background: var(--aw-green); text-decoration: none; transition: width 0.1s linear; }
  /* special + evolve */
  .special { position: relative; width: calc(var(--aw-bar-h) - 22px); height: calc(var(--aw-bar-h) - 22px); min-width: 60px; min-height: 60px; border-radius: 50%; border: 3px solid var(--aw-line); cursor: pointer; background: conic-gradient(var(--aw-gold) calc(var(--p) * 360deg), rgb(0 0 0 / 0.45) 0); box-shadow: 0 4px 0 #2a1807; display: grid; place-items: center; color: var(--aw-cream); }
  .special::before { content: ''; position: absolute; inset: 6px; border-radius: 50%; background: linear-gradient(180deg, #7a4a21, #3f2610); }
  .special .ic { position: relative; font-size: clamp(1.4rem, 4vh, 2.3rem); filter: drop-shadow(0 2px 0 #000a); }
  .special small { position: absolute; bottom: 4px; z-index: 2; font-size: 9px; font-weight: 900; letter-spacing: 0.06em; text-shadow: 0 1px 0 #000; }
  .special:disabled { cursor: default; }
  .special.ready { animation: ring 1.2s infinite; }
  .special.ready small { color: var(--aw-gold); }
  .evolve { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; min-width: 112px; height: calc(var(--aw-bar-h) - 22px); padding: 4px 12px; border-radius: 12px; border: 2px solid var(--aw-line); background: linear-gradient(180deg, #6d4521, #43290f); color: var(--aw-cream); cursor: pointer; box-shadow: 0 4px 0 #2a1807; font-weight: 800; }
  .evolve .t { font-size: clamp(0.8rem, 2vh, 1.05rem); }
  .evolve small { font-size: 10px; opacity: 0.85; }
  .evolve .c { font-variant-numeric: tabular-nums; }
  .evolve.go { background: linear-gradient(180deg, #ffe27a, var(--aw-gold) 45%, var(--aw-gold-d)); color: var(--aw-ink); animation: ring 1.2s infinite; }
  .evolve:disabled:not(.go) { opacity: 0.8; cursor: default; }
  /* slots */
  .slotwrap { position: relative; }
  .slot { width: calc(var(--card) * 0.9); height: calc(var(--card) * 0.9); min-width: 46px; min-height: 46px; }
  .slot.empty { background: rgb(0 0 0 / 0.25); border-style: dashed; color: var(--aw-cream); }
  .slot.empty .plus { font-size: 1.6rem; opacity: 0.8; }
  .slot.locked { background: rgb(0 0 0 / 0.4); color: var(--aw-cream); cursor: default; }
  .slot.locked .cost { color: var(--aw-gold); }
  .slot.buyable { cursor: pointer; border-color: var(--aw-gold); animation: ring 1.4s infinite; }
  .lock { font-size: 1.2rem; opacity: 0.7; margin-bottom: 8px; }
  .pop { position: absolute; bottom: calc(100% + 12px); right: 0; min-width: 210px; padding: 8px; display: flex; flex-direction: column; gap: 6px; z-index: 40; }
  .pop .who { font-size: 12px; text-align: center; font-weight: 800; }
  .opt { position: relative; display: grid; grid-template-columns: 34px 1fr auto; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 10px; border: 2px solid var(--aw-line); background: linear-gradient(180deg, #f4e1b4, #d8b877); color: var(--aw-ink); font-weight: 800; font-size: 12px; text-align: left; cursor: pointer; }
  .opt img { width: 34px; height: 28px; object-fit: contain; }
  .opt.off { filter: grayscale(0.7) brightness(0.75); cursor: not-allowed; }
  .opt .cost { position: static; color: #3b2300; }
  .opt .key { position: static; }
  @keyframes ring { 0% { box-shadow: 0 4px 0 #2a1807, 0 0 0 0 rgb(255 212 71 / 0.75); } 100% { box-shadow: 0 4px 0 #2a1807, 0 0 0 12px rgb(255 212 71 / 0); } }
  /* ── narrow / short screens ── */
  @media (max-width: 760px) {
    .bar { grid-template-columns: auto 1fr; grid-template-areas: 'l m' 'r r'; row-gap: 4px; }
    .bar { height: auto; padding-top: 6px; }
    .evolve { min-width: 84px; padding: 2px 6px; }
  }
  @media (max-height: 520px) {
    .res { padding: 3px 8px; min-width: 100px; }
    .tools .time { display: none; }
    .hp .lbl span { display: none; }
  }
</style>
