import { useRef, useState } from 'react';
import { attachmentApi } from '../api/endpoints';
import type { Attachment } from '../api/types';
import { bytes } from '../lib/format';
import { useAction } from './ui';

/** 첨부파일 목록 + 내려받기·삭제·추가 */
export function Attachments({
  items,
  onAdd,
  onChange,
}: {
  items: Attachment[];
  onAdd: (files: File[]) => Promise<unknown>;
  onChange: () => void;
}) {
  const run = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const ok = await run(() => onAdd(Array.from(files)), `파일 ${files.length}개를 첨부했습니다.`);
    setBusy(false);
    if (input.current) input.current.value = '';
    if (ok) onChange();
  }

  async function remove(a: Attachment) {
    if (!confirm(`'${a.originalName}' 파일을 삭제할까요?`)) return;
    if (await run(() => attachmentApi.remove(a.id), '파일을 삭제했습니다.')) onChange();
  }

  return (
    <section className="attachments">
      <div className="attachments-head">
        <h3>첨부파일 {items.length > 0 && <span className="count">{items.length}</span>}</h3>
        <button type="button" className="btn btn-small" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? '올리는 중…' : '파일 추가'}
        </button>
        <input ref={input} type="file" multiple hidden onChange={(e) => add(e.target.files)} />
      </div>
      {items.length === 0 ? (
        <p className="muted">세금계산서나 영수증을 첨부해 두면 나중에 찾기 쉽습니다.</p>
      ) : (
        <ul className="file-list">
          {items.map((a) => (
            <li key={a.id}>
              <button type="button" className="link" onClick={() => run(() => attachmentApi.download(a))}>
                {a.originalName}
              </button>
              <span className="muted num">{bytes(a.fileSize)}</span>
              <button type="button" className="icon-btn danger" onClick={() => remove(a)} aria-label={`${a.originalName} 삭제`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 등록 폼에서 올릴 파일을 고르는 입력 */
export function FilePicker({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  return (
    <div className="file-picker">
      <input
        type="file"
        multiple
        onChange={(e) => {
          onChange([...files, ...Array.from(e.target.files ?? [])]);
          e.target.value = '';
        }}
        className="input"
      />
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((f, i) => (
            <li key={i}>
              <span>{f.name}</span>
              <span className="muted num">{bytes(f.size)}</span>
              <button
                type="button"
                className="icon-btn danger"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                aria-label={`${f.name} 빼기`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
