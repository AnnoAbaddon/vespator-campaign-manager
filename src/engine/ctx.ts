import type { CampaignState, DiceKind } from './types';

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

/** Wird geworfen, wenn im manuellen Würfelmodus ein weiterer Wurf gebraucht wird. */
export class DiceNeeded extends Error {
  constructor(
    public kind: 'D3' | 'D6',
    public context: string,
    public index: number,
  ) {
    super(`Wurf benötigt: ${kind} – ${context}`);
    this.name = 'DiceNeeded';
  }
}

export interface DiceSource {
  mode: 'DIGITAL' | 'MANUAL';
  /** manuelle Werte (Rohwürfe) in Reihenfolge */
  manual: number[];
  random: (sides: number) => number;
}

export interface Ctx {
  state: CampaignState;
  now: string;
  dice: DiceSource;
  diceUsed: number;
  warnings: string[];
  /** Nicht blockierende Hinweise: regelkonforme Folgen, die niemand bestätigen muss (stehen auch im Log) */
  hints: string[];
  /** Rückfragen ohne Override-Charakter: der Regelfall wird bestätigt (z. B. Standard-Operation, ungespielt → Angreifer siegt) */
  soft: string[];
  log: string[];
  idSeq: number;
  newId: (prefix: string) => string;
}

export function makeCtx(state: CampaignState, dice: DiceSource, now = new Date().toISOString(), idGen?: (p: string) => string): Ctx {
  const ctx: Ctx = {
    state,
    now,
    dice,
    diceUsed: 0,
    warnings: [],
    hints: [],
    soft: [],
    log: [],
    idSeq: 0,
    newId: (prefix: string) => {
      if (idGen) return idGen(prefix);
      ctx.idSeq++;
      return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${ctx.idSeq}`;
    },
  };
  return ctx;
}

export function warn(ctx: Ctx, msg: string) {
  if (!ctx.warnings.includes(msg)) ctx.warnings.push(msg);
}

/**
 * Rückfrage zum Regelfall: muss bestätigt werden, ist aber kein Override (keine Begründung, keine ⚠-Markierung).
 */
export function confirmRule(ctx: Ctx, msg: string) {
  warn(ctx, msg);
  if (!ctx.soft.includes(msg)) ctx.soft.push(msg);
}

/** Enthält die Rückfrage echte Warnungen (Override mit Begründung) oder nur Bestätigungen des Regelfalls? */
export function overridesWarnings(ctx: Pick<Ctx, 'warnings' | 'soft'>): boolean {
  return ctx.warnings.some((w) => !ctx.soft.includes(w));
}

/**
 * Hinweis statt Warnung: Die Regeln erlauben die Aktion, die Folge wird nur festgehalten (Log „Hinweis: …“).
 * Blockiert weder Spieler noch Spielleiter.
 */
export function hint(ctx: Ctx, msg: string) {
  if (ctx.hints.includes(msg)) return;
  ctx.hints.push(msg);
  ctx.log.push(`Hinweis: ${msg}`);
}

export function log(ctx: Ctx, msg: string) {
  ctx.log.push(msg);
}

export function fail(msg: string): never {
  throw new RuleError(msg);
}

function rawDie(ctx: Ctx, sides: 3 | 6, context: string): { value: number; mode: 'DIGITAL' | 'MANUAL' } {
  const idx = ctx.diceUsed;
  if (idx < ctx.dice.manual.length) {
    const v = ctx.dice.manual[idx];
    ctx.diceUsed++;
    if (!Number.isInteger(v) || v < 1 || v > sides) fail(`Ungültiger Würfelwert ${v} für W${sides} (${context})`);
    return { value: v, mode: 'MANUAL' };
  }
  if (ctx.dice.mode === 'MANUAL') throw new DiceNeeded(sides === 3 ? 'D3' : 'D6', context, idx);
  ctx.diceUsed++;
  return { value: ctx.dice.random(sides), mode: 'DIGITAL' };
}

/** Würfelt W3/W6 (+Modifikator), protokolliert den Wurf und gibt das Endergebnis zurück. */
export function roll(ctx: Ctx, kind: 'D3' | 'D6', context: string, modifier = 0, isPublic = true): number {
  const r = rawDie(ctx, kind === 'D3' ? 3 : 6, context);
  const final = r.value + modifier;
  ctx.state.dice.push({
    id: ctx.newId('dice'),
    at: ctx.now,
    context,
    kind,
    modifier,
    results: [r.value],
    final,
    mode: r.mode,
    // Setup-Würfe (Konflikte) verraten verdeckte Wahlen und bleiben privat
    public: isPublic && ctx.state.stage.kind !== 'SETUP',
    phaseNumber: ctx.state.stage.kind === 'PHASE' ? ctx.state.stage.phase : null,
  });
  return final;
}

export function rollD33(ctx: Ctx, context: string): number {
  const a = rawDie(ctx, 3, `${context} (Zehner)`);
  const b = rawDie(ctx, 3, `${context} (Einer)`);
  const final = a.value * 10 + b.value;
  ctx.state.dice.push({
    id: ctx.newId('dice'),
    at: ctx.now,
    context,
    kind: 'D33' as DiceKind,
    modifier: 0,
    results: [a.value, b.value],
    final,
    mode: a.mode === 'MANUAL' || b.mode === 'MANUAL' ? 'MANUAL' : 'DIGITAL',
    public: true,
    phaseNumber: ctx.state.stage.kind === 'PHASE' ? ctx.state.stage.phase : null,
  });
  return final;
}

/** Roll-off: sortiert gleichrangige Parteien per W6 (wiederholt bei Gleichstand). */
export function rollOff(ctx: Ctx, ids: string[], context: string, label: (id: string) => string, depth = 0): string[] {
  if (ids.length <= 1) return [...ids];
  // Schutz gegen endlose Gleichstände (z. B. manipulierte Würfel): Reihenfolge beibehalten
  if (depth >= 12) return [...ids];
  const scores = ids.map((id) => ({ id, v: roll(ctx, 'D6', `Roll-off ${context}: ${label(id)}`) }));
  scores.sort((a, b) => b.v - a.v);
  const result: string[] = [];
  let i = 0;
  while (i < scores.length) {
    let j = i;
    while (j + 1 < scores.length && scores[j + 1].v === scores[i].v) j++;
    const group = scores.slice(i, j + 1).map((s) => s.id);
    result.push(...(group.length > 1 ? rollOff(ctx, group, context, label, depth + 1) : group));
    i = j + 1;
  }
  return result;
}

/** Sortiert absteigend nach Wert, Gleichstände per Roll-off. */
export function orderByValue(ctx: Ctx, ids: string[], value: (id: string) => number, context: string, label: (id: string) => string): string[] {
  const sorted = [...ids].sort((a, b) => value(b) - value(a));
  const out: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && value(sorted[j + 1]) === value(sorted[i])) j++;
    const group = sorted.slice(i, j + 1);
    out.push(...(group.length > 1 ? rollOff(ctx, group, context, label) : group));
    i = j + 1;
  }
  return out;
}

/** Zufällige Auswahl von k aus n Elementen per W6-Losverfahren (dokumentiert). */
export function randomPick<T>(ctx: Ctx, items: T[], k: number, context: string, label: (t: T) => string): T[] {
  if (k >= items.length) return [...items];
  const ids = items.map((_, i) => String(i));
  const order = rollOff(ctx, ids, context, (id) => label(items[Number(id)]));
  return order.slice(0, k).map((id) => items[Number(id)]);
}
