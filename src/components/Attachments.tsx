import { useEffect, useRef, useState } from 'react';
import { attachmentApi } from '../api/endpoints';
import type { Attachment } from '../api/types';
import { bytes } from '../lib/format';
import { DownloadIcon } from './icons';
import { useAction } from './ui';

/** 창에서 바로 볼 수 있는 파일: 사진과 PDF */
function previewKind(a: Attachment): 'image' | 'pdf' | null {
  const type = a.contentType?.toLowerCase() ?? '';
  const ext = a.originalName.toLowerCase().split('.').pop() ?? '';
  if (type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  return null;
}

/** 첨부파일 목록 + 미리보기·내려받기·삭제·추가 */
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
  const [viewing, setViewing] = useState<Attachment | null>(null);

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
              {/* 사진·PDF 는 눌러서 바로 보고, 그 밖의 파일은 내려받는다 */}
              <button
                type="button"
                className="link"
                onClick={() => (previewKind(a) ? setViewing(a) : run(() => attachmentApi.download(a)))}
                title={previewKind(a) ? '눌러서 보기' : '눌러서 내려받기'}
              >
                {a.originalName}
              </button>
              <span className="muted num">{bytes(a.fileSize)}</span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => run(() => attachmentApi.download(a))}
                aria-label={`${a.originalName} 내려받기`}
                title="내려받기"
              >
                <DownloadIcon size={18} />
              </button>
              <button type="button" className="icon-btn danger" onClick={() => remove(a)} aria-label={`${a.originalName} 삭제`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {viewing && <FilePreview a={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}

/** 사진·PDF 를 수정 창 위에 띄워 보여 준다 */
function FilePreview({ a, onClose }: { a: Attachment; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const run = useAction();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const kind = previewKind(a);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    let objectUrl: string | null = null;
    let alive = true;
    attachmentApi
      .blob(a)
      .then((b) => {
        // 서버가 형식을 비워 보내도 PDF 뷰어가 열리도록 형식을 붙인다
        const typed = kind === 'pdf' && b.type !== 'application/pdf' ? new Blob([b], { type: 'application/pdf' }) : b;
        objectUrl = URL.createObjectURL(typed);
        if (alive) setUrl(objectUrl);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [a, kind]);

  return (
    <dialog
      ref={ref}
      className="preview"
      // 미리보기는 수정 창 안에 있으므로 Esc·바깥 클릭이 수정 창까지 닫지 않게 막는다
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="preview-head">
        <strong title={a.originalName}>{a.originalName}</strong>
        <button type="button" className="btn btn-small" onClick={() => run(() => attachmentApi.download(a))}>
          <DownloadIcon size={16} />
          내려받기
        </button>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
          ×
        </button>
      </div>
      <div className={`preview-body ${kind ?? ''}`}>
        {error ? (
          <p className="muted">파일을 불러오지 못했습니다. 내려받아서 확인해 주세요.</p>
        ) : !url ? (
          <p className="muted">불러오는 중…</p>
        ) : kind === 'pdf' ? (
          <iframe src={url} title={a.originalName} />
        ) : (
          <img src={url} alt={a.originalName} />
        )}
      </div>
    </dialog>
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
