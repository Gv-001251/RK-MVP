/** Verifies the Afinion de-framer against the real capture. Temporary. */
import fs from 'node:fs';
import { extractFrames, parseFrame } from './tools/afinion-bridge.mjs';

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✓ ${label}`); }
  else { fail += 1; console.log(`  ✗ ${label} ${extra}`); }
};

const DLE = 0x10, STX = 0x02, ETX = 0x03;
const wrap = (s) => Buffer.concat([Buffer.from([DLE, STX]), Buffer.from(s, 'latin1'), Buffer.from([DLE, ETX])]);

// ── 1. The real capture ──
console.log('1. real captured bytes from the instrument');
const dir = 'tmp/analyzer-dial';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.bin'));
const buf = Buffer.concat(files.map((f) => fs.readFileSync(`${dir}/${f}`)));
const { frames, rest } = extractFrames(buf);
console.log(`     ${buf.length} bytes -> ${frames.length} frames, ${rest.length} byte(s) left buffered`);

const parsed = frames.map(parseFrame);
ok('every frame parsed', parsed.every((p) => p.ok), `${parsed.filter((p) => !p.ok).length} failed`);
ok('all are the IC heartbeat class', parsed.every((p) => p.cls === 'IC'));
ok('device id consistent', new Set(parsed.map((p) => p.device)).size === 1, JSON.stringify([...new Set(parsed.map((p) => p.device))]));
ok('address is the broadcast FFFF', parsed.every((p) => p.address === 'FFFF'));

const seqs = parsed.map((p) => p.sequence);
const steps = new Set();
for (let i = 1; i < seqs.length; i += 1) steps.add(seqs[i] - seqs[i - 1]);
ok('sequence contiguous, +1 each', steps.size === 1 && steps.has(1), `steps: ${[...steps]}`);
ok('timestamps parsed to ISO', parsed.every((p) => p.observedAt !== null), parsed.find((p) => !p.observedAt)?.text);
console.log(`     seq ${parsed[0].sequenceHex} -> ${parsed[parsed.length - 1].sequenceHex}, device ${parsed[0].device}`);

// ── 2. DLE stuffing: a literal 0x10 in the payload arrives doubled ──
console.log('\n2. DLE-stuffed payload (a literal 0x10 inside the data)');
const stuffed = Buffer.concat([
  Buffer.from([DLE, STX]),
  Buffer.from('0001FFFF:XX@a', 'latin1'),
  Buffer.from([DLE, DLE]),          // an escaped literal DLE
  Buffer.from('b', 'latin1'),
  Buffer.from([DLE, ETX]),
]);
const s = extractFrames(stuffed);
ok('one frame recovered', s.frames.length === 1, String(s.frames.length));
ok('literal 0x10 un-stuffed to a single byte',
  s.frames[0] && s.frames[0].includes(0x10) && s.frames[0].toString('latin1') === '0001FFFF:XX@a\x10b',
  JSON.stringify(s.frames[0]?.toString('latin1')));
ok('a DLE ETX inside stuffed data does not end the frame early',
  s.frames[0]?.toString('latin1').endsWith('b'));

// ── 3. A frame split across two TCP reads ──
console.log('\n3. frame split across two reads (TCP does not respect frame edges)');
const whole = wrap('0002FFFF:IC@20260807,101112,AF20095065,21.16X');
const a = extractFrames(whole.subarray(0, 20));
ok('no frame emitted from the first half', a.frames.length === 0, String(a.frames.length));
ok('partial bytes are kept, not dropped', a.rest.length === 20, String(a.rest.length));
const b = extractFrames(Buffer.concat([a.rest, whole.subarray(20)]));
ok('frame completes once the rest arrives', b.frames.length === 1, String(b.frames.length));
ok('content intact across the split', parseFrame(b.frames[0]).text.endsWith('21.16X'));

// ── 4. Two frames in one read ──
console.log('\n4. two frames in a single read');
const two = extractFrames(Buffer.concat([wrap('0003FFFF:IC@20260807,101113,AF1,1X'), wrap('0004FFFF:IC@20260807,101114,AF1,2X')]));
ok('both recovered', two.frames.length === 2, String(two.frames.length));
ok('in order', two.frames.map((f) => parseFrame(f).sequence).join(',') === '3,4');

// ── 5. Noise between frames is skipped ──
console.log('\n5. junk between frames');
const noisy = extractFrames(Buffer.concat([Buffer.from([0x00, 0xff, 0x41]), wrap('0005FFFF:IC@20260807,101115,AF1,3X')]));
ok('leading junk ignored, frame still found', noisy.frames.length === 1, String(noisy.frames.length));

// ── 6. An unrecognised class is reported, not silently treated as a result ──
console.log('\n6. a non-heartbeat class');
const other = parseFrame(Buffer.from('0006FFFF:RS@20260807,101116,AF20095065,HbA1c,6.4,%', 'latin1'));
ok('parses', other.ok);
ok('class is picked up as RS, not IC', other.cls === 'RS', other.cls);
ok('extra fields preserved for the parser to work with',
  JSON.stringify(other.fields) === '["HbA1c","6.4","%"]', JSON.stringify(other.fields));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
