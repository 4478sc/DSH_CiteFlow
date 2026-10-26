import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FilePlus2,
  FileText,
  Hash,
  Link2,
  Loader2,
  PanelRightClose,
  Sparkles,
  Quote,
  Star,
  X,
} from 'lucide-react';
import type { Insight, Reference, ToastKind } from '../types';
import api, { getPaperInsight, startPaperInsight } from '../services/api';
import {
  typeAbbreviation,
  typeLabels,
  formatBibtexReference,
  formatCitation,
  formatDate,
  getVenue,
  copyText,
} from '../utils/format';

interface ReferenceDetailProps {
  reference: Reference | null;
  onClose: () => void;
  onAttachPdf: () => void;
  onNotify: (kind: ToastKind, title: string, description?: string) => void;
}

export default function ReferenceDetail({
  reference,
  onClose,
  onAttachPdf,
  onNotify,
}: ReferenceDetailProps) {
  const [abstractExpanded, setAbstractExpanded] = useState(false);
  const [citationFormat, setCitationFormat] = useState<'apa' | 'bibtex'>('apa');
  const [copied, setCopied] = useState<string | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightBusy, setInsightBusy] = useState(false);
  const [insightOpen, setInsightOpen] = useState(false);
  // 只有带 PDF 附件的论文才允许生成归纳（后端同样会校验）。
  const hasPdf = insight?.hasPdf ?? Boolean(reference?.pdfPath);
  const pollTimer = useRef<number | null>(null);
  const pollTimeout = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current != null) {
      window.clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    if (pollTimeout.current != null) {
      window.clearTimeout(pollTimeout.current);
      pollTimeout.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (paperId: number) => {
      stopPolling();
      const tick = async () => {
        try {
          const next = await getPaperInsight(paperId);
          setInsight((current) =>
            current && current.id === paperId ? { ...next, id: paperId } : current,
          );
          if (next.status === 'ready' || next.status === 'error') {
            setInsightBusy(false);
            if (next.status === 'ready') setInsightOpen(true);
            stopPolling();
          }
        } catch {
          // Keep polling until the timeout below ends the loop.
        }
      };
      pollTimer.current = window.setInterval(() => void tick(), 2000);
      pollTimeout.current = window.setTimeout(() => {
        setInsight((current) =>
          current && current.id === paperId
            ? { ...current, status: 'error', error: '归纳生成超时，请稍后重试。' }
            : current,
        );
        setInsightBusy(false);
        stopPolling();
      }, 300000);
    },
    [stopPolling],
  );

  useEffect(() => {
    let active = true;
    stopPolling();
    setInsightBusy(false);
    setInsightOpen(false);
    if (!reference) {
      setInsight(null);
      setInsightLoading(false);
      return () => {
        active = false;
      };
    }
    const paperId = reference.id;
    setInsight(null);
    setInsightLoading(true);
    getPaperInsight(paperId)
      .then((value) => {
        if (active) setInsight({ ...value, id: paperId });
      })
      .catch(() => {
        if (active) setInsight({ status: 'none', id: paperId });
      })
      .finally(() => {
        if (active) setInsightLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reference?.id, stopPolling]);

  useEffect(() => {
    if (!reference || insight?.id !== reference.id) return;
    if (insight.status === 'pending' || insight.status === 'running') {
      setInsightBusy(true);
      startPolling(reference.id);
    }
  }, [reference?.id, insight?.id, insight?.status, startPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const handleGenerateInsight = async () => {
    if (!reference || insightBusy) return;
    if (!hasPdf) {
      onNotify('info', '无法生成归纳', '该论文还没有 PDF 附件，请先上传 PDF。');
      return;
    }
    setInsightBusy(true);
    try {
      const started = await startPaperInsight(reference.id);
      setInsight({
        ...started,
        id: reference.id,
        status: started.status === 'ready' ? 'ready' : 'pending',
      });
      if (started.status === 'ready') setInsightOpen(true);
      onNotify('success', '归纳生成已开始', '请稍候，归纳完成后会自动显示。');
      startPolling(reference.id);
    } catch (error) {
      setInsightBusy(false);
      onNotify('error', '归纳生成失败', api.errorMessage(error));
    }
  };

  const abstract = reference?.abstract ?? '';
  const abstractIsLong = abstract.length > 420;
  const citation = useMemo(() => {
    if (!reference) return '';
    return citationFormat === 'apa' ? formatCitation(reference) : formatBibtexReference(reference);
  }, [citationFormat, reference]);

  const pdfUrl = useMemo(() => {
    if (!reference?.pdfPath) return null;
    if (/^https?:\/\//i.test(reference.pdfPath) || reference.pdfPath.startsWith('/') ) return reference.pdfPath;
    return `/api/v1/files/${reference.id}/content`;
  }, [reference]);

  const handleCopy = async (text: string, field: string) => {
    if (!text) return;
    await copyText(text);
    setCopied(field);
    window.setTimeout(() => setCopied(null), 1800);
    onNotify('success', 'Copied to clipboard', field === 'doi' ? 'DOI copied.' : 'Formatted citation copied.');
  };

  if (!reference) {
    return (
      <aside className="detail-panel is-empty" aria-label="Reference details">
        <div className="detail-topbar">
          <span className="detail-topbar-title">
            <PanelRightClose size={14} />
            Reference details
          </span>
        </div>
        <div className="detail-empty">
          <div className="empty-orbit" aria-hidden="true">
            <span className="orbit-ring" />
            <span className="orbit-icon">
              <BookOpen size={27} strokeWidth={1.5} />
            </span>
            <span className="orbit-dot" />
          </div>
          <h2>Select a reference</h2>
          <p>Choose a paper from your library to see its abstract, publication details and formatted citation.</p>
          <span className="detail-empty-hint">
            <kbd>Click</kbd> any row to open it here
          </span>
        </div>
      </aside>
    );
  }

  const details: Array<[string, string | undefined]> = [
    ['Journal', reference.journal],
    ['Book title', reference.booktitle],
    ['Volume', reference.volume],
    ['Issue', reference.issue],
    ['Pages', reference.pages],
    ['Publisher', reference.publisher],
    ['School', reference.school],
    ['Published', reference.year?.toString()],
    ['Added', formatDate(reference.createdAt)],
    ['Import source', reference.importedFrom],
  ];
  const visibleDetails = details.filter(([, value]) => Boolean(value));
  const insightGenerating =
    insightBusy || insight?.status === 'pending' || insight?.status === 'running';

  return (
    <aside className="detail-panel" aria-label="Reference details">
      <div className="detail-topbar">
        <span className="detail-topbar-title">
          <PanelRightClose size={14} />
          Reference details
        </span>
        <div className="detail-topbar-actions">
          {reference.starred && (
            <span className="detail-starred" title="Starred reference">
              <Star size={13} fill="currentColor" />
            </span>
          )}
          <button className="icon-button" onClick={onClose} aria-label="Close details">
            <X size={17} />
          </button>
        </div>
      </div>

      <div className="detail-scroll">
        <div className="detail-heading">
          <div className="detail-badges">
            <span className={`type-badge type-${reference.type}`}>
              {typeAbbreviation(reference)} · {typeLabels[reference.type]}
            </span>
          </div>
          <h2 className="detail-title">{reference.title}</h2>
          <p className="detail-authors">{reference.authors.length ? reference.authors.join(', ') : 'Unknown authors'}</p>
          <div className="detail-venue-line">
            <span className="detail-venue">{getVenue(reference)}</span>
            {reference.year && (
              <>
                <span className="detail-separator" />
                <span>{reference.year}</span>
              </>
            )}
          </div>
        </div>

        <div className="detail-actions-row">
          {pdfUrl ? (
            <>
              <a className="button button-accent detail-primary-action" href={pdfUrl} target="_blank" rel="noreferrer">
                <FileText size={15} />
                Open PDF
                <ArrowUpRight size={13} />
              </a>
              <button
                className="button button-quiet detail-copy-action"
                onClick={onAttachPdf}
                title="上传新的 PDF 并替换当前附件"
              >
                <FilePlus2 size={14} />
                替换 PDF
              </button>
            </>
          ) : (
            <button className="button button-accent detail-primary-action" onClick={onAttachPdf} title="上传 PDF 附件">
              <FilePlus2 size={15} />
              Attach PDF
            </button>
          )}
          <button className="button button-quiet detail-copy-action" onClick={() => void handleCopy(citation, 'citation')}>
            {copied === 'citation' ? <Check size={14} /> : <Copy size={14} />}
            {copied === 'citation' ? 'Copied' : 'Cite'}
          </button>
          <button
            className="button button-quiet detail-copy-action"
            onClick={() => void handleGenerateInsight()}
            disabled={insightGenerating || !hasPdf}
            title={hasPdf ? '根据论文 PDF 生成六字段归纳' : '该论文还没有 PDF 附件，请先上传 PDF'}
          >
            {insightGenerating ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
            {insightGenerating ? '生成中…' : insight?.status === 'ready' ? '重新归纳' : '生成归纳'}
          </button>
        </div>

        <section className="detail-section abstract-section">
          <div className="section-title-row">
            <h3>Abstract</h3>
            {abstractIsLong && (
              <button className="text-button" onClick={() => setAbstractExpanded((current) => !current)}>
                {abstractExpanded ? 'Show less' : 'Read full'}
                <ChevronDown size={12} className={abstractExpanded ? 'chevron-open' : ''} />
              </button>
            )}
          </div>
          {abstract ? (
            <p className={`abstract-text ${abstractIsLong && !abstractExpanded ? 'is-clamped' : ''}`}>{abstract}</p>
          ) : (
            <p className="abstract-empty">No abstract has been added for this reference.</p>
          )}
        </section>

        <section className="detail-section insight-section" aria-live="polite">
          <div className="section-title-row">
            <h3>AI 归纳</h3>
            {insight?.status === 'ready' && (
              <button
                className="text-button"
                onClick={() => setInsightOpen((value) => !value)}
                aria-expanded={insightOpen}
              >
                {insightOpen ? '收起' : '查看归纳'}
                <ChevronDown size={12} className={insightOpen ? 'chevron-open' : ''} />
              </button>
            )}
          </div>
          {insightLoading ? (
            <p className="abstract-empty">正在读取归纳…</p>
          ) : insight?.status === 'ready' ? (
            insightOpen ? (
              <div className="insight-preview">
                {[
                  ['目的', insight.purpose],
                  ['贡献', insight.contribution],
                  ['方法', insight.method],
                  ['结果', insight.results],
                  ['局限', insight.limitations],
                  ['感想 / 可复用点', insight.reflection],
                ].map(([label, value]) => (
                  <div className="insight-field" key={label}>
                    <span>{label}</span>
                    <p>{value || '未提及'}</p>
                  </div>
                ))}
                <div className="insight-meta">
                  <Sparkles size={11} />
                  {insight.model || 'AI'}
                  {insight.generatedAt && (
                    <>
                      <span className="provenance-dot" />
                      {formatDate(insight.generatedAt)}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <p className="abstract-empty">归纳已生成，点击“查看归纳”展开六个字段。</p>
            )
          ) : insightGenerating ? (
            <p className="insight-status">
              <Loader2 size={12} className="spin" />
              正在阅读 PDF 并生成归纳，通常需要 1–3 分钟…
            </p>
          ) : insight?.status === 'error' ? (
            <p className="abstract-empty is-error">生成失败：{insight.error || '请稍后重试。'}</p>
          ) : !hasPdf ? (
            <p className="abstract-empty">该论文还没有 PDF 附件，请先上传 PDF 后再生成归纳（归纳需要读取原文）。</p>
          ) : (
            <p className="abstract-empty">尚未生成归纳，点击上方“生成归纳”。</p>
          )}
        </section>

        {reference.keywords && reference.keywords.length > 0 && (
          <section className="detail-section keywords-section">
            <div className="section-title-row">
              <h3>Keywords</h3>
            </div>
            <div className="keyword-list">
              {reference.keywords.map((keyword) => (
                <span className="keyword-chip" key={keyword}>
                  {keyword}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="detail-section">
          <div className="section-title-row">
            <h3>Publication details</h3>
          </div>
          <dl className="metadata-grid">
            {visibleDetails.map(([label, value]) => (
              <div className="metadata-item" key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {(reference.doi || reference.url) && (
            <div className="detail-links">
              {reference.doi && (
                <div className="detail-link-row">
                  <Link2 size={14} />
                  <a href={`https://doi.org/${reference.doi}`} target="_blank" rel="noreferrer">
                    {reference.doi}
                  </a>
                  <button className="icon-button tiny" onClick={() => void handleCopy(reference.doi ?? '', 'doi')} aria-label="Copy DOI">
                    {copied === 'doi' ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              )}
              {reference.url && (
                <div className="detail-link-row">
                  <ExternalLink size={14} />
                  <a href={reference.url} target="_blank" rel="noreferrer" title={reference.url}>
                    {reference.url.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="detail-section citation-section">
          <div className="section-title-row citation-title-row">
            <h3>
              <Quote size={13} />
              Citation
            </h3>
            <div className="citation-toggle">
              <button
                className={citationFormat === 'apa' ? 'is-active' : ''}
                onClick={() => setCitationFormat('apa')}
              >
                APA
              </button>
              <button
                className={citationFormat === 'bibtex' ? 'is-active' : ''}
                onClick={() => setCitationFormat('bibtex')}
              >
                BibTeX
              </button>
            </div>
          </div>
          <div className="citation-card">
            <pre className={`citation-text ${citationFormat === 'apa' ? 'is-apa' : 'is-bibtex'}`}>{citation}</pre>
            <button
              className="citation-copy"
              onClick={() => void handleCopy(citation, 'citation')}
              aria-label="Copy citation"
            >
              {copied === 'citation' ? <Check size={13} /> : <Copy size={13} />}
              {copied === 'citation' ? 'Copied' : 'Copy'}
            </button>
          </div>
        </section>

        <section className="detail-section files-section">
          <div className="section-title-row">
            <h3>Attachments</h3>
          </div>
          {pdfUrl ? (
            <a className="attachment-card" href={pdfUrl} target="_blank" rel="noreferrer">
              <span className="attachment-icon">
                <FileText size={17} />
              </span>
              <span className="attachment-copy">
                <strong>{reference.pdfPath?.split('/').pop() || 'Full text.pdf'}</strong>
                <small>PDF · Open attachment</small>
              </span>
              <ExternalLink size={14} />
            </a>
          ) : (
            <button className="attachment-empty" onClick={onAttachPdf}>
              <span className="attachment-icon is-empty">
                <FilePlus2 size={17} />
              </span>
              <span className="attachment-copy">
                <strong>No PDF attached</strong>
                <small>Add a PDF to keep the full text close by</small>
              </span>
              <span className="attachment-add">Add</span>
            </button>
          )}
        </section>

        <div className="detail-provenance">
          <CalendarDays size={12} />
          {reference.createdAt ? `Added ${formatDate(reference.createdAt)}` : 'Added recently'}
          {reference.citationKey && (
            <>
              <span className="provenance-dot" />
              <Hash size={11} />
              {reference.citationKey}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}