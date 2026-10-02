// Computes sprite bounds the way the exporter does (union over all frames, nested), to recover registration points.
export function makeBounds(swf) {
  const cache = new Map();
  const mul = (m, n) => ({ // m applied after n  (point -> n -> m)
    a: m.a * n.a + m.c * n.b, b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d, d: m.b * n.c + m.d * n.d,
    tx: m.a * n.tx + m.c * n.ty + m.tx, ty: m.b * n.tx + m.d * n.ty + m.ty,
  });
  const ID = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  const tr = (r, m) => {
    const xs = [], ys = [];
    for (const [x, y] of [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]]) { xs.push(m.a * x + m.c * y + m.tx); ys.push(m.b * x + m.d * y + m.ty); }
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  const union = (a, b) => !a ? b : !b ? a : { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) };
  function charBounds(id, stack = []) {
    const c = swf.chars[id];
    if (!c) return null;
    if (c.type === 'sprite') return spriteBounds(id, stack);
    if (c.type === 'button') {
      let b = null;
      for (const r of c.records) if (r.states & 1) b = union(b, (() => { const cb = charBounds(r.id, stack); return cb && tr(cb, r.m); })());
      return b;
    }
    return c.bounds || null;
  }
  function spriteBounds(id, stack = []) {
    if (cache.has(id)) return cache.get(id);
    if (stack.includes(id)) return null;
    const s = swf.sprites[id]; let b = null;
    const dl = new Map();
    for (const f of s.frames) {
      for (const d of f.remove) dl.delete(d);
      for (const p of f.place) {
        const cur = dl.get(p.depth) || {};
        const next = { ...cur };
        if (p.id != null) next.id = p.id;
        if (p.m) next.m = p.m;
        dl.set(p.depth, next);
      }
      for (const o of dl.values()) {
        if (o.id == null) continue;
        const cb = charBounds(o.id, [...stack, id]);
        if (cb) b = union(b, tr(cb, o.m || ID));
      }
    }
    cache.set(id, b);
    return b;
  }
  return { spriteBounds, charBounds };
}
