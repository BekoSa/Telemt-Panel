import React, {useEffect, useMemo, useState} from 'react';
import linkTools from './link-configurator.cjs';

const {
  parseConnectionLink,
  normalizeBaseSecret,
  buildConnectionLink,
  buildGeneralLinksPatch,
} = linkTools;

const MODE_LABELS = {
  classic: 'Classic',
  secure: 'Secure (dd)',
  tls: 'TLS / FakeTLS (ee)',
  'web-plain': 'WEB plain',
  'web-dd': 'WEB dd',
};

function collectTemplates(user) {
  const out = [];
  for (const mode of ['classic', 'secure', 'tls']) {
    for (const [index, link] of (user?.links?.[mode] || []).entries()) {
      out.push({ id: `${mode}:${index}`, mode, link, label: `${MODE_LABELS[mode]} #${index + 1}` });
    }
  }
  return out;
}

function initialDraft(user) {
  const templates = collectTemplates(user);
  if (!templates.length) return { templates, sourceId: '', kind: 'classic', host: '', port: '', secret: '' };
  const first = templates[0];
  try {
    const parsed = parseConnectionLink(first.link);
    return {
      templates,
      sourceId: first.id,
      kind: first.mode,
      host: parsed.host,
      port: String(parsed.port),
      secret: first.mode === 'tls' ? parsed.rawSecret : parsed.baseSecret,
    };
  } catch {
    return { templates, sourceId: first.id, kind: first.mode, host: '', port: '', secret: '' };
  }
}

export default function ConnectionLinkConfigurator({ user, apiFn, onSaved }) {
  const initial = useMemo(() => initialDraft(user), [user]);
  const templates = initial.templates;
  const hasTls = templates.some(t => t.mode === 'tls');
  const [sourceId, setSourceId] = useState(initial.sourceId);
  const [kind, setKind] = useState(initial.kind);
  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(initial.port);
  const [secret, setSecret] = useState(initial.secret);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [copied, setCopied] = useState(false);
  const [telemt, setTelemt] = useState({ loading: true, readOnly: false, revision: null, publicHost: '', publicPort: null, error: null });

  const webMode = kind === 'web-plain' || kind === 'web-dd';

  const loadTelemtState = async () => {
    setTelemt(s => ({...s, loading: true, error: null}));
    try {
      const [config, health] = await Promise.all([
        apiFn('/config'),
        apiFn('/health').catch(() => null),
      ]);
      const links = config?.data?.general?.links || {};
      setTelemt({
        loading: false,
        readOnly: health?.data?.read_only === true,
        revision: config?.revision || null,
        publicHost: links.public_host || '',
        publicPort: links.public_port ?? null,
        error: null,
      });
      setHost(value => value || links.public_host || '');
      setPort(value => value || String(links.public_port || 443));
    } catch (e) {
      setTelemt(s => ({...s, loading: false, error: e.message || 'Config API unavailable'}));
    }
  };

  useEffect(() => {
    loadTelemtState();
    // apiFn is the stable panel API helper; user change remounts this draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username]);

  const generated = useMemo(() => {
    try {
      return { value: buildConnectionLink({ kind, host, port: webMode ? 443 : port, secret }), error: null };
    } catch (e) {
      return { value: '', error: e.message };
    }
  }, [kind, host, port, secret, webMode]);

  const applyTemplate = (id) => {
    const template = templates.find(t => t.id === id);
    setSourceId(id);
    setMessage(null);
    if (!template) return;
    try {
      const parsed = parseConnectionLink(template.link);
      setHost(parsed.host);
      setPort(String(parsed.port));
      setKind(template.mode);
      setSecret(template.mode === 'tls' ? parsed.rawSecret : parsed.baseSecret);
    } catch (e) {
      setMessage({ok: false, text: e.message});
    }
  };

  const changeKind = (nextKind) => {
    setMessage(null);
    if (nextKind === 'tls') {
      const tlsTemplate = templates.find(t => t.mode === 'tls');
      if (!tlsTemplate) return;
      try {
        const parsed = parseConnectionLink(tlsTemplate.link);
        setSecret(parsed.rawSecret);
      } catch (e) {
        setMessage({ok: false, text: e.message});
        return;
      }
    } else {
      try { setSecret(normalizeBaseSecret(secret)); }
      catch {
        const fallback = templates.find(t => t.mode !== 'tls') || templates[0];
        if (fallback) {
          try { setSecret(parseConnectionLink(fallback.link).baseSecret); } catch {}
        }
      }
    }
    setKind(nextKind);
  };

  const reset = () => {
    if (sourceId) applyTemplate(sourceId);
    else {
      setKind('classic');
      setHost(telemt.publicHost || '');
      setPort(String(telemt.publicPort || 443));
      setSecret('');
      setMessage(null);
    }
  };

  const copy = async () => {
    if (!generated.value) return;
    try {
      await navigator.clipboard?.writeText(generated.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setMessage({ok: false, text: 'Clipboard access failed'});
    }
  };

  const applyLocal = () => {
    if (generated.error) return setMessage({ok: false, text: generated.error});
    setMessage({ok: true, text: 'Local preview applied. Telemt configuration was not changed.'});
  };

  const saveToTelemt = async () => {
    if (webMode) return;
    setSaving(true);
    setMessage(null);
    try {
      // Refresh immediately before write so If-Match fences concurrent config edits.
      const current = await apiFn('/config');
      const patch = buildGeneralLinksPatch(host, port);
      const saved = await apiFn('/config', 'PATCH', patch, current?.revision || telemt.revision);
      setTelemt(s => ({...s, revision: saved?.revision || current?.revision || s.revision, publicHost: host, publicPort: Number(port), error: null}));
      setMessage({ok: true, text: 'Saved to Telemt general.links. User links refreshed.'});
      await onSaved?.();
    } catch (e) {
      const code = e.code || '';
      const text = code === 'revision_conflict'
        ? 'Telemt config changed concurrently. Reload the configurator and try again.'
        : code === 'read_only'
          ? 'Telemt Control API is read-only. Local link generation still works.'
          : code === 'field_not_editable' || code === 'section_not_editable'
            ? 'Connected Telemt does not allow editing general.links through the Control API.'
            : e.message;
      setMessage({ok: false, text});
      if (code === 'read_only') setTelemt(s => ({...s, readOnly: true}));
    } finally {
      setSaving(false);
    }
  };

  const saveDisabled = saving || telemt.loading || telemt.readOnly || webMode;

  return (
    <div style={{borderTop:'1px solid var(--border)',paddingTop:14,marginTop:14}}>
      <div className="card-title" style={{justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
        <span>Link Configurator</span>
        <span className="badge badge-dim">manual · preview-safe</span>
      </div>
      <div style={{fontSize:11,color:'var(--text3)',marginBottom:12,lineHeight:1.5}}>
        Build a connection link without changing Telemt. Standard host/port can optionally be persisted to <code>general.links</code>.
      </div>

      <div className="form-row">
        <label className="form-label">Base link</label>
        <select className="form-input" value={sourceId} onChange={e=>applyTemplate(e.target.value)} disabled={!templates.length}>
          {!templates.length && <option value="">Manual (no generated user links available)</option>}
          {templates.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>

      <div className="form-row">
        <label className="form-label">Output type</label>
        <select className="form-input" value={kind} onChange={e=>changeKind(e.target.value)}>
          <option value="classic">Classic</option>
          <option value="secure">Secure (dd)</option>
          {hasTls && <option value="tls">TLS / FakeTLS (ee)</option>}
          <option value="web-plain">WEB plain</option>
          <option value="web-dd">WEB dd</option>
        </select>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'minmax(0,2fr) minmax(130px,1fr)',gap:10}}>
        <div className="form-row">
          <label className="form-label">Host / IP</label>
          <input className="form-input mono" value={host} onChange={e=>setHost(e.target.value)} placeholder="proxy.example.com or 203.0.113.7" spellCheck={false}/>
        </div>
        <div className="form-row">
          <label className="form-label">Public port</label>
          <input className="form-input mono" value={webMode?'443 fixed':port} onChange={e=>setPort(e.target.value)} disabled={webMode} inputMode="numeric"/>
        </div>
      </div>

      <div className="form-row">
        <label className="form-label">{kind==='tls'?'Encoded TLS secret':'Secret (32 hex)'}</label>
        <input className="form-input mono" value={secret} onChange={e=>setSecret(e.target.value.trim())} autoComplete="off" spellCheck={false}/>
        {webMode && <div style={{fontSize:10,color:'var(--text3)',marginTop:5}}>WEB uses HTTPS on port 443; Telegram Desktop omits the port from tg://webproxy links. FakeTLS ee secrets are not valid for WEB. A working WEB link also requires a matching Telemt WEB profile for this user on the target host.</div>}
      </div>

      <div className="form-row">
        <label className="form-label">Generated link</label>
        <textarea className="form-input mono" rows={3} readOnly value={generated.value} placeholder={generated.error || 'Complete the fields to generate a link'} style={{resize:'vertical',wordBreak:'break-all'}}/>
        {generated.error && <div style={{fontSize:10,color:'var(--err)',marginTop:5}}>{generated.error}</div>}
      </div>

      <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:12}}>
        <button className="btn btn-primary btn-sm" onClick={copy} disabled={!generated.value}>{copied?'✓ Copied':'Copy link'}</button>
        <button className="btn btn-ghost btn-sm" onClick={applyLocal} disabled={!generated.value}>Apply locally</button>
        <button className="btn btn-ghost btn-sm" onClick={reset}>Reset from Telemt</button>
      </div>

      <div style={{border:'1px solid var(--border)',borderRadius:8,padding:10,background:'var(--bg2)'}}>
        <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text3)',marginBottom:7}}>Telemt config persistence</div>
        <div style={{fontSize:11,color:'var(--text3)',lineHeight:1.5,marginBottom:8}}>
          Saves only <code>general.links.public_host</code> and <code>public_port</code> for Classic/Secure/TLS links. It never changes listener/bind addresses or the user secret.
          {' '}WEB config is not editable by Telemt 3.5.7 Control API, so WEB plain/dd remain local link generation only.
        </div>
        <div style={{display:'flex',gap:7,alignItems:'center',flexWrap:'wrap'}}>
          <button className="btn btn-primary btn-sm" onClick={saveToTelemt} disabled={saveDisabled}>
            {saving?'Saving…':'Save public host/port to Telemt'}
          </button>
          {telemt.loading && <span className="last-upd">checking config…</span>}
          {!telemt.loading && telemt.readOnly && <span className="badge badge-warn">Control API read-only</span>}
          {webMode && <span className="badge badge-dim">WEB: local only</span>}
          {telemt.error && <span style={{fontSize:10,color:'var(--warn)'}}>{telemt.error}</span>}
        </div>
      </div>

      {message && <div className={message.ok?'success-box':'error-box'} style={{marginTop:10}}>{message.ok?'✓':'⚠'} {message.text}</div>}
    </div>
  );
}
