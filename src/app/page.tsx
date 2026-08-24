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
} from 'lucide-react';
import { Repository, TaskRun, FileNode, ProjectStructure, TaskStage } from '@/types';

export default function DashboardPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [repoStructure, setRepoStructure] = useState<ProjectStructure | null>(null);

  const [prompt, setPrompt] = useState<string>('');
  const [activeTask, setActiveTask] = useState<TaskRun | null>(null);
  const [recentTasks, setRecentTasks] = useState<TaskRun[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'terminal' | 'plan' | 'diff' | 'verification' | 'files'>('terminal');

  const [isCloning, setIsCloning] = useState<boolean>(false);
  const [showCloneModal, setShowCloneModal] = useState<boolean>(false);
  const [cloneUrl, setCloneUrl] = useState<string>('');
  const [localClonePath, setLocalClonePath] = useState<string>('');

  const [systemHealth, setSystemHealth] = useState<{
    gitVersion: string;
    nodeVersion: string;
    aiProvider: string;
  } | null>(null);

  // Preset prompts for rapid developer testing
  const presets = [
    {
      title: 'Analyze Project Architecture',
      prompt: 'Scan codebase structure, entrypoints, and verify test runner configuration.',
    },
    {
      title: 'Add Input Validation',
      prompt: 'Inspect API route handlers and add robust validation for incoming task payloads.',
    },
    {
      title: 'Fix Verification Runner',
      prompt: 'Investigate test execution timeout handling and ensure stderr is properly captured.',
    },
  ];

  // Fetch initial data
  useEffect(() => {
    fetchHealth();
    fetchRepositories();
    fetchTasks();
  }, []);

  // When selected repo changes, load its structure
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
      // 1. Create task
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

      // 2. Run agent pipeline
      const runRes = await fetch(`/api/tasks/${initialTask.id}/run`, {
        method: 'POST',
      });

      if (runRes.ok) {
        const runData = await runRes.json();
        setActiveTask(runData.task);
        setRecentTasks((prev) =>
          prev.map((t) => (t.id === runData.task.id ? runData.task : t))
        );
      }
    } catch (err) {
      console.error('Agent execution error:', err);
    } finally {
      setIsRunning(false);
    }
  }

  // Calculate quick metrics
  const totalCompleted = recentTasks.filter((t) => t.status === 'completed').length;
  const verificationPassedCount = recentTasks.filter((t) => t.verification?.passed).length;
  const verificationRate = recentTasks.length > 0 ? Math.round((verificationPassedCount / recentTasks.length) * 100) : 100;

  return (
    <div>
      {/* Top Stats Banner */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <span>CONNECTED WORKSPACES</span>
            <FolderGit2 size={16} color="#38bdf8" />
          </div>
          <div className="stat-value">{repositories.length}</div>
          <div className="stat-sub">
            {selectedRepo ? selectedRepo.name : 'No active workspace'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span>AGENT TASKS PROCESSED</span>
            <Sparkles size={16} color="#8b5cf6" />
          </div>
          <div className="stat-value">{recentTasks.length}</div>
          <div className="stat-sub">{totalCompleted} succeeded</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span>VERIFICATION PASS RATE</span>
            <ShieldCheck size={16} color="#10b981" />
          </div>
          <div className="stat-value">{verificationRate}%</div>
          <div className="stat-sub">Real test suite executions</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span>RUNTIME ENVIRONMENT</span>
            <Terminal size={16} color="#f59e0b" />
          </div>
          <div className="stat-value" style={{ fontSize: '16px' }}>
            {systemHealth?.gitVersion?.slice(0, 15) || 'Git Available'}
          </div>
          <div className="stat-sub">Node {systemHealth?.nodeVersion || 'v20+'} (Local Host)</div>
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
                <label className="form-label">Instruction / Bug Description</label>
                <textarea
                  className="form-textarea"
                  placeholder="e.g., Scan project structure, identify test configurations, and add input validation..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                />
              </div>

              {/* Preset prompt pills */}
              <div className="form-group">
                <label className="form-label">Quick Scenarios</label>
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
                    <RefreshCw size={15} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Agent Orchestrating...</span>
                  </>
                ) : (
                  <>
                    <Play size={15} />
                    <span>Launch DevForge Agent</span>
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
                  <span>Recent Executions</span>
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
                          t.status === 'completed' ? 'success' : t.status === 'failed' ? 'error' : 'info'
                        }`}
                      >
                        {t.status}
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
          {/* 6-Stage Pipeline Tracker */}
          <div className="card-panel">
            <div className="card-header">
              <div className="card-title">
                <Layers size={16} color="#38bdf8" />
                <span>Agent Execution Pipeline</span>
              </div>
              {activeTask && (
                <span
                  className={`log-badge ${
                    activeTask.status === 'completed'
                      ? 'success'
                      : activeTask.status === 'failed'
                      ? 'error'
                      : 'info'
                  }`}
                >
                  STATUS: {activeTask.status.toUpperCase()}
                </span>
              )}
            </div>

            {/* Stages Row */}
            <div className="pipeline-steps">
              {(
                activeTask?.stages || [
                  { id: 'structure_analysis', name: '1. Structure Scan', status: 'pending' },
                  { id: 'file_identification', name: '2. Target Files', status: 'pending' },
                  { id: 'solution_plan', name: '3. Plan & Reason', status: 'pending' },
                  { id: 'code_modification', name: '4. Code Patch', status: 'pending' },
                  { id: 'verification', name: '5. Verification', status: 'pending' },
                  { id: 'summary', name: '6. Review & Diff', status: 'pending' },
                ]
              ).map((st, idx, arr) => {
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
                className={`tab-btn ${activeTab === 'terminal' ? 'active' : ''}`}
                onClick={() => setActiveTab('terminal')}
              >
                <Terminal size={15} /> Console Stream ({activeTask?.logs?.length || 0})
              </button>
              <button
                className={`tab-btn ${activeTab === 'plan' ? 'active' : ''}`}
                onClick={() => setActiveTab('plan')}
              >
                <FileText size={15} /> Solution Plan
              </button>
              <button
                className={`tab-btn ${activeTab === 'diff' ? 'active' : ''}`}
                onClick={() => setActiveTab('diff')}
              >
                <Code2 size={15} /> Code Changes ({activeTask?.changes?.length || 0})
              </button>
              <button
                className={`tab-btn ${activeTab === 'verification' ? 'active' : ''}`}
                onClick={() => setActiveTab('verification')}
              >
                <ShieldCheck size={15} /> Verification Results
              </button>
              <button
                className={`tab-btn ${activeTab === 'files' ? 'active' : ''}`}
                onClick={() => setActiveTab('files')}
              >
                <FileCode size={15} /> Repository Explorer
              </button>
            </div>

            {/* Tab 1: Terminal Log Stream */}
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
                    Agent console ready. Select a prompt or type your instructions and click "Launch DevForge Agent".
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Solution Plan & Diagnostics */}
            {activeTab === 'plan' && (
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {activeTask?.plan ? (
                  <>
                    <div
                      style={{
                        padding: '14px 16px',
                        background: 'var(--bg-panel)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <h4 style={{ fontSize: '14px', marginBottom: '8px', color: '#38bdf8' }}>
                        Problem Diagnosis & Strategy
                      </h4>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        {activeTask.plan.problemExplanation}
                      </p>
                    </div>

                    <div>
                      <h4 style={{ fontSize: '13px', marginBottom: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        Proposed Resolution Steps
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {activeTask.plan.steps.map((step, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '10px 14px',
                              background: 'var(--bg-input)',
                              borderRadius: '6px',
                              fontSize: '13px',
                            }}
                          >
                            <span
                              style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                background: 'var(--cyan-glow)',
                                color: '#38bdf8',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {idx + 1}
                            </span>
                            <span>{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Relevant Target Files */}
                    {activeTask.relevantFiles && activeTask.relevantFiles.length > 0 && (
                      <div>
                        <h4 style={{ fontSize: '13px', marginBottom: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                          Identified Context Files
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {activeTask.relevantFiles.map((rf, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '8px 12px',
                                background: 'var(--bg-input)',
                                borderRadius: '6px',
                                fontSize: '12.5px',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              <span style={{ color: '#38bdf8' }}>{rf.path}</span>
                              <span className="log-badge info">Relevance: {rf.relevanceScore}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                    No solution plan generated yet. Run an agent task to generate architectural diagnosis.
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Code Changes & Diff */}
            {activeTab === 'diff' && (
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {activeTask?.changes && activeTask.changes.length > 0 ? (
                  activeTask.changes.map((change, idx) => (
                    <div key={idx} className="diff-container">
                      <div className="diff-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileCode size={15} color="#38bdf8" />
                          <span>{change.path}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <span style={{ color: '#6ee7b7' }}>+{change.linesAdded} lines</span>
                          <span style={{ color: '#fda4af' }}>-{change.linesRemoved} lines</span>
                        </div>
                      </div>
                      <div className="diff-body">
                        {change.diffHunks.map((hunk, hIdx) => (
                          <div
                            key={hIdx}
                            className={`diff-line ${
                              hunk.startsWith('+')
                                ? 'add'
                                : hunk.startsWith('-')
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
                    No code changes staged yet.
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Verification & Test Results */}
            {activeTab === 'verification' && (
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {activeTask?.verification ? (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px',
                        borderRadius: '8px',
                        background: activeTask.verification.passed
                          ? 'rgba(16, 185, 129, 0.1)'
                          : 'rgba(244, 63, 94, 0.1)',
                        border: `1px solid ${
                          activeTask.verification.passed ? '#10b981' : '#f43f5e'
                        }`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {activeTask.verification.passed ? (
                          <CheckCircle2 size={24} color="#10b981" />
                        ) : (
                          <AlertTriangle size={24} color="#f43f5e" />
                        )}
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '15px' }}>
                            {activeTask.verification.passed
                              ? 'VERIFICATION PASSED'
                              : 'VERIFICATION CHECKS COMPLETED'}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            Command: <code>{activeTask.verification.command}</code> • Execution time: {activeTask.verification.durationMs}ms
                          </div>
                        </div>
                      </div>
                      <span
                        className={`log-badge ${
                          activeTask.verification.passed ? 'success' : 'warn'
                        }`}
                      >
                        EXIT CODE: {activeTask.verification.exitCode}
                      </span>
                    </div>

                    {/* Output terminal */}
                    <div className="diff-container">
                      <div className="diff-header">
                        <span>Execution Output (stdout / stderr)</span>
                      </div>
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
                        {activeTask.verification.stdout || activeTask.verification.stderr || 'No console output logged.'}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                    No verification suite executed for this task yet.
                  </div>
                )}
              </div>
            )}

            {/* Tab 5: Repository Explorer */}
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
