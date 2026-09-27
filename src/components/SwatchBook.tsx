import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { SYSTEMS, getSystem, getVariant } from '../data/palettes';
import type { Swatch } from '../types';

type Props = {
  systemId: string;
  variantId: string;
  onBack: () => void;
};

export function SwatchBook(props: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef(340);
  const dragRef = useRef<{ x: number; y: number; armed: boolean } | null>(null);
  const hideRef = useRef(0);
  const [systemId, setSystemId] = useState(props.systemId);
  const [variantId, setVariantId] = useState(props.variantId);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Swatch | null>(null);
  const [active, setActive] = useState('');
  const [slide, setSlide] = useState(340);
  const [glide, setGlide] = useState(false);
  const system = getSystem(systemId);
  const variant = getVariant(systemId, variantId);
  const needle = query.trim().toLowerCase();
  const colors = useMemo(() => {
    if (!needle) return variant.colors;
    return variant.colors.filter((item) => {
      const code = item.code.toLowerCase();
      if (code === needle) return true;
      return /[a-z]$/.test(needle) && code.startsWith(needle);
    });
  }, [variant.colors, needle]);
  const groups = useMemo(() => {
    const order: string[] = [];
    for (const item of colors) if (!order.includes(item.group)) order.push(item.group);
    return order;
  }, [colors]);

  useEffect(() => {
    setActive(groups[0] ?? '');
  }, [groups]);

  useEffect(() => {
    const index = indexRef.current;
    if (!index || !active) return;
    const key = [...index.querySelectorAll('button')].find((button) => button.textContent === active);
    if (!key) return;
    const edge = 8;
    const start = key.offsetLeft;
    const end = start + key.offsetWidth;
    const viewStart = index.scrollLeft;
    const viewEnd = viewStart + index.clientWidth;
    const prev = key.previousElementSibling as HTMLElement | null;
    const next = key.nextElementSibling as HTMLElement | null;
    if (start < viewStart + edge) {
      const left = prev ? prev.offsetLeft + prev.offsetWidth : Math.max(0, start - 12);
      index.scrollTo({ left, behavior: 'smooth' });
    } else if (end > viewEnd - edge) {
      const rightEdge = next ? next.offsetLeft : end + 12;
      index.scrollTo({ left: Math.max(0, rightEdge - index.clientWidth), behavior: 'smooth' });
    }
  }, [active]);

  useEffect(() => {
    if (!picked) return;
    const frame = requestAnimationFrame(() => {
      setGlide(true);
      slideRef.current = 0;
      setSlide(0);
    });
    return () => cancelAnimationFrame(frame);
  }, [picked]);

  const place = (value: number) => {
    slideRef.current = value;
    setSlide(value);
  };

  const openPick = (item: Swatch) => {
    window.clearTimeout(hideRef.current);
    if (item === picked) return;
    setGlide(false);
    place(340);
    setPicked(item);
  };

  const dismiss = () => {
    setGlide(true);
    place(-360);
    window.clearTimeout(hideRef.current);
    hideRef.current = window.setTimeout(() => setPicked(null), 240);
  };

  const onDockDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY, armed: false };
  };

  const onDockMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.armed) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (dx >= 0 || Math.abs(dy) > Math.abs(dx)) {
        dragRef.current = null;
        return;
      }
      start.armed = true;
      setGlide(false);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    place(Math.min(0, dx));
  };

  const onDockUp = () => {
    const start = dragRef.current;
    dragRef.current = null;
    if (!start?.armed) return;
    if (slideRef.current < -72) dismiss();
    else {
      setGlide(true);
      place(0);
    }
  };

  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    const nodes = [...root.querySelectorAll<HTMLElement>('.swatch-section')];
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const id = hit?.target.getAttribute('data-group');
        if (id) setActive(id);
      },
      { root, rootMargin: '-12% 0px -75% 0px' },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [groups]);

  const chooseSystem = (id: string) => {
    const next = getSystem(id);
    setSystemId(id);
    setVariantId(next.variants[0].id);
    setPicked(null);
    setQuery('');
    bodyRef.current?.scrollTo({ top: 0 });
  };

  const jump = (group: string) => {
    const root = bodyRef.current;
    const node = root?.querySelector<HTMLElement>(`[data-group="${group}"]`);
    if (!root || !node) return;
    const index = root.querySelector<HTMLElement>('.swatch-index');
    const indexH = index?.offsetHeight ?? 0;
    root.scrollTop += node.getBoundingClientRect().top - root.getBoundingClientRect().top - indexH - 8;
    setActive(group);
  };

  return (
    <section className="screen swatch-book">
      <header className="topbar">
        <button className="text-btn" onClick={props.onBack}>
          返回
        </button>
        <strong>色卡</strong>
        <span className="quiet-num">{variant.colors.length} 色</span>
      </header>
      <div className="screen-body swatch-body" ref={bodyRef}>
        <div className="swatch-stick">
          <div className="chip-row scroll">
            {SYSTEMS.map((item) => (
              <button key={item.id} className={systemId === item.id ? 'chip on' : 'chip'} onClick={() => chooseSystem(item.id)}>
                {item.name}
              </button>
            ))}
          </div>
          {system.variants.length > 1 && (
            <div className="chip-row">
              {system.variants.map((item) => (
                <button
                  key={item.id}
                  className={variantId === item.id ? 'chip on' : 'chip'}
                  onClick={() => {
                    setVariantId(item.id);
                    setPicked(null);
                    bodyRef.current?.scrollTo({ top: 0 });
                  }}
                >
                  {item.label.includes('色') ? item.label : `${item.label} 色`}
                </button>
              ))}
            </div>
          )}
          <label className="swatch-search">
            <input value={query} placeholder="搜色号" aria-label="搜色号" onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        {groups.length > 1 && (
          <div className="swatch-index" ref={indexRef} role="tablist" aria-label="跳到色系">
            {groups.map((group) => (
              <button key={group} type="button" className={active === group ? 'on' : ''} onClick={() => jump(group)}>
                {group}
              </button>
            ))}
          </div>
        )}
        {colors.length === 0 ? (
          <p className="hint">没有这个色号</p>
        ) : (
          groups.map((group) => {
            const beads = colors.filter((item) => item.group === group);
            return (
              <section key={group} className="swatch-section" data-group={group}>
                <header>
                  <b>{group}</b>
                  <span>{beads.length} 色</span>
                </header>
                <div className="swatch-beads">
                  {beads.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      className={picked?.code === item.code ? 'swatch-cell on' : 'swatch-cell'}
                      onClick={() => openPick(item)}
                    >
                      <i style={{ background: item.hex }} />
                      <span>{item.code}</span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })
        )}
        {!needle && <div className="swatch-pad" />}
      </div>
      {picked && (
        <div
          className="swatch-dock"
          style={{ transform: `translateX(${slide}px)`, transition: glide ? undefined : 'none' }}
          onPointerDown={onDockDown}
          onPointerMove={onDockMove}
          onPointerUp={onDockUp}
          onPointerCancel={onDockUp}
        >
          <i style={{ background: picked.hex }} />
          <div>
            <strong>{picked.code}</strong>
            <span>{picked.hex.toUpperCase()}</span>
          </div>
          <em>{system.name}</em>
        </div>
      )}
    </section>
  );
}
