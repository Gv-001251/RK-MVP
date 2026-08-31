/**
 * Maglumi 800 (Snibe) assay code map.
 *
 * ── Status: provisional ─────────────────────────────────────────────────────
 * The codes below are the Snibe assay menu short names. They are NOT read from
 * this instrument's own configuration: SnibeLis/config/fieldlayoutconfig.lis and
 * Maglumi 800/config/*.nii are encrypted with the vendor's CryptoAPI key
 * (NIICrypt.dll → CryptDeriveKey/CryptDecrypt), so the on-site test dictionary
 * cannot be read off disk. Treat this table as a starting point and correct it
 * against the first real capture — `analyzer_id = 'maglumi800'` rows in
 * lab_analyzer_messages keep the raw message for exactly this purpose.
 *
 * Behaviour is deliberately forgiving: an unmapped code passes through
 * unchanged, and the LIS then appends it as a new result row rather than
 * dropping it. Nothing is lost by a missing entry — it just arrives with the
 * instrument's own label instead of our catalogue name.
 */

/** code → canonical LIS name + unit. `aliases` cover punctuation/naming drift. */
export const MAGLUMI_ASSAYS = [
  /* Thyroid */
  { code: 'TSH',       catalogName: 'TSH',                    unit: 'µIU/mL', aliases: ['TSH2', 'TSH3'] },
  { code: 'FT3',       catalogName: 'Free T3',                unit: 'pg/mL',  aliases: ['F-T3', 'FREET3'] },
  { code: 'FT4',       catalogName: 'Free T4',                unit: 'ng/dL',  aliases: ['F-T4', 'FREET4'] },
  { code: 'T3',        catalogName: 'Total T3',               unit: 'ng/mL',  aliases: ['TT3'] },
  { code: 'T4',        catalogName: 'Total T4',               unit: 'µg/dL',  aliases: ['TT4'] },
  { code: 'TG',        catalogName: 'Thyroglobulin',          unit: 'ng/mL' },
  { code: 'TPOAB',     catalogName: 'Anti-TPO',               unit: 'IU/mL',  aliases: ['ANTI-TPO', 'A-TPO'] },
  { code: 'TGAB',      catalogName: 'Anti-Tg',                unit: 'IU/mL',  aliases: ['ANTI-TG', 'A-TG'] },

  /* Reproductive hormones */
  { code: 'LH',        catalogName: 'LH',                     unit: 'mIU/mL' },
  { code: 'FSH',       catalogName: 'FSH',                    unit: 'mIU/mL' },
  { code: 'PRL',       catalogName: 'Prolactin',              unit: 'ng/mL' },
  { code: 'E2',        catalogName: 'Estradiol',              unit: 'pg/mL',  aliases: ['ESTRADIOL'] },
  { code: 'PROG',      catalogName: 'Progesterone',           unit: 'ng/mL',  aliases: ['PRGE', 'P4'] },
  { code: 'TESTO',     catalogName: 'Testosterone',           unit: 'ng/mL',  aliases: ['TESTOSTERONE', 'TSTO'] },
  { code: 'HCG',       catalogName: 'Beta hCG',               unit: 'mIU/mL', aliases: ['B-HCG', 'BHCG', 'β-HCG', 'HCG+B'] },
  { code: 'AMH',       catalogName: 'AMH',                    unit: 'ng/mL' },
  { code: 'SHBG',      catalogName: 'SHBG',                   unit: 'nmol/L' },
  { code: 'DHEAS',     catalogName: 'DHEA-S',                 unit: 'µg/dL',  aliases: ['DHEA-S'] },

  /* Tumour markers */
  { code: 'AFP',       catalogName: 'AFP',                    unit: 'ng/mL' },
  { code: 'CEA',       catalogName: 'CEA',                    unit: 'ng/mL' },
  { code: 'PSA',       catalogName: 'Total PSA',              unit: 'ng/mL',  aliases: ['T-PSA', 'TPSA'] },
  { code: 'FPSA',      catalogName: 'Free PSA',               unit: 'ng/mL',  aliases: ['F-PSA'] },
  { code: 'CA125',     catalogName: 'CA 125',                 unit: 'U/mL',   aliases: ['CA-125'] },
  { code: 'CA153',     catalogName: 'CA 15-3',                unit: 'U/mL',   aliases: ['CA15-3', 'CA-153'] },
  { code: 'CA199',     catalogName: 'CA 19-9',                unit: 'U/mL',   aliases: ['CA19-9', 'CA-199'] },
  { code: 'CA724',     catalogName: 'CA 72-4',                unit: 'U/mL',   aliases: ['CA72-4'] },
  { code: 'NSE',       catalogName: 'NSE',                    unit: 'ng/mL' },
  { code: 'CYFRA211',  catalogName: 'CYFRA 21-1',             unit: 'ng/mL',  aliases: ['CYFRA21-1'] },
  { code: 'HE4',       catalogName: 'HE4',                    unit: 'pmol/L' },
  { code: 'SCC',       catalogName: 'SCC',                    unit: 'ng/mL' },

  /* Cardiac + inflammation */
  { code: 'TNI',       catalogName: 'Troponin I',             unit: 'ng/mL',  aliases: ['TN-I', 'CTNI', 'HSTNI'] },
  { code: 'CKMB',      catalogName: 'CK-MB',                  unit: 'ng/mL',  aliases: ['CK-MB'] },
  { code: 'MYO',       catalogName: 'Myoglobin',              unit: 'ng/mL' },
  { code: 'NTPROBNP',  catalogName: 'NT-proBNP',              unit: 'pg/mL',  aliases: ['NT-PROBNP', 'PROBNP'] },
  { code: 'DDIMER',    catalogName: 'D-Dimer',                unit: 'mg/L',   aliases: ['D-DIMER'] },
  { code: 'PCT',       catalogName: 'Procalcitonin',          unit: 'ng/mL' },
  { code: 'IL6',       catalogName: 'IL-6',                   unit: 'pg/mL',  aliases: ['IL-6'] },

  /* Metabolic, bone, adrenal */
  { code: '25OHVD',    catalogName: 'Vitamin D (25-OH)',      unit: 'ng/mL',  aliases: ['25-OH-VD', '25OH-VD', 'VITD', 'VD'] },
  { code: 'PTH',       catalogName: 'Parathyroid Hormone',    unit: 'pg/mL' },
  { code: 'INS',       catalogName: 'Insulin',                unit: 'µIU/mL', aliases: ['INSULIN'] },
  { code: 'CP',        catalogName: 'C-Peptide',              unit: 'ng/mL',  aliases: ['C-P', 'C-PEPTIDE'] },
  { code: 'COR',       catalogName: 'Cortisol',               unit: 'µg/dL',  aliases: ['CORT', 'CORTISOL'] },
  { code: 'ACTH',      catalogName: 'ACTH',                   unit: 'pg/mL' },
  { code: 'GH',        catalogName: 'Growth Hormone',         unit: 'ng/mL' },
  { code: 'OSTEOC',    catalogName: 'Osteocalcin',            unit: 'ng/mL',  aliases: ['OC'] },

  /* Anaemia panel */
  { code: 'FER',       catalogName: 'Ferritin',               unit: 'ng/mL',  aliases: ['FERRITIN'] },
  { code: 'VB12',      catalogName: 'Vitamin B12',            unit: 'pg/mL',  aliases: ['VITB12', 'B12'] },
  { code: 'FOL',       catalogName: 'Folate',                 unit: 'ng/mL',  aliases: ['FOLATE', 'FA'] },

  /* Infectious disease */
  { code: 'HBSAG',     catalogName: 'HBsAg',                  unit: 'IU/mL',  aliases: ['HBS-AG'] },
  { code: 'ANTIHBS',   catalogName: 'Anti-HBs',               unit: 'mIU/mL', aliases: ['ANTI-HBS', 'HBSAB'] },
  { code: 'HBEAG',     catalogName: 'HBeAg',                  unit: 'PEI U/mL', aliases: ['HBE-AG'] },
  { code: 'ANTIHBE',   catalogName: 'Anti-HBe',               unit: '',       aliases: ['ANTI-HBE', 'HBEAB'] },
  { code: 'ANTIHBC',   catalogName: 'Anti-HBc',               unit: '',       aliases: ['ANTI-HBC', 'HBCAB'] },
  { code: 'ANTIHCV',   catalogName: 'Anti-HCV',               unit: '',       aliases: ['ANTI-HCV', 'HCVAB'] },
  { code: 'HIV',       catalogName: 'HIV Ag/Ab',              unit: '',       aliases: ['HIVAGAB', 'HIV-AB'] },
  { code: 'TP',        catalogName: 'Syphilis (TP Ab)',       unit: '',       aliases: ['TPAB', 'ANTI-TP'] },
];

const BY_TOKEN = new Map();
for (const a of MAGLUMI_ASSAYS) {
  for (const token of [a.code, a.catalogName, ...(a.aliases || [])]) {
    BY_TOKEN.set(normalise(token), a);
  }
}

/** Fold case, punctuation and Greek beta so "β-hCG", "b-hcg" and "BHCG" all match. */
function normalise(token) {
  return String(token)
    .toUpperCase()
    .replace(/Β/g, 'B')      // Greek capital beta
    .replace(/ß/giu, 'B')
    .replace(/[\s_+.\-/()]/g, '');
}

/** Resolve an instrument-reported assay code, or null when we have no entry. */
export function resolveAssay(code) {
  return BY_TOKEN.get(normalise(code)) || null;
}

/**
 * Rewrite parsed results so mapped assays carry our catalogue name, and record
 * what the instrument actually said in `reportedCode` for traceability.
 *
 * Units are only filled in when the analyzer sent none — if it reports a unit we
 * keep it, because the instrument knows its own calibration better than a table
 * written from a product brochure.
 */
export function applyMaglumiAssayMap(tests) {
  return (tests || []).map((t) => {
    const hit = resolveAssay(t.code);
    if (!hit) return { ...t, mapped: false };
    return {
      ...t,
      reportedCode: t.code,
      code: hit.catalogName,
      unit: t.unit || hit.unit || '',
      mapped: true,
    };
  });
}
