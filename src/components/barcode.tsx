const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

const START = "101";
const MIDDLE = "01010";
const QUIET = 9;
const BAR_HEIGHT = 56;
const GUARD_HEIGHT = 64;

function encodeEan13(digits: string): string {
  const d = digits.split("").map(Number);
  const parity = PARITY[d[0]];
  const left = d.slice(1, 7).map((n, i) => (parity[i] === "L" ? L[n] : G[n])).join("");
  const right = d.slice(7).map((n) => R[n]).join("");
  return START + left + MIDDLE + right + START;
}

/** UPC-A and EAN-13 barcode as inline SVG. UPC-A is EAN-13 with a leading zero. */
export function Barcode({ value, className }: { value: string; className?: string }) {
  const code = value.length === 12 ? `0${value}` : value;
  if (!/^\d{13}$/.test(code)) return <p className="font-mono text-sm">{value}</p>;

  const modules = encodeEan13(code);
  const width = modules.length + QUIET * 2;
  const guards = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  const bars: React.ReactNode[] = [];
  let run = 0;
  for (let i = 0; i <= modules.length; i++) {
    if (modules[i] === "1") {
      run++;
      continue;
    }
    if (run > 0) {
      const start = i - run;
      const tall = [...Array(run).keys()].some((k) => guards.has(start + k));
      bars.push(<rect key={start} x={QUIET + start} y={0} width={run} height={tall ? GUARD_HEIGHT : BAR_HEIGHT} fill="currentColor" />);
      run = 0;
    }
  }

  const text = (x: number, s: string) => (
    <text x={x} y={GUARD_HEIGHT + 12} fontSize="10" fontFamily="monospace" textAnchor="middle" fill="currentColor">
      {s}
    </text>
  );
  return (
    <svg viewBox={`0 0 ${width} ${GUARD_HEIGHT + 16}`} className={className} role="img" aria-label={`Barcode ${value}`}>
      {bars}
      {text(QUIET - 5, code[0])}
      {text(QUIET + 24, code.slice(1, 7))}
      {text(QUIET + 71, code.slice(7))}
    </svg>
  );
}
