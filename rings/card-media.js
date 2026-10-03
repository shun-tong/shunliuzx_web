const media = {
  "counts": {
    "things": 270,
    "rules": 72
  },
  "rules": {
    "attribute": {
      "OFTEN MAKES A SOUND": 300,
      "EASY TO DESTROY": 301,
      "SHOULDN’T GET WET": 302,
      "OFTEN HAS SPOTS OR STRIPES": 303,
      "CONTAINS WOOD": 304,
      "HAS ONE OR MORE HOLES": 305,
      "WOULD HURT IF DROPPED ON YOU": 306,
      "SHINY OR REFLECTIVE": 307,
      "USUALLY A SINGLE COLOR": 308,
      "EASY TO CLEAN": 309,
      "COULD BE HELD WITH ONE HAND": 310,
      "WEIGHS MORE THAN A CHAIR": 311,
      "FLAMMABLE": 312,
      "ALIVE": 313,
      "USUALLY ROUND OR CURVED": 314,
      "HAS A POINT OR SPIKE": 315,
      "OFTEN HAS WRITING ON IT": 316,
      "TYPICALLY THE SAME SIZE": 317,
      "HAS A STANDARD SIZE": 318,
      "HAS A STRONG TASTE": 319,
      "FLOATS IN WATER": 320,
      "YOU CAN LOOK THROUGH IT": 321,
      "BIGGER THAN A PERSON": 322,
      "CONTAINS PLASTIC": 323
    },
    "word": {
      "5 OR FEWER LETTERS LONG": 200,
      "HAS AN “O”": 201,
      "HAS 2 OR MORE DIFFERENT VOWELS": 202,
      "HAS A CONSECUTIVE DOUBLE LETTER (E.G. “TT,” “LL,” “EE”)": 203,
      "IS A COMPOUND WORD (E.G. SKYLINE, UNDERGROUND)": 204,
      "HAS AN “R”": 205,
      "HAS 1 OR MORE REPEATED LETTERS (E.G. KEEP, TOTAL)": 206,
      "HAS 2 SYLLABLES": 207,
      "STARTS WITH A VOWEL OR “Y”": 208,
      "ENDS WITH A LETTER FROM “N”–“Z”": 209,
      "HAS 3 OR MORE CONSECUTIVE CONSONANTS (E.G. FLIGHT, PEBBLE)": 210,
      "FIRST LETTER IS REPEATED WITHIN THE WORD (E.G. RURAL, EERIE)": 211,
      "ENDS WITH A CONSONANT OR “Y”": 212,
      "HAS 2 OR MORE CONSECUTIVE VOWELS (NOT INCLUDING “Y”) (E.G. “EE,” “OU,” “AI”)": 213,
      "6–8 LETTERS LONG": 214,
      "HAS 1 SYLLABLE": 215,
      "EXACTLY 5 LETTERS LONG": 216,
      "STARTS WITH A LETTER FROM “A”–“M”": 217,
      "FIRST 2 LETTERS ARE IN ALPHABETICAL ORDER": 218,
      "HAS 1 OR MORE REPEATED VOWELS": 219,
      "ENDS WITH 2 CONSONANTS": 220,
      "HAS EXACTLY 1 VOWEL (NOT INCLUDING “Y”)": 221,
      "4–6 LETTERS LONG": 222,
      "HAS 4 OR FEWER UNIQUE LETTERS": 223
    },
    "context": {
      "MAN-MADE": 400,
      "YOU EXPECT TO FIND IT AT A SCHOOL": 401,
      "YOU EXPECT TO FIND IT IN AN OFFICE": 402,
      "CAN BE DANGEROUS": 403,
      "MOST PEOPLE HAVE IT AT HOME": 404,
      "YOU CAN FIND IT WITHIN AN HOUR FROM HERE": 405,
      "MOSTLY FOUND OUTSIDE": 406,
      "USEFUL": 407,
      "USUALLY ONLY OWNED BY RICH PEOPLE": 408,
      "CAN BE BOUGHT IN A STORE": 409,
      "SINGLE-USE": 410,
      "USUALLY FOUND IN RURAL AREAS": 411,
      "USUALLY FOUND WITH OTHERS NEARBY": 412,
      "EASILY FOUND IF LOST": 413,
      "MOST PEOPLE SEE IT REGULARLY": 414,
      "MOST PEOPLE HAVE TOUCHED IT": 415,
      "USUALLY WORTH MORE THAN $100": 416,
      "SUBJECT OF MYTH OR LEGEND": 417,
      "EXPECTED TO LAST 100+ YEARS": 418,
      "PRE-DATES THE USA (1776)": 419,
      "CAN BE FOUND IN THIS BUILDING": 420,
      "PASSENGERS CAN CARRY IT ON AN AIRPLANE": 421,
      "COULD HELP YOU SURVIVE IN THE WILDERNESS": 422,
      "MAKES PEOPLE HAPPY": 423
    }
  },
  "sheets": {
    "2": 24,
    "3": 24,
    "4": 24,
    "5": 20,
    "6": 47,
    "7": 14,
    "8": 9,
    "9": 46,
    "10": 48,
    "11": 11,
    "12": 23,
    "13": 20,
    "14": 32
  }
};
export function facePath(id) {
  if (!Number.isInteger(id)) return null;
  const sheet = Math.floor(id / 100), slot = id % 100;
  return media.sheets[sheet] && slot < media.sheets[sheet] ? `/rings/card-faces/${id}.webp` : null;
}
export function cardFace(card) {
  const match = /^workshop-(\d+)$/.exec(card?.id || '');
  const id = card?.sourceCardId ?? (match ? Number(match[1]) : null);
  return id >= 500 ? facePath(id) : null;
}
export function ruleFace(rule, category) {
  return facePath(media.rules[category]?.[rule?.en]);
}
