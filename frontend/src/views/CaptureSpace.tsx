import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  FileText,
  FileType2,
  Link2,
  LoaderCircle,
  MessageSquareWarning,
  Send,
  SkipForward,
  Sparkles,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react'

import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import type { DraftTask, TaskInput } from '@/types'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

const SOURCE_CARDS = [
  {
    key: 'text' as const,
    icon: FileText,
    title: 'Paste text',
    body: 'Brain-dumps, meeting notes, half-formed plans.',
    bg: 'bg-white',
    rotate: '-rotate-1',
  },
  {
    key: 'markdown' as const,
    icon: FileType2,
    title: 'Markdown file',
    body: '# Headings become projects. Checkboxes become quests.',
    bg: 'bg-secondary',
    rotate: 'rotate-1',
  },
  {
    key: 'pdf' as const,
    icon: Upload,
    title: 'PDF',
    body: 'Specs, briefs, syllabi — parsed locally page by page.',
    bg: 'bg-muted',
    rotate: '-rotate-1',
  },
]

const EXTRACTING_LINES = [
  'Reading between the lines…',
  'Spotting what depends on what…',
  'Estimating effort…',
  'Drafting your quests…',
]

interface TranscriptEntry {
  id: string
  role: 'ai' | 'user'
  text: string
}

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            'border-2 border-black transition-all duration-100',
            i === step
              ? 'h-3 w-8 bg-secondary neo-shadow-sm'
              : i < step
                ? 'size-3 bg-primary'
                : 'size-3 bg-white',
          )}
        />
      ))}
    </div>
  )
}

export function CaptureSpace() {
  const batch = useStore((s) => s.batch)
  const captureStep = useStore((s) => s.captureStep)
  const captureSource = useStore((s) => s.captureSource)
  const setCaptureSource = useStore((s) => s.setCaptureSource)
  const setCaptureStep = useStore((s) => s.setCaptureStep)
  const startImport = useStore((s) => s.startImport)
  const answerBatchAction = useStore((s) => s.answerBatch)
  const skipInterviewBatch = useStore((s) => s.skipInterviewBatch)
  const confirmImport = useStore((s) => s.confirmImport)
  const discardImport = useStore((s) => s.discardImport)
  const saveTask = useStore((s) => s.saveTask)
  const deleteTask = useStore((s) => s.deleteTask)
  const setView = useStore((s) => s.setView)

  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [lineIndex, setLineIndex] = useState(0)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [currentAnswer, setCurrentAnswer] = useState<
    string | string[] | Record<string, string>
  >('')
  const [applySimilar, setApplySimilar] = useState(false)
  const [sending, setSending] = useState(false)
  const [accepted, setAccepted] = useState<Record<number, number[]>>({})
  const [depToggles, setDepToggles] = useState<Record<number, number[]>>({})
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const questions = batch?.questions ?? []
  const activeQuestion = questions[0]
  const siblingCount =
    activeQuestion?.field === 'discovery' || activeQuestion?.kind === 'duration_grid'
      ? Math.max(0, questions.length - 1)
      : 0

  useEffect(() => {
    if (captureStep !== 'extracting') return
    const timer = setInterval(() => setLineIndex((i) => (i + 1) % EXTRACTING_LINES.length), 1600)
    return () => clearInterval(timer)
  }, [captureStep])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [transcript.length, sending])

  useEffect(() => {
    setApplySimilar(false)
    if (activeQuestion?.kind === 'duration_grid') {
      const rows: Record<string, string> = {}
      for (const tid of activeQuestion.taskIds ?? []) rows[tid] = ''
      setCurrentAnswer(rows)
    } else {
      setCurrentAnswer('')
    }
  }, [activeQuestion?.id])

  const canSend = useMemo(() => {
    if (!activeQuestion || sending) return false
    const v = currentAnswer
    if (typeof v === 'object') {
      return Object.values(v).some((x) => x !== '' && x != null)
    }
    return typeof v === 'string' && v.trim().length > 0
  }, [currentAnswer, activeQuestion, sending])

  async function sendAnswer() {
    const q = activeQuestion
    if (!q || !canSend) return
    let value: string | Record<string, string> = ''
    if (typeof currentAnswer === 'object') {
      value = Object.fromEntries(Object.entries(currentAnswer).filter(([, v]) => v !== ''))
      value['*'] =
        (Object.entries(currentAnswer).find(([, v]) => v !== '')?.[1] as string) ?? '1'
    } else {
      value = currentAnswer
    }
    setSending(true)
    const summaryText =
      typeof value === 'object'
        ? Object.entries(value)
            .map(([tid, h]) => {
              const d = batch?.drafts.find((x) => x.id === Number(tid))
              return `${d?.title ?? tid}: ${h}h`
            })
            .join(' · ')
        : String(value)
    setTranscript((t) => [
      ...t,
      { id: `u-${q.id}`, role: 'user', text: summaryText },
    ])
    setCurrentAnswer('')
    await answerBatchAction([
      { questionId: q.id, value, applySimilar: applySimilar || undefined },
    ])
    setSending(false)
  }

  async function skipAll() {
    setSending(true)
    await skipInterviewBatch()
    setSending(false)
    setCaptureStep('review')
  }

  async function doConfirm() {
    const pairs = Object.entries(depToggles).flatMap(([taskId, ids]) =>
      ids.map((prerequisiteId) => ({ taskId: Number(taskId), prerequisiteId })),
    )
    const suggestionPairs = Object.entries(accepted).flatMap(([taskId, ids]) =>
      ids.map((prerequisiteId) => ({ taskId: Number(taskId), prerequisiteId })),
    )
    await confirmImport(pairs, suggestionPairs)
    setAccepted({})
    setDepToggles({})
    setCaptureStep('forged')
    setTimeout(() => {
      setView('nextup')
      setCaptureStep('source')
      setTranscript([])
    }, 2100)
  }

  function startFresh() {
    setCaptureSource(null)
    setText('')
    setFile(null)
    setTranscript([])
    setCurrentAnswer('')
  }

  const headerTitle =
    captureStep === 'source'
      ? 'What are we forging today?'
      : captureStep === 'input'
        ? 'Feed me the mess'
        : captureStep === 'extracting'
          ? 'Working…'
          : captureStep === 'interview'
            ? 'Quick questions'
            : captureStep === 'review'
              ? 'Almost there'
              : 'Forged.'

  const stepIndex =
    { source: 0, input: 0, extracting: 1, interview: 1, review: 2, failed: 2, forged: 3 }[captureStep] ?? 0

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden">
      <div className="pointer-events-none absolute -right-40 top-0 size-[400px] rounded-full bg-accent/8 blur-[110px]" />

      <header className="flex shrink-0 items-center gap-3 px-5 pt-5 sm:px-8">
        <AnimatePresence mode="wait">
          {(captureStep !== 'source' || batch) && (
            <motion.div key="back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (captureStep === 'input') setCaptureSource(null)
                  else if (!batch && captureStep === 'source') setView('home')
                  else if (batch) setView('graph')
                  else setView('home')
                }}
                title="Go back"
              >
                <ArrowLeft /> Back
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        <div>
          <h1 className="text-lg font-bold">{headerTitle}</h1>
          <p className="text-xs text-muted-foreground">
            {captureStep === 'review'
              ? `${batch?.drafts.length ?? 0} draft quest(s) — edit anything before it hits the tree`
              : 'Everything stays on this machine'}
          </p>
        </div>
        <div className="ml-auto">
          <StepDots step={stepIndex} />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={captureStep + (captureSource ?? '')}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22 }}
            className="mx-auto w-full max-w-xl px-4 py-8"
          >
            {captureStep === 'source' &&
              SOURCE_CARDS.map((card, i) => (
                <motion.button
                  key={card.key}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  onClick={() => setCaptureSource(card.key)}
                  className={cn(
                    'group mb-4 flex w-full cursor-pointer items-center gap-4 border-4 border-black p-5 text-left transition-all duration-100 ease-linear neo-shadow-md hover:-translate-y-1 hover:shadow-[12px_12px_0_0_#000]',
                    card.bg,
                    card.rotate,
                  )}
                >
                  <span className="flex size-14 shrink-0 items-center justify-center border-[3px] border-black bg-white">
                    <card.icon className="size-7 stroke-[2.5]" />
                  </span>
                  <span>
                    <span className="block text-lg font-black uppercase tracking-tight">{card.title}</span>
                    <span className="mt-1 block text-sm font-bold leading-snug">{card.body}</span>
                  </span>
                  <ArrowLeft className="ml-auto size-4 rotate-180 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </motion.button>
              ))}

            {captureStep === 'input' && captureSource === 'text' && (
              <>
                <Textarea
                  autoFocus
                  rows={9}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder='Dump everything. e.g. "Redesign site — copy first then dev then QA, launch mid-Sept. Also need to book photographer…"'
                />
                <Button size="lg" className="mt-4 w-full" disabled={text.trim() === ''} onClick={() => void startImport('text', text.trim())}>
                  <Sparkles /> Extract my quests
                </Button>
              </>
            )}

            {captureStep === 'input' && captureSource !== 'text' && captureSource && (
              <>
                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-14 text-center transition-colors hover:border-accent/60 hover:bg-secondary/30">
                  <Upload className="size-7 text-muted-foreground" />
                  <span className="text-sm font-medium">{file ? file.name : `Drop or choose a ${captureSource.toUpperCase()}`}</span>
                  <span className="text-xs text-muted-foreground">max 10 MB · parsed on this machine</span>
                  <input
                    type="file"
                    accept={captureSource === 'pdf' ? 'application/pdf,.pdf' : '.md,.markdown,text/markdown'}
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <Button size="lg" className="mt-4 w-full" disabled={!file} onClick={() => void startImport(captureSource, file!)}>
                  <Sparkles /> Extract my quests
                </Button>
              </>
            )}

            {captureStep === 'extracting' && (
              <div className="flex flex-col items-center py-16">
                <LoaderCircle className="size-12 animate-spin stroke-[2.5]" />
                <AnimatePresence mode="wait">
                  <motion.p
                    key={lineIndex}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="mt-8 rotate-1 border-4 border-black bg-secondary px-5 py-2 text-base font-black uppercase tracking-wide neo-shadow-md"
                  >
                    {EXTRACTING_LINES[lineIndex]}
                  </motion.p>
                </AnimatePresence>
              </div>
            )}

            {captureStep === 'interview' && (
              <div className="space-y-3">
                <div ref={scrollRef} className="max-h-[46vh] space-y-3 overflow-y-auto pr-1">
                  {transcript.map((entry) => (
                    <div key={entry.id} className={cn('flex', entry.role === 'user' && 'justify-end')}>
                      <div
                        className={cn(
                          'flex max-w-[85%] items-start gap-2 border-[3px] border-black px-3.5 py-2.5 text-sm font-bold shadow-[3px_3px_0_0_#000]',
                          entry.role === 'ai' ? 'bg-white' : 'ml-auto bg-secondary',
                        )}
                      >
                        {entry.role === 'ai' ? (
                          <Bot className="mt-0.5 size-4 shrink-0 stroke-[3]" />
                        ) : (
                          <User className="mt-0.5 size-4 shrink-0 stroke-[3]" />
                        )}
                        {entry.text}
                      </div>
                    </div>
                  ))}
                  {activeQuestion && (
                    <div className="flex items-start gap-2 border-[3px] border-black bg-secondary p-3.5 shadow-[3px_3px_0_0_#000]">
                      <Bot className="mt-0.5 size-4 shrink-0 stroke-[3]" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{activeQuestion.question}</p>
                        {(() => {
                          const task = batch?.drafts.find((d) => d.id === Number(activeQuestion.taskId))
                          return task && activeQuestion.kind !== 'duration_grid' ? (
                            <p className="mt-0.5 text-xs font-medium">about “{task.title}”</p>
                          ) : null
                        })()}
                      </div>
                    </div>
                  )}
                  {sending && (
                    <div className="flex items-center gap-2 pl-1 font-bold">
                      <span className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            className="size-1.5 bg-black"
                            animate={{ y: [0, -5, 0] }}
                            transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: 'linear' }}
                          />
                        ))}
                      </span>
                      THINKING…
                    </div>
                  )}
                </div>

                {activeQuestion && !sending && (
                  <div className="border-[3px] border-black bg-white p-3 neo-shadow-sm">
                    {activeQuestion.kind === 'duration_grid' && (
                      <div className="space-y-2">
                        {(activeQuestion.taskIds ?? []).map((tid) => {
                          const draft = batch?.drafts.find((d) => d.id === Number(tid))
                          const rows = (currentAnswer as Record<string, string>) || {}
                          return (
                            <div key={tid} className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-sm font-bold">
                                {draft?.title ?? tid}
                              </span>
                              <Input
                                type="number"
                                min="0.25"
                                step="0.25"
                                placeholder="hrs"
                                value={rows[tid] ?? ''}
                                onChange={(e) =>
                                  setCurrentAnswer((prev) => ({
                                    ...(typeof prev === 'object' && prev !== null && !Array.isArray(prev) ? prev : {}),
                                    [tid]: e.target.value,
                                  }))
                                }
                                className="h-10 w-24 shrink-0 text-center"
                              />
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {activeQuestion.kind === 'duration' && (
                      <Input
                        autoFocus
                        type="number"
                        min="0.25"
                        step="0.25"
                        placeholder="hours — e.g. 2.5"
                        value={(currentAnswer as string) || ''}
                        onChange={(e) => setCurrentAnswer(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void sendAnswer()}
                      />
                    )}
                    {activeQuestion.kind === 'choice' && (
                      <div className="flex flex-wrap gap-1.5">
                        {(activeQuestion.options ?? []).map((opt) => {
                          const multi = activeQuestion.field === 'dependencies'
                          const current = typeof currentAnswer === 'string' ? currentAnswer : ''
                          const arr = multi && Array.isArray(currentAnswer) ? (currentAnswer as unknown as string[]) : []
                          const checked = multi ? arr.includes(opt) : current === opt
                          return (
                            <button
                              key={opt}
                              onClick={() => {
                                if (!multi) return setCurrentAnswer(opt)
                                setCurrentAnswer(
                                  arr.includes(opt) ? arr.filter((o) => o !== opt) : [...arr, opt],
                                )
                              }}
                              className={cn(
                                'flex items-center gap-1.5 border-2 border-black px-2.5 py-1 text-xs font-bold transition-colors',
                                checked
                                  ? 'bg-secondary'
                                  : 'bg-white hover:bg-muted',
                              )}
                            >
                              {checked && <Check className="size-3" />} {opt}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {activeQuestion.kind === 'text' && (
                      <>
                        <Textarea
                          autoFocus
                          rows={2}
                          placeholder="Answer in your own words…"
                          value={(currentAnswer as string) || ''}
                          onChange={(e) => setCurrentAnswer(e.target.value)}
                        />
                        {siblingCount > 0 && (
                          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-bold uppercase tracking-wide">
                            <Checkbox
                              checked={applySimilar}
                              onCheckedChange={(v) => setApplySimilar(v === true)}
                            />
                            Apply this answer to {siblingCount} similar question
                            {siblingCount === 1 ? '' : 's'}
                          </label>
                        )}
                      </>
                    )}
                    <Button size="sm" className="mt-3 w-full" disabled={!canSend} onClick={() => void sendAnswer()}>
                      <Send /> Send{typeof currentAnswer === 'object' && Object.keys(currentAnswer).length > 0 ? ` (${Object.values(currentAnswer).filter((v) => v !== '').length} set)` : ''}
                    </Button>
                  </div>
                )}

                {!activeQuestion && !sending && (
                  <Button variant="outline" className="w-full" onClick={() => setCaptureStep('review')}>
                    Continue to review
                  </Button>
                )}

                <button
                  onClick={() => void skipAll()}
                  disabled={sending}
                  className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  <SkipForward className="size-3" /> Skip remaining — just guess
                </button>
              </div>
            )}

            {captureStep === 'review' && batch && (
              <div className="space-y-2">
                {batch.depCandidates.length > 0 && (
                  <div className="mb-3 rounded-xl border border-violet-400/30 bg-violet-950/20 p-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-300">
                      <Link2 className="size-3.5" /> Dependency links the AI inferred
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {batch.depCandidates.map((c) => {
                        const checked =
                          depToggles[c.dependentId]?.includes(c.prerequisiteId) ?? c.accepted
                        return (
                          <button
                            key={`${c.dependentId}-${c.prerequisiteId}`}
                            onClick={() =>
                              setDepToggles((prev) => {
                                const current =
                                  prev[c.dependentId] ??
                                  batch.depCandidates
                                    .filter((x) => x.dependentId === c.dependentId)
                                    .map((x) => x.prerequisiteId)
                                const list = current.includes(c.prerequisiteId)
                                  ? current.filter((id) => id !== c.prerequisiteId)
                                  : [...current, c.prerequisiteId]
                                return { ...prev, [c.dependentId]: list }
                              })
                            }
                            className={cn(
                              'flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                              checked
                                ? 'border-emerald-400/50 bg-emerald-950/30'
                                : 'border-border opacity-60 hover:opacity-90',
                            )}
                          >
                            <Checkbox checked={checked} className="mt-0.5" />
                            <span className="min-w-0 flex-1">
                              <span>
                                <b>{c.prerequisiteTitle}</b> before <b>{c.dependentTitle}</b>
                              </span>
                              {c.reason && (
                                <span className="block text-[11px] italic text-muted-foreground">
                                  “{c.reason}”
                                </span>
                              )}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {batch.drafts.map((draft) => (
                  <ReviewDraftRow key={draft.id} draft={draft} accepted={accepted} onToggleSuggestion={toggleSuggestionProxy(setAccepted)} onDelete={() => void deleteTask(draft.id)} onSave={saveTask} />
                ))}
                {batch.drafts.length === 0 && (
                  <p className="rounded-xl border border-border bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground">
                    No drafts left in this batch.
                  </p>
                )}
              </div>
            )}

            {captureStep === 'failed' && (
              <div className="flex flex-col items-center py-12 text-center">
                <div className="flex size-14 items-center justify-center rounded-full border border-red-400/40 bg-red-950/40">
                  <AlertTriangle className="size-6 text-red-400" />
                </div>
                <h2 className="mt-4 text-lg font-bold">
                  {(batch?.failedChunks ?? 0) > 0 ? 'Extraction failed' : 'Nothing quest-worthy found'}
                </h2>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {(batch?.failedChunks ?? 0) > 0
                    ? `All ${batch?.failedChunks} section(s) failed to extract — usually a rate limit on the free tier. Wait about a minute and try again.`
                    : 'The AI read your file but could not find actionable tasks to turn into quests. Try rephrasing or a different source.'}
                </p>
                {batch?.extractionErrors && batch.extractionErrors.length > 0 && (
                  <pre className="mt-3 max-h-24 w-full overflow-auto rounded-lg border border-border bg-background/60 p-2 text-left text-[11px] text-muted-foreground">
                    {batch.extractionErrors[0]}
                  </pre>
                )}
                <div className="mt-5 flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      discardImport().then(() => setCaptureSource(null))
                    }}
                  >
                    Choose another source
                  </Button>
                  <Button onClick={() => setCaptureStep('input')}>
                    <Upload /> Try again
                  </Button>
                </div>
              </div>
            )}

            {captureStep === 'forged' && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center py-20 text-center"
              >
                <motion.div
                  animate={{ rotate: [0, -12, 10, 0], scale: [1, 1.15, 1] }}
                  transition={{ duration: 0.7 }}
                >
                  <Sparkles className="size-12 text-primary drop-shadow-[0_0_18px_rgba(52,211,153,0.7)]" />
                </motion.div>
                <p className="mt-5 text-2xl font-bold">Forged.</p>
                <p className="mt-1 text-sm text-muted-foreground">Entering your dashboard…</p>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {captureStep === 'review' && batch && batch.drafts.length > 0 && (
        <footer className="shrink-0 border-t border-border/70 bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <p className="hidden text-xs text-muted-foreground sm:block">
              Confirming forges real quests, dependency links and priorities.
            </p>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDiscardOpen(true)}>
                <Trash2 /> Discard
              </Button>
              <Button
                size="sm"
                onClick={() => void doConfirm()}
              >
                <Check /> Confirm {batch.drafts.length} quest{batch.drafts.length === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        </footer>
      )}

      <ConfirmDialog
        open={confirmDiscardOpen}
        onClose={() => setConfirmDiscardOpen(false)}
        destructive
        confirmLabel="Discard everything"
        title={`Discard ${batch?.drafts.length ?? 0} draft quest(s)?`}
        description="Nothing has touched your real graph yet."
        onConfirm={async () => {
          await discardImport()
          startFresh()
        }}
      />
    </div>
  )
}

function toggleSuggestionProxy(
  setAccepted: Dispatch<SetStateAction<Record<number, number[]>>>,
) {
  return (draftId: number, prereqId: number) => {
    setAccepted((prev) => {
      const current = prev[draftId] ?? []
      const list = current.includes(prereqId)
        ? current.filter((id) => id !== prereqId)
        : [...current, prereqId]
      const next = { ...prev, [draftId]: list }
      if (list.length === 0) delete next[draftId]
      return next
    })
  }
}

function ReviewDraftRow({
  draft,
  accepted,
  onToggleSuggestion,
  onDelete,
  onSave,
}: {
  draft: DraftTask
  accepted: Record<number, number[]>
  onToggleSuggestion: (draftId: number, prereqId: number) => void
  onDelete: () => void
  onSave: (data: TaskInput, id?: number) => Promise<boolean>
}) {
  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState(draft.title)
  const [duration, setDuration] = useState(draft.duration_estimate?.toString() ?? '')
  const [importance, setImportance] = useState(draft.importance)
  const dirty =
    title !== draft.title ||
    duration !== (draft.duration_estimate?.toString() ?? '') ||
    importance !== draft.importance

  const lowFields = Object.entries(draft.belowThreshold)

  return (
    <div className="rounded-xl border border-border bg-card/60">
      <div className="flex items-center gap-2 px-3 py-2">
        <Badge variant={lowFields.length > 0 ? 'accent' : 'available'}>
          {lowFields.length > 0 ? `${lowFields.length} unclear` : 'ready'}
        </Badge>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1 hover:border-input focus-visible:border-ring"
        />
        {draft.suggestions.length > 0 && (
          <Badge variant="secondary">
            <Link2 /> {draft.suggestions.length}
          </Badge>
        )}
        {dirty && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void onSave(
                {
                  title: title.trim(),
                  description: draft.description,
                  duration_estimate: duration === '' ? null : Number(duration),
                  importance,
                  deadline: null,
                  project_id: draft.project_id,
                },
                draft.id,
              )
            }
          >
            Save
          </Button>
        )}
        <button
          onClick={onDelete}
          title="Delete this draft"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-red-500/15 hover:text-red-300"
        >
          <Trash2 className="size-4" />
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          title="Details & suggestions"
        >
          <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
        </button>
      </div>

      {expanded && (
        <div className="space-y-2 border-t border-border/50 px-3 py-3">
          <div className="grid grid-cols-[120px_1fr] items-center gap-2">
            <span className="text-xs text-muted-foreground">Effort (hours)</span>
            <Input
              type="number"
              min="0.25"
              step="0.25"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="h-8"
            />
            <span className="text-xs text-muted-foreground">Importance</span>
            <div className="flex items-center gap-2">
              <Slider
                min={1}
                max={5}
                step={1}
                value={[importance]}
                onValueChange={([v]) => setImportance(v)}
              />
              <span className="w-4 text-center text-xs tabular-nums text-muted-foreground">
                {importance}
              </span>
            </div>
          </div>
          {draft.unresolvedReferences.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-muted-foreground">Unmatched references:</span>
              {draft.unresolvedReferences.map((ref) => (
                <span
                  key={ref}
                  title="No matching quest found — will be ignored"
                  className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground line-through decoration-dotted"
                >
                  <X className="size-2.5" /> {ref}
                </span>
              ))}
            </div>
          )}
          {draft.duplicates.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-950/40 px-3 py-2">
              <MessageSquareWarning className="mt-0.5 size-4 shrink-0 text-amber-400" />
              <p className="text-xs leading-relaxed text-amber-200">
                Similar to “{draft.duplicates[0].title}” (
                {Math.round(draft.duplicates[0].score * 100)}%). Keep both or delete one.
              </p>
            </div>
          )}
          {draft.suggestions.map((s) => {
            const isAccepted = (accepted[draft.id] ?? []).includes(s.prerequisite_id)
            return (
              <button
                key={s.prerequisite_id}
                onClick={() => onToggleSuggestion(draft.id, s.prerequisite_id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-xs transition-colors',
                  isAccepted
                    ? 'border-emerald-400/50 bg-emerald-950/40 text-emerald-200'
                    : 'border-border hover:border-emerald-400/40 hover:bg-emerald-950/20',
                )}
              >
                {isAccepted ? <Check className="size-3.5 text-emerald-400" /> : <Link2 className="size-3.5 text-muted-foreground" />}
                <span>
                  After <b>{s.prerequisite_title}</b>?{' '}
                  <span className="text-muted-foreground">
                    (like “{s.because_completed}” · {Math.round(s.score * 100)}%)
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
