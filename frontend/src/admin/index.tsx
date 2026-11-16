// Admin: tamper lab (the live "an attacker edits the database" demo), audit log, users and keys.
import './../customs/lib/tool.css'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../shared/api'
import { Guard, ToolShell } from '../customs/lib/ui'
import { useAsync } from '../customs/lib/useAsync'
import type { QueueRow, VerifyReport } from '../customs/lib/types'

type Action = 'edit_line_price' | 'edit_line_qty' | 'delete_event' | 'swap_events' | 'edit_event_payload'
const ACTIONS: { id: Action; needs: ('line_no' | 'seq' | 'value')[] }[] = [
  { id: 'edit_line_price', needs: ['line_no', 'value'] },
  { id: 'edit_line_qty', needs: ['line_no', 'value'] },
  { id: 'delete_event', needs: ['seq'] },
  { id: 'swap_events', needs: ['seq', 'value'] },
  { id: 'edit_event_payload', needs: ['seq', 'value'] },
]

function TamperLab() {
  const { t } = useTranslation()
  const ships = useAsync(() => api<QueueRow[]>('/customs/queue'), 'tamper-ships')
  const [sid, setSid] = useState('')
  const [action, setAction] = useState<Action>('edit_line_price')
  const [lineNo, setLineNo] = useState('1')
  const [seq, setSeq] = useState('1')
  const [value, setValue] = useState('1')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [report, setReport] = useState<VerifyReport | null>(null)
  const [busy, setBusy] = useState(false)
  const needs = ACTIONS.find((a) => a.id === action)!.needs

  const check = async (id = sid) => {
    if (!id) return
    setReport(await api<VerifyReport>(`/verify/${id}`, { auth: false }))
  }
  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true); setErr(null); setMsg(null)
    try { await fn(); setMsg(okMsg); await check() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const attack = () => run(() => api('/admin/tamper', {
    body: { action, shipment_id: sid, ...(needs.includes('line_no') ? { line_no: Number(lineNo) } : {}), ...(needs.includes('seq') ? { seq: Number(seq) } : {}), ...(needs.includes('value') ? { value: Number(value) } : {}) },
  }), t('admin.tamper.done'))
  const restore = () => run(() => api('/admin/tamper/restore', { body: { shipment_id: sid } }), t('admin.tamper.restored'))

  return (
    <section>
      <h2 className="text-base font-semibold">{t('admin.tamper.title')}</h2>
      <p className="mb-3 text-sm text-muted">{t('admin.tamper.note')}</p>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>{t('admin.tamper.shipment')}<br />
          <select className="field" value={sid} onChange={(e) => { setSid(e.target.value); setReport(null); void check(e.target.value) }}>
            <option value="">—</option>
            {ships.data?.map((s) => <option key={s.id} value={s.id}>{s.ref} · {s.state}</option>)}
          </select>
        </label>
        <label>{t('admin.tamper.action')}<br />
          <select className="field" value={action} onChange={(e) => setAction(e.target.value as Action)}>
            {ACTIONS.map((a) => <option key={a.id} value={a.id}>{t(`admin.tamper.a.${a.id}`)}</option>)}
          </select>
        </label>
        {needs.includes('line_no') && <label>{t('admin.tamper.lineNo')}<br /><input className="field w-20" value={lineNo} onChange={(e) => setLineNo(e.target.value)} /></label>}
        {needs.includes('seq') && <label>{t('admin.tamper.seq')}<br /><input className="field w-20" value={seq} onChange={(e) => setSeq(e.target.value)} /></label>}
        {needs.includes('value') && <label>{t('admin.tamper.value')}<br /><input className="field w-28" value={value} onChange={(e) => setValue(e.target.value)} /></label>}
        <button className="btn btn-bad" disabled={!sid || busy} onClick={() => void attack()}>{t('admin.tamper.run')}</button>
        <button className="btn" disabled={!sid || busy} onClick={() => void restore()}>{t('admin.tamper.restore')}</button>
        <button className="btn" disabled={!sid} onClick={() => void check()}>{t('admin.tamper.verify')}</button>
      </div>
      {err && <p role="alert" className="mt-3 text-sm text-bad">{err}</p>}
      {msg && <p role="status" className="mt-3 text-sm text-muted">{msg}</p>}
      {report && (
        <div data-testid="tamper-result" className={`mt-3 rounded border px-3 py-2 text-sm font-semibold ${report.overall.ok ? 'border-ok bg-ok-soft text-ok' : 'border-bad bg-bad-soft text-bad'}`}>
          {report.overall.message}
          {report.manifest.problems.length > 0 && <ul className="mt-1 font-normal">{report.manifest.problems.map((p) => <li key={p.line_no}>line {p.line_no}: {p.problem}</li>)}</ul>}
        </div>
      )}
    </section>
  )
}

interface AuditRow { id: number; actor_id: string | null; action: string; target: string | null; created_at: string | null }
interface UserRow { id: string; role: string; name: string; phone: string; keys: { id: string; label: string; revoked_at: string | null }[] }

function Users() {
  const { t } = useTranslation()
  const u = useAsync(() => api<UserRow[]>('/admin/users'), 'users')
  const [err, setErr] = useState<string | null>(null)
  const revoke = async (id: string) => {
    setErr(null)
    try { await api(`/admin/keys/${id}/revoke`, { method: 'POST' }); await u.reload() } catch (e) { setErr((e as Error).message) }
  }
  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold">{t('admin.users.title')}</h2>
      {err && <p role="alert" className="text-sm text-bad">{err}</p>}
      <div className="tbl-wrap mt-2"><table className="tbl"><thead><tr><th>{t('admin.users.name')}</th><th>{t('admin.users.role')}</th><th>{t('admin.users.keys')}</th></tr></thead>
        <tbody>{u.data?.map((r) => (
          <tr key={r.id}><td>{r.name}<div className="text-muted">{r.phone}</div></td><td>{r.role}</td>
            <td>{r.keys.length === 0 ? '—' : r.keys.map((k) => (
              <div key={k.id}><span className="mono">{k.id}</span> {k.label} {k.revoked_at ? <span className="text-bad">{t('admin.users.revoked')}</span> : <button className="btn ms-2" onClick={() => void revoke(k.id)}>{t('admin.users.revoke')}</button>}</div>
            ))}</td></tr>
        ))}</tbody></table></div>
    </section>
  )
}

function Audit() {
  const { t } = useTranslation()
  const a = useAsync(() => api<AuditRow[]>('/admin/audit?limit=60'), 'audit')
  return (
    <section className="mt-8">
      <div className="flex items-baseline gap-3"><h2 className="text-base font-semibold">{t('admin.audit.title')}</h2><button className="btn" onClick={() => void a.reload()}>{t('customs.queue.refresh')}</button></div>
      <p className="text-sm text-muted">{t('admin.audit.note')}</p>
      <div className="tbl-wrap mt-2"><table className="tbl"><thead><tr><th>#</th><th>{t('admin.audit.when')}</th><th>{t('admin.audit.action')}</th><th>{t('admin.audit.target')}</th></tr></thead>
        <tbody>{a.data?.map((r) => (<tr key={r.id} className={r.action.startsWith('tamper') ? 'row-bad' : ''}><td className="num">{r.id}</td><td className="mono">{r.created_at?.replace('T', ' ').slice(0, 19)}</td><td>{r.action}</td><td className="mono">{r.target}</td></tr>))}</tbody></table></div>
    </section>
  )
}

export default function AdminApp() {
  return (
    <Guard roles={['admin']}>
      <ToolShell>
        <TamperLab />
        <Users />
        <Audit />
      </ToolShell>
    </Guard>
  )
}
