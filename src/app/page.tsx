'use client';

import React, { useState, useEffect } from 'react';
import {
  FolderGit2,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  Terminal,
  FileCode,
  Layers,
  Sparkles,
  RefreshCw,
  Plus,
  GitBranch,
  ShieldCheck,
  ChevronRight,
  Search,
  Check,
  ExternalLink,
  Code2,
  FileText,
  AlertTriangle,
  Cpu,
  Shield,
  Zap,
  Info,
  XCircle,
  CheckCheck,
  FileDiff,
  GitCommit,
  GitPullRequest,
  CheckSquare,
} from 'lucide-react';
import { Repository, TaskRun, FileNode, ProjectStructure, GitRepairBranchInfo } from '@/types';

export default function DashboardPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [repoStructure, setRepoStructure] = useState<ProjectStructure | null>(null);

  const [prompt, setPrompt] = useState<string>('');
  const [activeTask, setActiveTask] = useState<TaskRun | null>(null);
  const [recentTasks, setRecentTasks] = useState<TaskRun[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isRejecting, setIsRejecting] = useState<boolean>(false);
  const [isPreparingGit, setIsPreparingGit] = useState<boolean>(false);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'diff' | 'plan' | 'verification' | 'git' | 'context' | 'terminal' | 'files'>('plan');

  const [isCloning, setIsCloning] = useState<boolean>(false);
  const [showCloneModal, setShowCloneModal] = useState<boolean>(false);
  const [cloneUrl, setCloneUrl] = useState<string>('');
  const [localClonePath, setLocalClonePath] = useState<string>('');

  const [systemHealth, setSystemHealth] = useState<{
    gitVersion: string;
    nodeVersion: string;
    aiProvider: string;
    hasGeminiKey: boolean;
    hasOpenAIKey: boolean;
    hasAnthropicKey: boolean;
  } | null>(null);

  const presets = [
    {
      title: 'Fix Login Endpoint Bug',
      prompt: 'Find why the login request fails and explain the root cause. Propose a targeted patch to fix it.',
    },
    {
      title: 'Analyze Project Architecture',
      prompt: 'Analyze repository architecture, dependency layers, entrypoints, and evaluate modularity.',
    },
    {
      title: 'Security & Secret Filtering Audit',
      prompt: 'Verify how context extraction protects sensitive environment files and prevents path traversal.',
    },
  ];

  useEffect(() => {
    fetchHealth();
    fetchRepositories();
    fetchTasks();
  }, []);

  useEffect(() => {
    if (selectedRepoId) {
      const repo = repositories.find((r) => r.id === selectedRepoId);
      if (repo) {
        setSelectedRepo(repo);
        fetchRepoDetails(repo.id);
      }
    }
  }, [selectedRepoId, repositories]);

  async function fetchHealth() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setSystemHealth({
          gitVersion: data.gitVersion,
          nodeVersion: data.nodeVersion,
          aiProvider: data.aiProvider,
          hasGeminiKey: data.hasGeminiKey,
          hasOpenAIKey: data.hasOpenAIKey,
          hasAnthropicKey: data.hasAnthropicKey,
        });
      }
    } catch {
      // Offline fallback
    }
  }

  async function fetchRepositories() {
    try {
      const res = await fetch('/api/repositories');
      if (res.ok) {
        const data: Repository[] = await res.json();
        setRepositories(data);
        if (data.length > 0 && !selectedRepoId) {
          setSelectedRepoId(data[0].id);
          setSelectedRepo(data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch repositories', err);
    }
  }

  async function fetchRepoDetails(id: string) {
    try {
      const res = await fetch(`/api/repositories/${id}`);
      if (res.ok) {
        const data = await res.json();
        setRepoStructure(data.structure);
      }
    } catch (err) {
      console.error('Failed to fetch repo structure', err);
    }
  }

  async function fetchTasks() {
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const data: TaskRun[] = await res.json();
        setRecentTasks(data);
        if (data.length > 0 && !activeTask) {
          setActiveTask(data[0]);
          if (data[0].gitBranchInfo) {
            setActiveTab('git');
          } else if (data[0].patchProposal && data[0].patchProposal.changes.length > 0) {
            setActiveTab('diff');
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch tasks', err);
    }
  }

  async function handleAddRepo(e: React.FormEvent) {
    e.preventDefault();
    if (!cloneUrl && !localClonePath) return;

    setIsCloning(true);
    try {
      const res = await fetch('/api/repositories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remoteUrl: cloneUrl.trim() || undefined,
          localPath: localClonePath.trim() || undefined,
        }),
      });

      if (res.ok) {
        const newRepo: Repository = await res.json();
        setRepositories((prev) => [newRepo, ...prev]);
        setSelectedRepoId(newRepo.id);
        setShowCloneModal(false);
        setCloneUrl('');
        setLocalClonePath('');
      } else {
        const err = await res.json();
        alert(`Error: ${err.error || 'Failed to add repository'}`);
      }
    } catch (err) {
      alert(`Failed to add repository: ${String(err)}`);
    } finally {
      setIsCloning(false);
    }
  }

  async function handleLaunchAgent() {
    if (!prompt.trim() || !selectedRepoId) return;

    setIsRunning(true);
    setActiveTab('terminal');

    try {
      const createRes = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          repositoryId: selectedRepoId,
        }),
      });

      if (!createRes.ok) {
        throw new Error('Failed to create task');
      }

      const initialTask: TaskRun = await createRes.json();
      setActiveTask(initialTask);
      setRecentTasks((prev) => [initialTask, ...prev]);

      const runRes = await fetch(`/api/tasks/${initialTask.id}/run`, {
        method: 'POST',
      });

      if (runRes.ok) {
        const runData = await runRes.json();
        setActiveTask(runData.task);
        setRecentTasks((prev) =>
          prev.map((t) => (t.id === runData.task.id ? runData.task : t))
        );

        if (runData.task.patchProposal?.changes?.length > 0) {
          setActiveTab('diff');
        } else if (runData.task.plan) {
          setActiveTab('plan');
        }
      }
    } catch (err) {
      console.error('Agent execution error:', err);
    } finally {
      setIsRunning(false);
    }
  }

  async function handleRetryVerification() {
    if (!activeTask) return;

    setIsRetrying(true);
    try {
      const res = await fetch(`/api/tasks/${activeTask.id}/verify`, {
        method: 'POST',
      });

      if (res.ok) {
        const data = await res.json();
        setActiveTask(data.task);
        setRecentTasks((prev) =>
          prev.map((t) => (t.id === data.task.id ? data.task : t))
        );
      } else {
        alert(`Failed to retry verification.`);
      }
    } catch (err) {
      alert(`Error retrying verification: ${String(err)}`);
    } finally {
      setIsRetrying(false);
    }
  }

  async function handleApprovePatch() {
    if (!activeTask) return;

    setIsApproving(true);
    try {
      const res = await fetch(`/api/tasks/${activeTask.id}/approve`, {
        method: 'POST',
      });

      if (res.ok) {
        const data = await res.json();
        setActiveTask(data.task);
        setRecentTasks((prev) =>
          prev.map((t) => (t.id === data.task.id ? data.task : t))
        );
        if (data.task.verification) {
          setActiveTab('verification');
        }
        if (selectedRepo) {
          fetchRepoDetails(selectedRepo.id);
        }
      } else {
        const err = await res.json();
        alert(`Failed to apply patch: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Error approving patch: ${String(err)}`);
    } finally {
      setIsApproving(false);
    }
  }

  async function handleRejectPatch() {
    if (!activeTask) return;

    setIsRejecting(true);
    try {
      const res = await fetch(`/api/tasks/${activeTask.id}/reject`, {
        method: 'POST',
      });

      if (res.ok) {
        const data = await res.json();
        setActiveTask(data.task);
        setRecentTasks((prev) =>
          prev.map((t) => (t.id === data.task.id ? data.task : t))
        );
      }
    } catch (err) {
      alert(`Error rejecting patch: ${String(err)}`);
    } finally {
      setIsRejecting(false);
    }
  }

  async function handlePrepareGitBranch() {
    if (!activeTask) return;

    setIsPreparingGit(true);
    try {
      const res = await fetch(`/api/tasks/${activeTask.id}/git/branch`, {
        method: 'POST',
      });

      if (res.ok) {
        const data = await res.json();
        setActiveTask(data.task);
        setRecentTasks((prev) =>
          prev.map((t) => (t.id === data.task.id ? data.task : t))
        );
        setActiveTab('git');
        if (selectedRepo) {
          fetchRepoDetails(selectedRepo.id);
        }
      } else {
        const err = await res.json();
        alert(`Failed to prepare Git branch: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Error preparing Git branch: ${String(err)}`);
    } finally {
      setIsPreparingGit(false);
    }
  }

  const totalCompleted = recentTasks.filter((t) => t.status === 'completed').length;
  const activeKeyConfigured = Boolean(
    (systemHealth?.aiProvider === 'gemini' && systemHealth?.hasGeminiKey) ||
    (systemHealth?.aiProvider === 'openai' && systemHealth?.hasOpenAIKey) ||
    (systemHealth?.aiProvider === 'anthropic' && systemHealth?.hasAnthropicKey) ||
    systemHealth?.aiProvider === 'ollama'
  );

  const isAwaitingApproval = activeTask?.status === 'patch_ready' || activeTask?.status === 'awaiting_approval';
  const hasPatch = Boolean(activeTask?.patchProposal && activeTask.patchProposal.changes.length > 0);
  const isVerified = Boolean(
    activeTask?.verification &&
    (activeTask.verification.overallStatus === 'PASS' ||
     (activeTask.verification.results && activeTask.verification.results.every((r) => r.status === 'PASS')))
  );

  return (
    <div>
      {/* Evaluator Hero & Mission Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          borderRadius: '12px',
          padding: '22px 26px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '650px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                padding: '3px 8px',
                borderRadius: '4px',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
              }}
            >
              AUTONOMOUS AGENT ENGINE
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                padding: '3px 8px',
                borderRadius: '4px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}
            >
              AI PROPOSES. DEVELOPER APPROVES.
            </span>
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            AI-powered engineering agent for safe repository repair.
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            DevForge inspects your codebase, diagnoses root causes, generates verified atomic diffs, and prepares clean Git branches — without touching files without your permission.
          </p>
        </div>

        {/* 6-Stage Workflow Sequence */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { label: 'SCAN', color: '#38bdf8' },
            { label: 'ANALYZE', color: '#818cf8' },
            { label: 'PLAN', color: '#a78bfa' },
            { label: 'PATCH', color: '#f59e0b' },
            { label: 'VERIFY', color: '#10b981' },
            { label: 'GIT', color: '#38bdf8' },
          ].map((stage, idx, arr) => (
            <React.Fragment key={stage.label}>
              <div
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: `1px solid ${stage.color}40`,
                  fontSize: '11.5px',
                  fontWeight: 700,
                  color: stage.color,
                  letterSpacing: '0.04em',
                }}
              >
                {stage.label}
              </div>
              {idx < arr.length - 1 && (
                <ChevronRight size={12} color="var(--text-muted)" style={{ opacity: 0.6 }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Top Stats Banner */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <span>CONNECTED WORKSPACE</span>
            <FolderGit2 size={16} color="#38bdf8" />
          </div>
          <div className="stat-value">{repositories.length}</div>
          <div className="stat-sub">
            {selectedRepo ? selectedRepo.name : 'No active workspace'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span>AI DIAGNOSES & PATCHES</span>
            <Sparkles size={16} color="#8b5cf6" />
          </div>
          <div className="stat-value">{recentTasks.length}</div>
          <div className="stat-sub">{totalCompleted} verified completions</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span>AI REASONING ENGINE</span>
            <Cpu size={16} color={activeKeyConfigured ? '#10b981' : '#f59e0b'} />
          </div>
          <div className="stat-value" style={{ fontSize: '18px', textTransform: 'capitalize' }}>
            {systemHealth?.aiProvider || 'Gemini'}
          </div>
          <div className="stat-sub">
            {activeKeyConfigured ? (
              <span style={{ color: '#10b981' }}>● API Key Active</span>
            ) : (
              <span style={{ color: '#f59e0b' }}>⚠️ API Key Required</span>
            )}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span>SAFE GIT WORKFLOW</span>
            <GitBranch size={16} color="#38bdf8" />
          </div>
          <div className="stat-value" style={{ fontSize: '15px', color: '#38bdf8' }}>
            {activeTask?.gitBranchInfo ? 'BRANCH READY' : 'SAFE REPAIR'}
          </div>
          <div className="stat-sub">Non-destructive branch isolation</div>
        </div>
      </div>

      {/* Main Grid: Left Control Column & Right Execution Workspace */}
      <div className="dashboard-grid" id="workspace">
        {/* Left Column: Repository Selector & Task Dispatcher */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Repository Selector Card */}
          <div className="card-panel">
            <div className="card-header">
              <div className="card-title">
                <FolderGit2 size={16} color="#38bdf8" />
                <span>Target Repository</span>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowCloneModal(true)}
                title="Connect another repository"
              >
                <Plus size={14} /> Add Repo
              </button>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Active Workspace</label>
                <select
                  className="form-select"
                  value={selectedRepoId}
                  onChange={(e) => setSelectedRepoId(e.target.value)}
                >
                  {repositories.map((repo) => (
                    <option key={repo.id} value={repo.id}>
                      {repo.name} ({repo.branch})
                    </option>
                  ))}
                </select>
              </div>

              {selectedRepo && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-mono)',
                      background: 'var(--bg-input)',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      wordBreak: 'break-all',
                    }}
                  >
                    Path: {selectedRepo.localPath}
                  </div>

                  <div className="badge-list">
                    <span className="stack-badge">Branch: {selectedRepo.branch}</span>
                    <span className="stack-badge">{repoStructure?.totalFiles || selectedRepo.totalFiles} files</span>
                    {selectedRepo.detectedStack?.map((st) => (
                      <span key={st} className="stack-badge" style={{ color: '#38bdf8' }}>
                        {st}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Task / Bug Dispatcher Card */}
          <div className="card-panel">
            <div className="card-header">
              <div className="card-title">
                <Sparkles size={16} color="#8b5cf6" />
                <span>Developer Prompt / Bug Report</span>
              </div>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Task Instruction</label>
                <textarea
                  className="form-textarea"
                  placeholder="e.g., Find why the login request fails, explain the root cause, and generate a targeted code patch..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Analysis & Repair Scenarios</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {presets.map((p, idx) => (
                    <button
                      key={idx}
                      className="preset-chip"
                      style={{ textAlign: 'left' }}
                      onClick={() => setPrompt(p.prompt)}
                    >
                      <strong style={{ color: 'var(--text-primary)' }}>{p.title}:</strong> {p.prompt}
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleLaunchAgent}
                disabled={isRunning || !prompt.trim() || !selectedRepoId}
              >
                {isRunning ? (
                  <>
                    <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Analyzing & Formulating Patch...</span>
                  </>
                ) : (
                  <>
                    <Play size={15} />
                    <span>Run AI Analysis & Generate Patch</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Task History Panel */}
          {recentTasks.length > 0 && (
            <div className="card-panel">
              <div className="card-header">
                <div className="card-title">
                  <Clock size={16} color="#94a3b8" />
                  <span>Recent Tasks</span>
                </div>
              </div>
              <div className="card-body" style={{ padding: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {recentTasks.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => setActiveTask(t)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: activeTask?.id === t.id ? 'var(--cyan-glow)' : 'transparent',
                        border: activeTask?.id === t.id ? '1px solid var(--border-active)' : '1px solid transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {t.title}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {new Date(t.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <span
                        className={`log-badge ${
                          t.gitBranchInfo
                            ? 'success'
                            : t.status === 'completed'
                            ? 'success'
                            : t.status === 'patch_ready'
                            ? 'warn'
                            : t.status === 'rejected'
                            ? 'meta'
                            : t.status === 'failed'
                            ? 'error'
                            : 'info'
                        }`}
                      >
                        {t.gitBranchInfo ? 'BRANCH READY' : t.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Execution Pipeline & Diagnostic Work Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Stage Pipeline Tracker */}
          <div className="card-panel">
            <div className="card-header">
              <div className="card-title">
                <Layers size={16} color="#38bdf8" />
                <span>Diagnostic & Code Repair Pipeline</span>
              </div>
              {activeTask && (
                <span
                  className={`log-badge ${
                    activeTask.gitBranchInfo
                      ? 'success'
                      : activeTask.status === 'completed'
                      ? 'success'
                      : activeTask.status === 'patch_ready'
                      ? 'warn'
                      : activeTask.status === 'failed'
                      ? 'error'
                      : 'info'
                  }`}
                >
                  STATUS: {activeTask.gitBranchInfo ? 'BRANCH READY' : activeTask.status.replace('_', ' ').toUpperCase()}
                </span>
              )}
            </div>

            {/* Stages Row */}
            <div className="pipeline-steps">
              {(
                activeTask?.stages || [
                  { id: 'structure_analysis', name: '1. Scan', status: 'pending' },
                  { id: 'file_identification', name: '2. Search', status: 'pending' },
                  { id: 'context_collection', name: '3. Context', status: 'pending' },
                  { id: 'ai_analysis', name: '4. AI Reason', status: 'pending' },
                  { id: 'patch_generation', name: '5. Proposed Patch', status: 'pending' },
                  { id: 'approval_and_apply', name: '6. Review & Apply', status: 'pending' },
                  { id: 'verification', name: '7. Verification', status: 'pending' },
                ]
              ).slice(0, 7).map((st, idx, arr) => {
                const isActive = st.status === 'running';
                const isDone = st.status === 'completed';
                return (
                  <React.Fragment key={st.id}>
                    <div
                      className={`pipeline-step ${isActive ? 'active' : ''} ${isDone ? 'completed' : ''}`}
                    >
                      <div className="step-number">
                        {isDone ? <Check size={12} /> : idx + 1}
                      </div>
                      <span>{st.name}</span>
                    </div>
                    {idx < arr.length - 1 && <div className="step-divider" />}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Interactive Workspace Tabs */}
            <div className="tabs-header">
              <button
                className={`tab-btn ${activeTab === 'diff' ? 'active' : ''}`}
                onClick={() => setActiveTab('diff')}
              >
                <FileDiff size={15} /> Proposed Patch ({activeTask?.patchProposal?.changes?.length || 0})
              </button>
              <button
                className={`tab-btn ${activeTab === 'plan' ? 'active' : ''}`}
                onClick={() => setActiveTab('plan')}
              >
                <FileText size={15} /> Solution Plan {activeTask?.plan ? '✓' : ''}
              </button>
              <button
                className={`tab-btn ${activeTab === 'verification' ? 'active' : ''}`}
                onClick={() => setActiveTab('verification')}
              >
                <ShieldCheck size={15} /> Verification {isVerified ? '✅' : ''}
              </button>
              <button
                className={`tab-btn ${activeTab === 'git' ? 'active' : ''}`}
                onClick={() => setActiveTab('git')}
              >
                <GitBranch size={15} /> Git Workflow {activeTask?.gitBranchInfo ? '🟢' : ''}
              </button>
              <button
                className={`tab-btn ${activeTab === 'context' ? 'active' : ''}`}
                onClick={() => setActiveTab('context')}
              >
                <Code2 size={15} /> Context Files ({activeTask?.extractedContext?.length || 0})
              </button>
              <button
                className={`tab-btn ${activeTab === 'terminal' ? 'active' : ''}`}
                onClick={() => setActiveTab('terminal')}
              >
                <Terminal size={15} /> Console Stream ({activeTask?.logs?.length || 0})
              </button>
              <button
                className={`tab-btn ${activeTab === 'files' ? 'active' : ''}`}
                onClick={() => setActiveTab('files')}
              >
                <FileCode size={15} /> Repository Explorer
              </button>
            </div>

            {/* TAB: Git Workflow */}
            {activeTab === 'git' && (
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div
                  style={{
                    padding: '16px 20px',
                    borderRadius: '8px',
                    background: activeTask?.gitBranchInfo
                      ? 'rgba(16, 185, 129, 0.1)'
                      : isVerified
                      ? 'rgba(56, 189, 248, 0.1)'
                      : 'var(--bg-panel)',
                    border: `1px solid ${
                      activeTask?.gitBranchInfo
                        ? '#10b981'
                        : isVerified
                        ? '#38bdf8'
                        : 'var(--border-subtle)'
                    }`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '15px' }}>
                      <GitBranch size={18} color={activeTask?.gitBranchInfo ? '#10b981' : '#38bdf8'} />
                      <span>SAFE GITHUB WORKFLOW</span>
                    </div>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      {activeTask?.gitBranchInfo
                        ? 'Repair branch has been created safely. Changes are staged in branch isolation.'
                        : isVerified
                        ? 'Repair verified and ready for safe Git branch staging.'
                        : 'Requires human approval and successful test verification before preparing Git branch.'}
                    </div>
                  </div>

                  {isVerified && !activeTask?.gitBranchInfo && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handlePrepareGitBranch}
                      disabled={isPreparingGit}
                    >
                      {isPreparingGit ? (
                        <>
                          <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                          <span>Creating Repair Branch...</span>
                        </>
                      ) : (
                        <>
                          <GitBranch size={14} />
                          <span>Prepare Git Changes</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Workflow Checklist Card */}
                <div
                  style={{
                    background: 'var(--bg-input)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Workflow Pre-conditions
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                    <CheckSquare size={16} color={activeTask?.status === 'completed' || activeTask?.status === 'applied' ? '#10b981' : 'var(--text-muted)'} />
                    <span style={{ color: activeTask?.status === 'completed' || activeTask?.status === 'applied' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      Human Patch Approval & Application
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                    <CheckSquare size={16} color={isVerified ? '#10b981' : 'var(--text-muted)'} />
                    <span style={{ color: isVerified ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      Automated Verification Suite Passed
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                    <CheckSquare size={16} color={activeTask?.gitBranchInfo ? '#10b981' : 'var(--text-muted)'} />
                    <span style={{ color: activeTask?.gitBranchInfo ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      Dedicated Repair Branch Created
                    </span>
                  </div>
                </div>

                {/* Branch Info Display */}
                {activeTask?.gitBranchInfo && (
                  <>
                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                      <div className="stat-card" style={{ padding: '14px' }}>
                        <div className="stat-header"><span>REPAIR BRANCH</span></div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: '#38bdf8', fontWeight: 600, wordBreak: 'break-all' }}>
                          {activeTask.gitBranchInfo.branchName}
                        </div>
                      </div>
                      <div className="stat-card" style={{ padding: '14px' }}>
                        <div className="stat-header"><span>BASE BRANCH</span></div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-primary)' }}>
                          {activeTask.gitBranchInfo.baseBranch}
                        </div>
                      </div>
                      <div className="stat-card" style={{ padding: '14px' }}>
                        <div className="stat-header"><span>STATUS</span></div>
                        <div style={{ fontSize: '13px', color: '#10b981', fontWeight: 700 }}>
                          🟢 READY FOR COMMIT
                        </div>
                      </div>
                      <div className="stat-card" style={{ padding: '14px' }}>
                        <div className="stat-header"><span>MODIFIED FILES</span></div>
                        <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                          {activeTask.gitBranchInfo.changedFiles.length} file(s)
                        </div>
                      </div>
                    </div>

                    {/* Changed Files List */}
                    <div className="card-panel">
                      <div className="card-header">
                        <div className="card-title">
                          <FileCode size={16} color="#38bdf8" />
                          <span>Changed Files in Repair Branch ({activeTask.gitBranchInfo.changedFiles.length})</span>
                        </div>
                      </div>
                      <div className="card-body" style={{ padding: '10px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {activeTask.gitBranchInfo.changedFiles.map((file, fIdx) => (
                            <div
                              key={fIdx}
                              style={{
                                padding: '10px 12px',
                                background: 'var(--bg-input)',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '13px',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              <span style={{ color: '#38bdf8' }}>{file.path}</span>
                              <span className="log-badge info">{file.status.toUpperCase()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Raw Git Diff */}
                    {activeTask.gitBranchInfo.rawDiff && (
                      <div className="diff-container">
                        <div className="diff-header">
                          <span>Git Working Tree Diff</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            +{activeTask.gitBranchInfo.diffSummary.insertions} / -{activeTask.gitBranchInfo.diffSummary.deletions}
                          </span>
                        </div>
                        <pre
                          style={{
                            padding: '14px',
                            background: '#050811',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '12px',
                            color: 'var(--text-primary)',
                            maxHeight: '320px',
                            overflowY: 'auto',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {activeTask.gitBranchInfo.rawDiff}
                        </pre>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* TAB: Proposed Patch & Human Approval Diff Viewer */}
            {activeTab === 'diff' && (
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {hasPatch && (
                  <div
                    style={{
                      padding: '16px 20px',
                      borderRadius: '8px',
                      background: isAwaitingApproval
                        ? 'rgba(245, 158, 11, 0.1)'
                        : activeTask?.status === 'completed' || activeTask?.status === 'applied'
                        ? 'rgba(16, 185, 129, 0.1)'
                        : 'var(--bg-panel)',
                      border: `1px solid ${
                        isAwaitingApproval
                          ? '#f59e0b'
                          : activeTask?.status === 'completed' || activeTask?.status === 'applied'
                          ? '#10b981'
                          : 'var(--border-subtle)'
                      }`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '16px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px' }}>
                        {isAwaitingApproval ? (
                          <>
                            <AlertTriangle size={18} color="#f59e0b" />
                            <span>Action Required: Developer Approval & Review</span>
                          </>
                        ) : activeTask?.status === 'completed' || activeTask?.status === 'applied' ? (
                          <>
                            <CheckCircle2 size={18} color="#10b981" />
                            <span>Patch Applied & Verified</span>
                          </>
                        ) : activeTask?.status === 'rejected' ? (
                          <>
                            <XCircle size={18} color="#94a3b8" />
                            <span>Patch Rejected by Developer</span>
                          </>
                        ) : (
                          <span>Proposed Patch Proposal</span>
                        )}
                      </div>
                      <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {isAwaitingApproval
                          ? 'Repository files remain 100% untouched until you review the diff and explicitly approve.'
                          : activeTask?.status === 'completed' || activeTask?.status === 'applied'
                          ? `Changes applied safely to ${activeTask?.patchProposal?.modifiedFiles?.length || 1} file(s). Snapshot backup: ${activeTask?.backupId || 'created'}.`
                          : 'Repository files were left untouched.'}
                      </div>
                    </div>

                    {isAwaitingApproval && (
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={handleRejectPatch}
                          disabled={isRejecting || isApproving}
                          style={{ borderColor: '#f43f5e', color: '#fda4af' }}
                        >
                          <XCircle size={14} /> Reject Changes
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={handleApprovePatch}
                          disabled={isRejecting || isApproving}
                          style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderColor: '#34d399' }}
                        >
                          {isApproving ? (
                            <>
                              <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                              <span>Applying & Verifying...</span>
                            </>
                          ) : (
                            <>
                              <CheckCheck size={14} /> Approve & Apply Patch
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Diff Blocks */}
                {activeTask?.patchProposal?.changes && activeTask.patchProposal.changes.length > 0 ? (
                  activeTask.patchProposal.changes.map((change, idx) => (
                    <div key={idx} className="diff-container">
                      <div className="diff-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileCode size={15} color="#38bdf8" />
                          <span style={{ fontWeight: 600, color: '#38bdf8' }}>{change.filePath}</span>
                          <span className="log-badge info">MODIFY</span>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', fontSize: '12px' }}>
                          <span style={{ color: '#6ee7b7' }}>+{change.linesAdded} lines</span>
                          <span style={{ color: '#fda4af' }}>-{change.linesRemoved} lines</span>
                        </div>
                      </div>

                      <div
                        style={{
                          padding: '10px 16px',
                          background: 'rgba(30, 41, 59, 0.4)',
                          borderBottom: '1px solid var(--border-subtle)',
                          fontSize: '12.5px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        <div><strong>Reason:</strong> <span style={{ color: 'var(--text-secondary)' }}>{change.reason}</span></div>
                        <div><strong>Expected Effect:</strong> <span style={{ color: 'var(--text-secondary)' }}>{change.expectedEffect}</span></div>
                      </div>

                      <div className="diff-body">
                        {change.diffHunks.map((hunk, hIdx) => (
                          <div
                            key={hIdx}
                            className={`diff-line ${
                              hunk.startsWith('+') && !hunk.startsWith('+++')
                                ? 'add'
                                : hunk.startsWith('-') && !hunk.startsWith('---')
                                ? 'remove'
                                : 'meta'
                            }`}
                          >
                            <span>{hunk}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                    No patch proposals generated yet. Run an analysis task to formulate code repairs.
                  </div>
                )}
              </div>
            )}

            {/* TAB: Solution Plan & Diagnostics */}
            {activeTab === 'plan' && (
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {activeTask?.plan ? (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: 'var(--bg-panel)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '12.5px',
                        flexWrap: 'wrap',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={16} color="#8b5cf6" />
                        <span><strong>Model:</strong> {activeTask.plan.llmProvider} ({activeTask.plan.llmModel})</span>
                      </div>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <span><strong>Latency:</strong> {activeTask.plan.llmLatencyMs}ms</span>
                        <span><strong>Complexity:</strong> <span style={{ textTransform: 'capitalize', color: '#38bdf8' }}>{activeTask.plan.estimatedComplexity}</span></span>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '16px',
                        background: 'var(--bg-input)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Info size={14} color="#38bdf8" />
                        Problem Understanding
                      </h4>
                      <p style={{ fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                        {activeTask.plan.problemUnderstanding}
                      </p>
                    </div>

                    <div
                      style={{
                        padding: '16px',
                        background: 'rgba(139, 92, 246, 0.08)',
                        borderRadius: '8px',
                        border: '1px solid rgba(139, 92, 246, 0.25)',
                      }}
                    >
                      <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: '#a78bfa', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Zap size={14} color="#a78bfa" />
                        Root-Cause Hypothesis
                      </h4>
                      <p style={{ fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                        {activeTask.plan.rootCauseHypothesis}
                      </p>
                    </div>

                    {activeTask.plan.relevantFilesAnalysis && activeTask.plan.relevantFilesAnalysis.length > 0 && (
                      <div>
                        <h4 style={{ fontSize: '13px', marginBottom: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                          Identified Files & Proposed Actions ({activeTask.plan.relevantFilesAnalysis.length})
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {activeTask.plan.relevantFilesAnalysis.map((fa, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                padding: '12px 14px',
                                background: 'var(--bg-input)',
                                borderRadius: '6px',
                                border: '1px solid var(--border-subtle)',
                                gap: '12px',
                              }}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: '#38bdf8', fontWeight: 600 }}>
                                  {fa.path}
                                </span>
                                <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                                  {fa.relevanceReason}
                                </span>
                              </div>
                              <span
                                className={`log-badge ${
                                  fa.proposedAction === 'modify'
                                    ? 'warn'
                                    : fa.proposedAction === 'create'
                                    ? 'success'
                                    : 'info'
                                }`}
                              >
                                {fa.proposedAction.toUpperCase()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div
                      style={{
                        padding: '16px',
                        background: 'var(--bg-input)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>
                        Proposed Solution Architecture
                      </h4>
                      <p style={{ fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                        {activeTask.plan.proposedSolution}
                      </p>
                    </div>

                    <div>
                      <h4 style={{ fontSize: '13px', marginBottom: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        Step-by-Step Implementation Changes ({activeTask.plan.implementationSteps.length})
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {activeTask.plan.implementationSteps.map((step, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              padding: '12px 14px',
                              background: 'var(--bg-panel)',
                              borderRadius: '6px',
                              fontSize: '13px',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            <span
                              style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                background: 'var(--cyan-glow)',
                                color: '#38bdf8',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                fontFamily: 'var(--font-mono)',
                                flexShrink: 0,
                              }}
                            >
                              {idx + 1}
                            </span>
                            <span style={{ color: 'var(--text-primary)' }}>{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                    No solution plan generated yet.
                  </div>
                )}
              </div>
            )}

            {/* TAB: Verification Results */}
            {activeTab === 'verification' && (
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {activeTask?.verification ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button 
                        className="btn btn-secondary btn-sm" 
                        onClick={handleRetryVerification}
                        disabled={isRetrying}
                      >
                        {isRetrying ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
                        {isRetrying ? 'Retrying...' : 'Run Verification Again'}
                      </button>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px',
                        borderRadius: '8px',
                        background: isVerified
                          ? 'rgba(16, 185, 129, 0.1)'
                          : 'rgba(244, 63, 94, 0.1)',
                        border: `1px solid ${
                          isVerified ? '#10b981' : '#f43f5e'
                        }`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {isVerified ? (
                          <CheckCircle2 size={24} color="#10b981" />
                        ) : (
                          <AlertTriangle size={24} color="#f43f5e" />
                        )}
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '15px' }}>
                            {isVerified
                              ? 'VERIFICATION PASSED'
                              : 'VERIFICATION CHECKS FAILED'}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            Status: <code>{activeTask.verification.overallStatus}</code> • Commands executed: {activeTask.verification.results?.length || 0}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`log-badge ${
                          isVerified ? 'success' : 'error'
                        }`}
                      >
                        OVERALL: {activeTask.verification.overallStatus}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {activeTask.verification.results.map((result, idx) => (
                        <div key={idx} className="diff-container" style={{ border: result.status === 'PASS' ? '1px solid #10b981' : '1px solid #f43f5e' }}>
                          <div className="diff-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {result.status === 'PASS' ? <CheckCircle2 size={15} color="#10b981" /> : <XCircle size={15} color="#f43f5e" />}
                              <span style={{ fontWeight: 600 }}>{result.command}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{(result.durationMs / 1000).toFixed(1)}s</span>
                              <span className={`log-badge ${result.status === 'PASS' ? 'success' : 'error'}`}>
                                EXIT CODE: {result.exitCode}
                              </span>
                            </div>
                          </div>
                          
                          {result.summary && (
                            <div style={{ padding: '12px 16px', background: 'rgba(244, 63, 94, 0.05)', borderBottom: '1px solid #1e293b' }}>
                              <strong style={{ color: '#f43f5e', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Failure Summary:</strong>
                              <pre style={{ margin: 0, color: 'var(--text-primary)', fontSize: '12px', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' }}>{result.summary}</pre>
                            </div>
                          )}

                          <pre
                            style={{
                              padding: '16px',
                              background: '#050811',
                              fontFamily: 'var(--font-mono)',
                              fontSize: '12px',
                              color: 'var(--text-primary)',
                              maxHeight: '300px',
                              overflowY: 'auto',
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {result.stdout || result.stderr || 'Execution completed without output.'}
                          </pre>
                        </div>
                      ))}
                    </div>

                    {activeTask.verificationHistory && activeTask.verificationHistory.length > 0 && (
                      <div className="diff-container" style={{ marginTop: '20px' }}>
                        <div className="diff-header">
                          <span style={{ fontWeight: 600 }}>Verification History</span>
                        </div>
                        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {activeTask.verificationHistory.map((hist, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#1e293b', borderRadius: '4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Attempt {activeTask.verificationHistory!.length - idx}</span>
                                {hist.overallStatus === 'PASS' ? <CheckCircle2 size={14} color="#10b981" /> : <XCircle size={14} color="#f43f5e" />}
                                <span style={{ fontSize: '13px' }}>{new Date(hist.ranAt).toLocaleString()}</span>
                              </div>
                              <span className={`log-badge ${hist.overallStatus === 'PASS' ? 'success' : 'error'}`}>
                                {hist.overallStatus}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                    Verification suite runs automatically after human patch approval.
                  </div>
                )}
              </div>
            )}

            {/* TAB: Context Files */}
            {activeTab === 'context' && (
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: 'var(--bg-panel)',
                    borderRadius: '6px',
                    fontSize: '12.5px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Shield size={16} color="#10b981" />
                    <span><strong>Security Filter Active:</strong> Secrets, <code>.env</code> files, and binary assets are strictly excluded.</span>
                  </div>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Total Context: {activeTask?.extractedContext?.length || 0} files
                  </span>
                </div>

                {activeTask?.extractedContext && activeTask.extractedContext.length > 0 ? (
                  activeTask.extractedContext.map((file, idx) => (
                    <div key={idx} className="diff-container">
                      <div className="diff-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileCode size={15} color="#38bdf8" />
                          <span style={{ fontWeight: 600, color: '#38bdf8' }}>{file.path}</span>
                          <span className="log-badge info">{file.language}</span>
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {Math.round(file.sizeBytes / 1024)} KB
                        </span>
                      </div>
                      <pre
                        style={{
                          padding: '14px',
                          background: '#050811',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '12px',
                          color: 'var(--text-primary)',
                          maxHeight: '260px',
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {file.content}
                      </pre>
                    </div>
                  ))
                ) : (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                    No context files extracted yet.
                  </div>
                )}
              </div>
            )}

            {/* TAB: Terminal Log Stream */}
            {activeTab === 'terminal' && (
              <div className="terminal-window">
                {activeTask?.logs && activeTask.logs.length > 0 ? (
                  activeTask.logs.map((log) => (
                    <div key={log.id} className="log-line">
                      <span className="log-time">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`log-badge ${log.level}`}>
                        {log.stage}
                      </span>
                      <span className="log-msg">{log.message}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ color: 'var(--text-muted)', padding: '24px', textAlign: 'center' }}>
                    Agent console ready.
                  </div>
                )}
              </div>
            )}

            {/* TAB: Repository Explorer */}
            {activeTab === 'files' && (
              <div style={{ padding: '20px' }}>
                <h4 style={{ fontSize: '13px', marginBottom: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Filesystem Structure ({repoStructure?.totalFiles || 0} files)
                </h4>
                <div
                  style={{
                    background: '#050811',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    padding: '12px',
                    maxHeight: '400px',
                    overflowY: 'auto',
                  }}
                >
                  {repoStructure?.fileTree ? (
                    renderFileTree(repoStructure.fileTree)
                  ) : (
                    <div style={{ color: 'var(--text-muted)', padding: '12px' }}>Loading filesystem tree...</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Clone / Connect Repository Modal */}
      {showCloneModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            className="card-panel"
            style={{ width: '480px', maxWidth: '90vw' }}
          >
            <div className="card-header">
              <div className="card-title">
                <FolderGit2 size={16} color="#38bdf8" />
                <span>Connect Repository</span>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowCloneModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddRepo} className="card-body">
              <div className="form-group">
                <label className="form-label">Clone from Remote GitHub URL</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="https://github.com/owner/repository.git"
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                />
              </div>

              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>— OR —</div>

              <div className="form-group">
                <label className="form-label">Local Workspace Folder Path</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="C:\path\to\existing\project"
                  value={localClonePath}
                  onChange={(e) => setLocalClonePath(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCloneModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isCloning || (!cloneUrl.trim() && !localClonePath.trim())}
                >
                  {isCloning ? 'Connecting...' : 'Connect Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function renderFileTree(nodes: FileNode[], depth = 0): React.ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: depth > 0 ? '16px' : '0' }}>
      {nodes.map((node) => (
        <div key={node.path}>
          <div className={`tree-node ${node.type === 'file' ? 'file' : ''}`}>
            {node.type === 'directory' ? (
              <FolderGit2 size={14} color="#f59e0b" />
            ) : (
              <FileCode size={14} color="#38bdf8" />
            )}
            <span>{node.name}</span>
            {node.sizeBytes && (
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {Math.round(node.sizeBytes / 1024)} KB
              </span>
            )}
          </div>
          {node.children && renderFileTree(node.children, depth + 1)}
        </div>
      ))}
    </div>
  );
}
