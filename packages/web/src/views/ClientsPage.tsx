import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface ClientSummary {
  id: string;
  name: string;
  webhookUrl: string;
  apiKeyPrefix: string;
  createdAt: string;
}

interface NewClient {
  id: string;
  name: string;
  webhookUrl: string;
  apiKey: string;
  createdAt: string;
}

export function ClientsPage() {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [newClient, setNewClient] = useState<NewClient | null>(null);
  const [error, setError] = useState('');

  const fetchClients = async () => {
    const res = await fetch('/clients');
    const data = await res.json();
    setClients(data.clients);
    setLoading(false);
  };

  useEffect(() => { fetchClients(); }, []);

  const handleCreate = async () => {
    if (!name.trim() || !webhookUrl.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), webhookUrl: webhookUrl.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to register client');
        return;
      }
      const data = await res.json();
      setNewClient(data.client);
      setName('');
      setWebhookUrl('');
      fetchClients();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/clients/${id}`, { method: 'DELETE' });
    fetchClients();
    if (newClient?.id === id) setNewClient(null);
  };

  if (loading) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-sm text-slate-400 hover:text-slate-200">← Models</Link>
        <h2 className="text-xl font-semibold">Client Registry</h2>
        <span className="text-xs text-slate-500">{clients.length} registered</span>
      </div>

      {/* Register new client */}
      <section className="rounded-lg border border-slate-800 p-5 space-y-4">
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide">Register New Client</h3>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Client name (e.g. Siliconomics)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
          />
          <input
            type="url"
            placeholder="Webhook URL"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim() || !webhookUrl.trim()}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg whitespace-nowrap"
          >
            {creating ? 'Registering…' : 'Register'}
          </button>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </section>

      {/* API key reveal (shown once after creation) */}
      {newClient && (
        <section className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-5 space-y-2">
          <h3 className="text-sm font-medium text-emerald-400 uppercase tracking-wide">Client Registered — Save This Key</h3>
          <p className="text-xs text-slate-400">This API key will not be shown again. The receiving webhook should validate the <code className="text-emerald-300">X-XLent-Signature</code> header matches this key.</p>
          <div className="flex items-center gap-3 bg-slate-900 rounded px-4 py-3 font-mono text-sm text-emerald-300 select-all">
            {newClient.apiKey}
          </div>
          <p className="text-xs text-slate-500">Client: {newClient.name} · Webhook: {newClient.webhookUrl}</p>
        </section>
      )}

      {/* Client list */}
      {clients.length === 0 ? (
        <p className="text-slate-500 text-sm">No clients registered yet.</p>
      ) : (
        <section className="rounded-lg border border-slate-800 divide-y divide-slate-800 overflow-hidden">
          {clients.map((c) => (
            <div key={c.id} className="flex items-center gap-4 px-5 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-200">{c.name}</p>
                <p className="text-[11px] text-slate-500 font-mono truncate">{c.webhookUrl}</p>
              </div>
              <span className="text-[10px] text-slate-600 font-mono">{c.apiKeyPrefix}</span>
              <span className="text-[10px] text-slate-600">{new Date(c.createdAt).toLocaleDateString()}</span>
              <button
                onClick={() => handleDelete(c.id)}
                className="text-xs text-red-400 hover:text-red-300 hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
