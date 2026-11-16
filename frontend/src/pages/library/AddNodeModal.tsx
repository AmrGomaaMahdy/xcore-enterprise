import { useState } from 'react';
import { Plus } from 'lucide-react';

import { api } from '@/api/client';
import { useAction } from '@/api/hooks';
import type { ProcessNode, TreeNode } from '@/api/types';
import { ErrorBox, Modal } from '@/components/ui';

import { LEVEL_META } from './ProcessTree';

/** Create a child node: domain (no parent) → function → sub-function → process. */
export function AddNodeModal({
  parent,
  onClose,
  onCreated,
}: {
  parent: TreeNode | null;
  onClose: () => void;
  onCreated: (code: string) => void;
}) {
  const level = parent ? parent.level + 1 : 0;
  const meta = LEVEL_META[level];
  const prefix = parent && level < 3 ? `${parent.code}-` : '';
  const [form, setForm] = useState({
    code: prefix,
    name: '',
    description: '',
    owner: parent?.owner ?? '',
    criticality: 'Medium',
    start_trigger: '',
  });
  const create = useAction(
    () =>
      api.post<ProcessNode>('/processes/nodes/', {
        code: form.code.trim().toUpperCase(),
        level,
        parent: parent?.id ?? null,
        name: form.name.trim(),
        description: form.description,
        owner: form.owner,
        status: 'Active',
        ...(level === 3 ? { criticality: form.criticality, start_trigger: form.start_trigger } : {}),
      }),
    [['tree'], ['node'], ['overview']],
  );
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const Icon = meta.icon;
  return (
    <Modal
      title={
        <span className="modal-title-icon">
          <span className={`ptree__icon ptree__icon--l${level}`}>
            <Icon size={15} />
          </span>
          New {meta.name.toLowerCase()}{' '}
          {parent && (
            <span className="muted small">
              under {parent.code} · {parent.name}
            </span>
          )}
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn"
            disabled={create.isPending || !form.code.trim() || !form.name.trim()}
            onClick={() => create.mutate(undefined, { onSuccess: (n) => onCreated(n.code) })}
          >
            <Plus size={14} /> Create {meta.name.toLowerCase()}
          </button>
        </>
      }
    >
      <ErrorBox error={create.error} />
      <div className="level-path">
        {['Domain', 'Function', 'Sub-function', 'Process'].map((l, i) => (
          <span key={l} className={i === level ? 'is-current' : i < level ? 'is-done' : ''}>
            L{i} {l}
          </span>
        ))}
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Code</span>
          <input
            value={form.code}
            onChange={set('code')}
            placeholder={level === 3 ? '15-031' : 'PRO'}
            maxLength={20}
            autoFocus
          />
        </label>
        <label className="field" style={{ gridColumn: 'span 2' }}>
          <span>Name</span>
          <input value={form.name} onChange={set('name')} maxLength={200} placeholder={level === 3 ? 'Manage …' : ''} />
        </label>
        <label className="field">
          <span>Accountable owner</span>
          <input value={form.owner} onChange={set('owner')} maxLength={150} />
        </label>
        {level === 3 && (
          <>
            <label className="field">
              <span>Criticality</span>
              <select value={form.criticality} onChange={set('criticality')}>
                {['High', 'Medium', 'Low'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Start trigger</span>
              <input value={form.start_trigger} onChange={set('start_trigger')} />
            </label>
          </>
        )}
      </div>
      <label className="field" style={{ marginTop: 12 }}>
        <span>Description</span>
        <textarea value={form.description} onChange={set('description')} />
      </label>
      <p className="small muted">
        Codes use 2–20 upper-case letters, digits or hyphens.
        {level === 3 &&
          ' A To-Be v1.0 draft model (start → first activity → end) is created so you can start modelling right away.'}
      </p>
    </Modal>
  );
}
