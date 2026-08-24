'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Key, Shield, FolderCog, Save, CheckCircle, Cpu } from 'lucide-react';

export default function SettingsPage() {
  const [config, setConfig] = useState<{
    aiProvider: string;
    hasGeminiKey: boolean;
    hasOpenAIKey: boolean;
    hasAnthropicKey: boolean;
    hasGithubToken: boolean;
    autoRunVerification: boolean;
    verificationTimeoutMs: number;
    storageDir: string;
    workspacesDir: string;
  } | null>(null);

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => setConfig(data))
      .catch((err) => console.error('Failed to load settings', err));
  }, []);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '6px' }}>Environment & Agent Settings</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          Configure AI reasoning providers, GitHub integration credentials, and execution verification parameters.
        </p>
      </div>

      {/* AI Provider Section */}
      <div className="card-panel">
        <div className="card-header">
          <div className="card-title">
            <Cpu size={16} color="#8b5cf6" />
            <span>AI Reasoning Provider</span>
          </div>
        </div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Active Engine</label>
            <select
              className="form-select"
              value={config?.aiProvider || 'gemini'}
              disabled
            >
              <option value="gemini">Google Gemini (Recommended / Default)</option>
              <option value="openai">OpenAI GPT-4o</option>
              <option value="anthropic">Anthropic Claude 3.5 Sonnet</option>
              <option value="ollama">Ollama (Local Open Source Models)</option>
            </select>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Configured via <code>AI_PROVIDER</code> environment variable.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
            <div
              style={{
                padding: '12px',
                background: 'var(--bg-input)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '13px' }}>GEMINI_API_KEY</span>
              <span className={`log-badge ${config?.hasGeminiKey ? 'success' : 'warn'}`}>
                {config?.hasGeminiKey ? 'CONFIGURED' : 'NOT SET'}
              </span>
            </div>

            <div
              style={{
                padding: '12px',
                background: 'var(--bg-input)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '13px' }}>GITHUB_TOKEN</span>
              <span className={`log-badge ${config?.hasGithubToken ? 'success' : 'warn'}`}>
                {config?.hasGithubToken ? 'CONFIGURED' : 'NOT SET'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Verification & Sandbox Policy */}
      <div className="card-panel">
        <div className="card-header">
          <div className="card-title">
            <Shield size={16} color="#10b981" />
            <span>Verification & Test Policy</span>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Auto-run Verification Tests</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Automatically execute repository test suites after proposing code modifications.
              </div>
            </div>
            <span className="log-badge success">
              {config?.autoRunVerification ? 'ENABLED' : 'DISABLED'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Verification Timeout</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Max duration allocated for automated test commands before timing out safely.
              </div>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--cyan-light)' }}>
              {config?.verificationTimeoutMs ? `${config.verificationTimeoutMs / 1000}s` : '60s'}
            </span>
          </div>
        </div>
      </div>

      {/* Storage & Local Directories */}
      <div className="card-panel">
        <div className="card-header">
          <div className="card-title">
            <FolderCog size={16} color="#f59e0b" />
            <span>Storage & Workspaces</span>
          </div>
        </div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Data Store Directory</label>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                background: 'var(--bg-input)',
                padding: '10px 12px',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
              }}
            >
              {config?.storageDir || '.devforge_data'}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Managed Cloned Workspaces</label>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                background: 'var(--bg-input)',
                padding: '10px 12px',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
              }}
            >
              {config?.workspacesDir || 'temp_repos'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
