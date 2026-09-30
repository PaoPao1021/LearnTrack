import { useEffect, useState } from 'react';

/** Keep decorative loops idle when their surface is offscreen or the tab is hidden. */
export function useVisibleMotion<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  useEffect(() => {
    if (!element) return;
    let visible = false;
    const update = () => { element.dataset.motionPaused = String(!visible || document.hidden); };
    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      update();
    });
    update();
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      delete element.dataset.motionPaused;
    };
  }, [element]);
  return setElement;
}

/** One light follows the current pointer, without a React render on each move. */
export function useCardLight() {
  useEffect(() => {
    const preference = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    let frame = 0;
    let active: HTMLElement | null = null;
    let latest: PointerEvent | null = null;
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      active?.removeAttribute('data-light-active');
      active = null;
      latest = null;
    };
    const move = (event: PointerEvent) => {
      if (!preference.matches || event.pointerType !== 'mouse') return;
      latest = event;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!latest || document.hidden) return;
        const card = latest.target instanceof Element ? latest.target.closest<HTMLElement>('.card, .work-section') : null;
        if (active !== card) active?.removeAttribute('data-light-active');
        active = card;
        if (!card) return;
        const bounds = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', `${latest.clientX - bounds.left}px`);
        card.style.setProperty('--mouse-y', `${latest.clientY - bounds.top}px`);
        card.dataset.lightActive = 'true';
      });
    };
    document.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', reset);
    document.addEventListener('scroll', reset, { passive: true, capture: true });
    document.addEventListener('visibilitychange', reset);
    window.addEventListener('blur', reset);
    preference.addEventListener('change', reset);
    return () => {
      reset();
      document.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', reset);
      document.removeEventListener('scroll', reset, true);
      document.removeEventListener('visibilitychange', reset);
      window.removeEventListener('blur', reset);
      preference.removeEventListener('change', reset);
    };
  }, []);
}
