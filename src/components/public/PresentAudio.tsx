'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useT } from '@/i18n/client';
import { shouldChime, volumeGain } from './audioCore';

/** Laufende Klangerzeugung: Kontext, Hauptregler und alle Quellen (zum Stoppen) */
interface Engine {
  ctx: AudioContext;
  master: GainNode;
  sources: AudioScheduledSourceNode[];
}

/**
 * Klangteppich aus Web-Audio-Oszillatoren (keine Tondateien): tiefer Chor-Teppich aus leicht verstimmten
 * Sägezähnen hinter einem Tiefpass mit langsamem LFO, dazu das Summen eines Cogitators (Netzbrummen 50/100 Hz
 * und gefiltertes Rauschen mit langsamer Schwankung).
 */
function startEngine(volume: number): Engine {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  // sanft einblenden
  master.gain.setTargetAtTime(volumeGain(volume), ctx.currentTime, 1.2);
  const sources: AudioScheduledSourceNode[] = [];

  // Chor-Teppich: Grundton, Quinte, Oktave – je zwei leicht verstimmte Stimmen
  const pad = ctx.createBiquadFilter();
  pad.type = 'lowpass';
  pad.frequency.value = 420;
  pad.Q.value = 0.7;
  const padGain = ctx.createGain();
  padGain.gain.value = 0.16;
  pad.connect(padGain).connect(master);
  for (const [f, d] of [
    [55, -6],
    [55, 5],
    [82.4, -4],
    [82.4, 7],
    [110, -8],
    [110, 3],
    [164.8, 0],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = d;
    const g = ctx.createGain();
    g.gain.value = f > 150 ? 0.05 : 0.12;
    o.connect(g).connect(pad);
    o.start();
    sources.push(o);
  }
  // langsames Atmen des Filters (wie ein fernes Chorgewölbe)
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 180;
  lfo.connect(lfoDepth).connect(pad.frequency);
  lfo.start();
  sources.push(lfo);

  // Cogitator: Brummen 50 Hz + Oberton 100 Hz, leise
  const hum = ctx.createGain();
  hum.gain.value = 0.05;
  hum.connect(master);
  for (const [f, g0] of [
    [50, 1],
    [100, 0.45],
    [150, 0.15],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = g0;
    o.connect(g).connect(hum);
    o.start();
    sources.push(o);
  }
  // Rechenwerk: bandgefiltertes Rauschen, dessen Pegel langsam schwankt
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1800;
  band.Q.value = 3;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.012;
  const flutter = ctx.createOscillator();
  flutter.frequency.value = 0.23;
  const flutterDepth = ctx.createGain();
  flutterDepth.gain.value = 0.008;
  flutter.connect(flutterDepth).connect(noiseGain.gain);
  noise.connect(band).connect(noiseGain).connect(master);
  noise.start();
  flutter.start();
  sources.push(noise, flutter);
  return { ctx, master, sources };
}

/** Dezenter Glockenton für eine neue Meldung (zwei Teiltöne, kurz ausklingend) */
function chime(e: Engine) {
  const { ctx, master } = e;
  const t0 = ctx.currentTime + 0.02;
  for (const [f, peak] of [
    [660, 0.22],
    [990, 0.08],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + 1.7);
  }
}

function stopEngine(e: Engine | null) {
  if (!e) return;
  for (const s of e.sources) {
    try {
      s.stop();
    } catch {
      /* bereits gestoppt */
    }
  }
  e.ctx.close().catch(() => undefined);
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Ton im Präsentationsmodus (NTH2 4.4): startet erst nach Klick auf „Ton an“ (Autoplay-Regeln der Browser),
 * abschaltbar, mit Lautstärkeregler. Neue Meldungen im Laufband erklingen als leiser Glockenton – nicht bei
 * „reduzierter Bewegung“.
 */
export function PresentAudio({ feedKeys }: { feedKeys: string[] }) {
  const t = useT();
  const id = useId();
  const [on, setOn] = useState(false);
  const [volume, setVolume] = useState(40);
  const engine = useRef<Engine | null>(null);
  const prevKeys = useRef<string[] | null>(null);

  // Aufräumen beim Verlassen
  useEffect(() => () => stopEngine(engine.current), []);

  // Lautstärke nachführen
  useEffect(() => {
    const e = engine.current;
    if (e) e.master.gain.setTargetAtTime(volumeGain(volume), e.ctx.currentTime, 0.15);
  }, [volume]);

  // Ton bei neuer Meldung (nicht beim ersten Stand)
  const sig = feedKeys.join('|');
  useEffect(() => {
    const next = sig ? sig.split('|') : [];
    if (engine.current && shouldChime(prevKeys.current, next, { on, reducedMotion: !!reducedMotion() })) chime(engine.current);
    prevKeys.current = next;
  }, [sig, on]);

  const toggle = () => {
    if (on) {
      stopEngine(engine.current);
      engine.current = null;
      setOn(false);
      return;
    }
    try {
      engine.current = startEngine(volume);
      setOn(true);
    } catch {
      engine.current = null;
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button type="button" className="btn" aria-pressed={on} onClick={toggle} title={t('Klangteppich aus dem Browser, keine Tondateien')}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="inline-block">
          <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
          {on ? <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9" fill="none" stroke="currentColor" strokeWidth="1.4" /> : <path d="M11.5 6l3 4M14.5 6l-3 4" stroke="currentColor" strokeWidth="1.4" />}
        </svg>
        {on ? t('Ton aus') : t('Ton an')}
      </button>
      {on && (
        <label htmlFor={id} className="flex items-center gap-2 text-[15px] text-dim">
          <span className="hidden sm:inline">{t('Lautstärke')}</span>
          <span className="sr-only sm:hidden">{t('Lautstärke')}</span>
          <input id={id} type="range" min={0} max={100} step={5} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="h-11 w-24 accent-[#dda94d] lg:w-32" />
        </label>
      )}
    </div>
  );
}
