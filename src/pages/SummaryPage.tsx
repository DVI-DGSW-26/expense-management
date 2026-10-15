import { useState } from 'react';
import { Link } from 'react-router-dom';
import { summaryApi } from '../api/endpoints';
import type { SummaryMonth } from '../api/types';
import { Amount, LoadState, YearStepper, useAsync } from '../components/ui';
import { money, moneyShort, thisYear } from '../lib/format';

// 쌓는 순서(아래→위)와 색. 색은 styles.css 의 --series-* 토큰.
const SERIES = [
  { key: 'lease', label: '임차관리비', color: 'var(--series-lease)' },
  { key: 'subscription', label: '구독 결제', color: 'var(--series-sub)' },
  { key: 'manual', label: '직접 등록 경비', color: 'var(--series-manual)' },
] as const;

export function SummaryPage() {
  const [year, setYear] = useState(thisYear());
  const summary = useAsync(() => summaryApi.get(year), [year]);
  const s = summary.data;

  return (
    <>
      <header className="page-head">
        <h1>연간 집계</h1>
        <YearStepper year={year} onChange={setYear} />
      </header>

      <LoadState loading={summary.loading && !s} error={summary.error} onRetry={summary.reload} />

      {s && (
        <>
          <section className="year-total" aria-label={`${s.year}년 합계`}>
            <p className="year-total-label">{s.year}년 사무실 지출</p>
            <p className="year-total-value num">
              {money(s.yearTotal.total)}
              <span>원</span>
            </p>
            <ul className="legend">
              {SERIES.map((x) => (
                <li key={x.key}>
                  <i style={{ background: x.color }} />
                  {x.label}
                  <span className="num">{money(s.yearTotal[x.key])}</span>
                </li>
              ))}
            </ul>
          </section>

          <MonthChart months={s.months} />

          <div className="summary-grid">
            <section>
              <h2 className="section-title">월별</h2>
              <div className="ledger-wrap">
                <table className="ledger compact">
                  <thead>
                    <tr>
                      <th>월</th>
                      <th className="r">직접 등록</th>
                      <th className="r">구독</th>
                      <th className="r">임차관리비</th>
                      <th className="r">합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.months.map((m) => (
                      <tr key={m.month}>
                        <td>{m.month}월</td>
                        <td className="r"><Amount value={m.manual} /></td>
                        <td className="r"><Amount value={m.subscription} /></td>
                        <td className="r"><Amount value={m.lease} /></td>
                        <td className="r"><Amount value={m.total} strong /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>연간</th>
                      <td className="r"><Amount value={s.yearTotal.manual} /></td>
                      <td className="r"><Amount value={s.yearTotal.subscription} /></td>
                      <td className="r"><Amount value={s.yearTotal.lease} /></td>
                      <td className="r"><Amount value={s.yearTotal.total} strong /></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            <section>
              <h2 className="section-title">차변계정별 경비</h2>
              <p className="section-note">직접 등록 경비와 구독 결제분의 합계입니다. 임차관리비는 계정이 없어 빠집니다.</p>
              {s.byDebitAccount.length === 0 ? (
                <p className="muted">이 해에 등록된 경비가 없습니다.</p>
              ) : (
                <AccountBars rows={s.byDebitAccount} year={s.year} />
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}

function MonthChart({ months }: { months: SummaryMonth[] }) {
  const peak = Math.max(1, ...months.map((m) => Math.max(0, m.manual) + Math.max(0, m.subscription) + Math.max(0, m.lease)));
  const step = niceStep(peak / 4);
  const max = Math.ceil(peak / step) * step;
  const ticks = Array.from({ length: Math.round(max / step) }, (_, i) => (i + 1) * step);
  return (
    <figure className="month-chart">
      <div className="chart-plot" role="img" aria-label="월별 지출 막대 그래프. 같은 내용이 아래 월별 표에 있습니다.">
        <div className="chart-grid" aria-hidden>
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / max) * 100}%` }}>
              {moneyShort(Math.round(t))}
            </span>
          ))}
        </div>
        {months.map((m) => (
          <div className="chart-col" key={m.month} tabIndex={0} aria-label={`${m.month}월 합계 ${money(m.total)}원`}>
            <div className="chart-stack">
              {SERIES.map((x) =>
                m[x.key] > 0 ? (
                  <div key={x.key} className="chart-seg" style={{ height: `${(m[x.key] / max) * 100}%`, background: x.color }} />
                ) : null,
              )}
            </div>
            <div className="chart-tip" role="tooltip">
              <strong>{m.month}월</strong>
              {SERIES.slice()
                .reverse()
                .map((x) => (
                  <span key={x.key}>
                    <i style={{ background: x.color }} />
                    {x.label}
                    <b className="num">{money(m[x.key])}</b>
                  </span>
                ))}
              <span className="tip-total">
                합계<b className="num">{money(m.total)}</b>
              </span>
            </div>
            <span className="chart-label">{m.month}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** 1·2·5 × 10ⁿ 중 x 이상인 가장 작은 값 — 눈금 간격용 */
function niceStep(x: number) {
  const p = 10 ** Math.floor(Math.log10(x));
  return ([1, 2, 5, 10].find((k) => k * p >= x) ?? 10) * p;
}

function AccountBars({ rows, year }: { rows: { debitAccountId: number; debitAccountName: string; count: number; totalAmount: number }[]; year: number }) {
  const sorted = [...rows].sort((a, b) => b.totalAmount - a.totalAmount);
  const max = Math.max(1, ...sorted.map((r) => r.totalAmount));
  return (
    <ul className="account-bars">
      {sorted.map((r) => (
        <li key={r.debitAccountId}>
          <Link to={`/expenses?year=${year}&account=${r.debitAccountId}`} className="account-bar-name">
            {r.debitAccountName}
          </Link>
          <span className="muted num">{r.count}건</span>
          <span className="num strong">{money(r.totalAmount)}</span>
          <div className="account-bar-track" aria-hidden>
            <div style={{ width: `${Math.max(0, (r.totalAmount / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
