/**
 * Maglumi 800 (Snibe) assay code map.
 *
 * ── Status: partly confirmed against the instrument ─────────────────────────
 * Entries marked ✓ are confirmed present on the site's own analyzer, read from
 * the assay definitions it ships in `Maglumi 800/assay/*.asy` and cross-checked
 * against its calibration history (`Maglumi 800/report/newreport.nii`, a SQLite
 * database behind a .nii extension). Matching calibration timestamps to those
 * files identifies four of them outright: assayid 587 = TSH II, 314 = FT3 II,
 * 315 = FT4 II, 313 = TT4 II.
 *
 * That exercise found a real defect. This instrument's kits are second
 * generation, so its assay names carry a " II" suffix — "TSH II", "25-OH VD II",
 * "Vit B12 II". The table originally held only brochure short names, and as a
 * result EVERY assay on this analyzer failed to resolve. normalise() now drops a
 * trailing generation marker and the real names are listed as aliases.
 *
 * Still unconfirmed: the remaining unmarked entries, which are brochure names for
 * assays this site does not currently run. And three menu items are deliberately
 * left unmapped — BGW, LC-le and LC-ri appear to be optical/system checks rather
 * than patient assays, so they are allowed to pass through under their own labels
 * instead of being given invented clinical names.
 *
 * The encrypted files remain unreadable: SnibeLis/config/fieldlayoutconfig.lis
 * and Maglumi 800/config/*.nii use the vendor's CryptoAPI key (NIICrypt.dll →
 * CryptDeriveKey/CryptDecrypt), so the live test dictionary still cannot be read
 * off disk. Raw messages are kept per result for the same reason.
 *
 * Behaviour is deliberately forgiving: an unmapped code passes through
 * unchanged, and the LIS then appends it as a new result row rather than
 * dropping it. Nothing is lost by a missing entry — it just arrives with the
 * instrument's own label instead of our catalogue name.
 */

/** code → canonical LIS name + unit. `aliases` cover punctuation/naming drift. */
export const MAGLUMI_ASSAYS = [
  /* Thyroid — names marked ✓ are confirmed present on this instrument */
  { code: 'TSH',       catalogName: 'TSH',                    unit: 'µIU/mL', aliases: ['TSH2', 'TSH3', 'TSH II'] },       // ✓ assayid 587
  { code: 'FT3',       catalogName: 'Free T3',                unit: 'pg/mL',  aliases: ['F-T3', 'FREET3', 'FT3 II'] },     // ✓ assayid 314
  { code: 'FT4',       catalogName: 'Free T4',                unit: 'ng/dL',  aliases: ['F-T4', 'FREET4', 'FT4 II'] },     // ✓ assayid 315
  { code: 'T3',        catalogName: 'Total T3',               unit: 'ng/mL',  aliases: ['TT3', 'TT3 II'] },                 // ✓
  { code: 'T4',        catalogName: 'Total T4',               unit: 'µg/dL',  aliases: ['TT4', 'TT4 II'] },                 // ✓ assayid 313
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
  // ✓ present as "T-B HCG II" — total + beta hCG on this instrument
  { code: 'HCG',       catalogName: 'Beta hCG',               unit: 'mIU/mL', aliases: ['B-HCG', 'BHCG', 'β-HCG', 'HCG+B', 'T-B HCG II', 'T-B HCG', 'TBHCG'] },
  { code: 'PRA',       catalogName: 'Plasma Renin Activity',  unit: 'ng/mL/h' },                                            // ✓
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
  { code: '25OHVD',    catalogName: 'Vitamin D (25-OH)',      unit: 'ng/mL',  aliases: ['25-OH-VD', '25OH-VD', 'VITD', 'VD', '25-OH VD II', '25-OH VD'] }, // ✓
  { code: 'PTH',       catalogName: 'Parathyroid Hormone',    unit: 'pg/mL' },
  { code: 'INS',       catalogName: 'Insulin',                unit: 'µIU/mL', aliases: ['INSULIN'] },
  { code: 'CP',        catalogName: 'C-Peptide',              unit: 'ng/mL',  aliases: ['C-P', 'C-PEPTIDE'] },
  { code: 'COR',       catalogName: 'Cortisol',               unit: 'µg/dL',  aliases: ['CORT', 'CORTISOL'] },
  { code: 'ACTH',      catalogName: 'ACTH',                   unit: 'pg/mL' },
  { code: 'GH',        catalogName: 'Growth Hormone',         unit: 'ng/mL' },
  { code: 'OSTEOC',    catalogName: 'Osteocalcin',            unit: 'ng/mL',  aliases: ['OC'] },

  /* Anaemia panel */
  { code: 'FER',       catalogName: 'Ferritin',               unit: 'ng/mL',  aliases: ['FERRITIN'] },
  { code: 'VB12',      catalogName: 'Vitamin B12',            unit: 'pg/mL',  aliases: ['VITB12', 'B12', 'Vit B12 II', 'Vit B12'] }, // ✓
  { code: 'FOL',       catalogName: 'Folate',                 unit: 'ng/mL',  aliases: ['FOLATE', 'FA'] },

  /* Immunoglobulins — this instrument carries serum and urine variants, which
   * are separate results and must not collapse onto one catalogue name. */
  { code: 'IGAS',      catalogName: 'IgA (Serum)',            unit: 'g/L',    aliases: ['IgA(S)', 'IgA-(S)'] },   // ✓
  { code: 'IGAU',      catalogName: 'IgA (Urine)',            unit: 'mg/L',   aliases: ['IgA(U)', 'IgA-(U)'] },   // ✓
  { code: 'IGGS',      catalogName: 'IgG (Serum)',            unit: 'g/L',    aliases: ['IgG(S)', 'IgG-(S)'] },   // ✓
  { code: 'IGGU',      catalogName: 'IgG (Urine)',            unit: 'mg/L',   aliases: ['IgG(U)', 'IgG-(U)'] },   // ✓

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

/**
 * Fold case, punctuation and Greek beta so "β-hCG", "b-hcg" and "BHCG" all match.
 *
 * Also drops a trailing generation marker. This instrument's assay menu is
 * "TSH II", "FT3 II", "25-OH VD II" and so on — Snibe's second-generation kits —
 * and without stripping that suffix every single assay on it failed to resolve,
 * which is exactly what happened before this line existed. Stripping it means a
 * future "III" kit keeps working too, instead of silently falling back to the
 * instrument's own label.
 */
function normalise(token) {
  const folded = String(token)
    .toUpperCase()
    .replace(/Β/g, 'B')      // Greek capital beta
    .replace(/ß/giu, 'B')
    .replace(/[\s_+.\-/()]/g, '');
  // Only strip when something identifiable remains, so a code that IS "II" survives.
  const stripped = folded.replace(/(III|II)$/, '');
  return stripped.length >= 2 ? stripped : folded;
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
