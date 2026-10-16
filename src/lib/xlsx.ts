/**
 * 엑셀(.xlsx) 파일에서 시트 하나를 2차원 배열로 읽는다.
 * xlsx 는 zip 안의 XML 이므로 브라우저 기본 기능(DecompressionStream, DOMParser)만으로 읽는다.
 * 숫자 칸은 number, 글자 칸은 string 으로 돌려준다 (날짜 칸은 엑셀 일련번호 number).
 */
export type Cell = string | number | null;

interface ZipEntry {
  method: number;
  compressedSize: number;
  localOffset: number;
}

function readZipDirectory(buf: ArrayBuffer): Map<string, ZipEntry> {
  const view = new DataView(buf);
  // 끝에서부터 중앙 디렉터리 끝 표시(0x06054b50)를 찾는다
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('엑셀(.xlsx) 파일이 아니거나 손상된 파일입니다.');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(buf, p + 46, nameLen));
    entries.set(name, { method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readZipText(buf: ArrayBuffer, entries: Map<string, ZipEntry>, name: string): Promise<string | null> {
  const e = entries.get(name);
  if (!e) return null;
  const view = new DataView(buf);
  const start = e.localOffset + 30 + view.getUint16(e.localOffset + 26, true) + view.getUint16(e.localOffset + 28, true);
  const data = new Uint8Array(buf, start, e.compressedSize);
  if (e.method === 0) return new TextDecoder().decode(data);
  if (e.method !== 8) throw new Error('지원하지 않는 압축 방식의 엑셀 파일입니다.');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

const parseXml = (text: string) => new DOMParser().parseFromString(text, 'application/xml');

/** "AB12" → 27 (0부터) */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export interface Sheet {
  name: string;
  rows: Cell[][];
}

/** 시트 이름 목록과 각 시트의 내용을 읽는다 */
export async function readXlsx(file: File): Promise<Sheet[]> {
  const buf = await file.arrayBuffer();
  const entries = readZipDirectory(buf);

  const sharedXml = await readZipText(buf, entries, 'xl/sharedStrings.xml');
  const shared = sharedXml
    ? [...parseXml(sharedXml).getElementsByTagName('si')].map((si) =>
        [...si.getElementsByTagName('t')].map((t) => t.textContent ?? '').join(''),
      )
    : [];

  const workbook = parseXml((await readZipText(buf, entries, 'xl/workbook.xml')) ?? '');
  const rels = parseXml((await readZipText(buf, entries, 'xl/_rels/workbook.xml.rels')) ?? '');
  const targets = new Map(
    [...rels.getElementsByTagName('Relationship')].map((r) => [r.getAttribute('Id'), r.getAttribute('Target') ?? '']),
  );

  const sheets: Sheet[] = [];
  for (const s of workbook.getElementsByTagName('sheet')) {
    const rid = s.getAttribute('r:id') ?? s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const target = targets.get(rid) ?? '';
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const xml = await readZipText(buf, entries, path);
    if (!xml) continue;
    const rows: Cell[][] = [];
    for (const row of parseXml(xml).getElementsByTagName('row')) {
      const r = Number(row.getAttribute('r')) - 1;
      const cells: Cell[] = [];
      for (const c of row.getElementsByTagName('c')) {
        const type = c.getAttribute('t');
        const v = c.getElementsByTagName('v')[0]?.textContent ?? null;
        let value: Cell = null;
        if (type === 's') value = v === null ? null : shared[Number(v)] ?? null;
        else if (type === 'inlineStr') value = [...c.getElementsByTagName('t')].map((t) => t.textContent ?? '').join('');
        else if (type === 'str' || type === 'e') value = v;
        else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
        else value = v === null || v === '' ? null : Number(v);
        cells[columnIndex(c.getAttribute('r') ?? 'A1')] = value;
      }
      rows[r] = Array.from(cells, (x) => x ?? null);
    }
    sheets.push({ name: s.getAttribute('name') ?? '', rows: Array.from(rows, (x) => x ?? []) });
  }
  return sheets;
}
