import { useState } from 'react';

import { useAudit } from '@/api/hooks';
import { Badge, ErrorBox, fmtDateTime, PageHeader, SearchBox, Spinner } from '@/components/ui';

export default function AuditPage() {
  const [q, setQ] = useState('');
  const { data, isLoading, error } = useAudit({ search: q || undefined });
  return (
    <>
      <PageHeader
        title="Audit trail"
        subtitle="Every create, change, submission and decision — who, what and when. Entries are immutable."
      />
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search summary, user or item" />
        {data && <span className="muted small">{data.count} entries (latest 100 shown)</span>}
      </div>
      <ErrorBox error={error} />
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Item</th>
                <th>Process</th>
                <th>What</th>
              </tr>
            </thead>
            <tbody>
              {(data?.results ?? []).map((a) => (
                <tr key={a.id}>
                  <td className="small">{fmtDateTime(a.at)}</td>
                  <td>{a.actor_label}</td>
                  <td>
                    <Badge
                      tone={
                        a.action === 'approve'
                          ? 'ok'
                          : a.action === 'reject'
                            ? 'bad'
                            : a.action === 'delete'
                              ? 'warn'
                              : 'info'
                      }
                    >
                      {a.action}
                    </Badge>
                  </td>
                  <td className="small mono">
                    {a.entity_type} {a.entity_id}
                  </td>
                  <td className="mono">{a.process_code}</td>
                  <td>{a.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
