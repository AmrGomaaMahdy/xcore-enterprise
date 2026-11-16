import { useState } from 'react';
import { Check, Undo2, X } from 'lucide-react';

import { api } from '@/api/client';
import { useAction, useApprovals } from '@/api/hooks';
import type { ApprovalRequest } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Empty, ErrorBox, fmtDateTime, Modal, PageHeader, Spinner, Tabs } from '@/components/ui';

const ENTITY: Record<ApprovalRequest['entity_type'], string> = {
  process_version: 'Process model',
  kpi_target: 'KPI target',
  service: 'Catalog service',
};

export default function ApprovalsPage() {
  const [tab, setTab] = useState<'pending' | 'decided'>('pending');
  const { data, isLoading, error } = useApprovals(tab === 'pending' ? { status: 'pending' } : undefined);
  const { user } = useAuth();
  const [decide, setDecide] = useState<{ req: ApprovalRequest; approve: boolean } | null>(null);
  const withdraw = useAction(
    (id: number) => api.post(`/governance/approvals/${id}/withdraw/`, {}),
    [['approvals'], ['versions'], ['targets'], ['services']],
  );
  const rows = (data ?? []).filter((r) => (tab === 'pending' ? r.status === 'pending' : r.status !== 'pending'));

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="Maker-checker governance for process model versions, KPI targets and catalog services. The person who submits can never approve the same request."
      />
      <Tabs
        tabs={[
          { id: 'pending', label: 'Waiting for decision' },
          { id: 'decided', label: 'Decided' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {!user?.can_approve && tab === 'pending' && (
        <div className="alert alert--info small">
          Your role can follow requests; deciding requires the Approver role.
        </div>
      )}
      <ErrorBox error={error ?? withdraw.error} />
      {isLoading ? (
        <Spinner />
      ) : !rows.length ? (
        <Empty>Nothing here.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Request</th>
                <th>Type</th>
                <th>Process</th>
                <th>Submitted</th>
                <th>{tab === 'pending' ? 'Decision' : 'Outcome'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.title}</strong>
                    {r.summary && <div className="small muted">{r.summary}</div>}
                    {r.submit_comment && <div className="small">“{r.submit_comment}”</div>}
                  </td>
                  <td>
                    <Badge tone="info">{ENTITY[r.entity_type]}</Badge>
                    <div className="small mono">{r.entity_label}</div>
                  </td>
                  <td className="mono">{r.process_code}</td>
                  <td className="small">
                    {r.submitted_label}
                    <div className="muted">{fmtDateTime(r.submitted_at)}</div>
                  </td>
                  <td>
                    {r.status === 'pending' ? (
                      <div className="toolbar" style={{ margin: 0 }}>
                        <button
                          className="btn btn--ok btn--sm"
                          disabled={!r.can_decide}
                          onClick={() => setDecide({ req: r, approve: true })}
                          title={r.can_decide ? '' : 'Approver role required, and not your own request'}
                        >
                          <Check size={13} /> Approve
                        </button>
                        <button
                          className="btn btn--bad btn--sm"
                          disabled={!r.can_decide}
                          onClick={() => setDecide({ req: r, approve: false })}
                        >
                          <X size={13} /> Reject
                        </button>
                        {r.submitted_label === (user?.display_name || user?.username) && (
                          <button className="btn btn--ghost btn--sm" onClick={() => withdraw.mutate(r.id)}>
                            <Undo2 size={13} /> Withdraw
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <Badge>{r.status}</Badge>
                        <div className="small muted">
                          {r.decided_label} · {fmtDateTime(r.decided_at)}
                        </div>
                        {r.decision_comment && <div className="small">“{r.decision_comment}”</div>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {decide && <DecisionModal {...decide} onClose={() => setDecide(null)} />}
    </>
  );
}

function DecisionModal({ req, approve, onClose }: { req: ApprovalRequest; approve: boolean; onClose: () => void }) {
  const [comment, setComment] = useState('');
  const act = useAction(
    () => api.post(`/governance/approvals/${req.id}/${approve ? 'approve' : 'reject'}/`, { comment }),
    [['approvals'], ['versions'], ['version'], ['targets'], ['services'], ['activities'], ['node'], ['overview']],
  );
  return (
    <Modal
      title={`${approve ? 'Approve' : 'Reject'} · ${req.title}`}
      onClose={onClose}
      footer={
        <button
          className={approve ? 'btn btn--ok' : 'btn btn--bad'}
          disabled={act.isPending || (!approve && !comment.trim())}
          onClick={() => act.mutate(undefined, { onSuccess: onClose })}
        >
          Confirm {approve ? 'approval' : 'rejection'}
        </button>
      }
    >
      <ErrorBox error={act.error} />
      {approve && req.entity_type === 'process_version' && (
        <div className="alert alert--info small">
          Approving retires the current approved version of the same kind; for To-Be models the L4 activities are
          re-synced.
        </div>
      )}
      <label className="field">
        <span>{approve ? 'Comment (optional)' : 'Reason (required)'}</span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
      </label>
    </Modal>
  );
}
