import { WORKSHOP_PACK } from './_rings-workshop.js';

// English spelling (including punctuation and diacritics) follows the card faces.
export const CARDS = WORKSHOP_PACK.cards;
export const RULES = Object.fromEntries(Object.entries(WORKSHOP_PACK.rules).map(([key, list]) => [key, list.map(({ en, zh }) => [en, zh])]));
export const DEFAULT_PACK = WORKSHOP_PACK;

export function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function randomRules() {
  return Object.fromEntries(Object.entries(RULES).map(([key, list]) => {
    const [en, zh] = shuffle(list)[0];
    return [key, { en, zh }];
  }));
}
