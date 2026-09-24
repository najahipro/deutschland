'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, BookOpen, SkipForward, Sparkles } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { getGlobalPlayer } from '@/components/player/VideoPlayer';

// ─── German Verb Conjugation Dictionary ──────────────────────────────────────
interface VerbEntry {
  infinitive: string;
  ich: string;
  du: string;
  er: string;
  wir: string;
  ihr: string;
  sie: string;
}

type PronounKey = 'ich' | 'du' | 'er' | 'wir' | 'ihr' | 'sie';
const PRONOUN_KEYS: PronounKey[] = ['ich', 'du', 'er', 'wir', 'ihr', 'sie'];

const VERB_TABLE: VerbEntry[] = [
  { infinitive: 'sein',      ich: 'bin',      du: 'bist',      er: 'ist',      wir: 'sind',     ihr: 'seid',     sie: 'sind'     },
  { infinitive: 'haben',     ich: 'habe',     du: 'hast',      er: 'hat',      wir: 'haben',    ihr: 'habt',     sie: 'haben'    },
  { infinitive: 'werden',    ich: 'werde',    du: 'wirst',     er: 'wird',     wir: 'werden',   ihr: 'werdet',   sie: 'werden'   },
  { infinitive: 'können',    ich: 'kann',     du: 'kannst',    er: 'kann',     wir: 'können',   ihr: 'könnt',    sie: 'können'   },
  { infinitive: 'müssen',    ich: 'muss',     du: 'musst',     er: 'muss',     wir: 'müssen',   ihr: 'müsst',    sie: 'müssen'   },
  { infinitive: 'wollen',    ich: 'will',     du: 'willst',    er: 'will',     wir: 'wollen',   ihr: 'wollt',    sie: 'wollen'   },
  { infinitive: 'dürfen',    ich: 'darf',     du: 'darfst',    er: 'darf',     wir: 'dürfen',   ihr: 'dürft',    sie: 'dürfen'   },
  { infinitive: 'sollen',    ich: 'soll',     du: 'sollst',    er: 'soll',     wir: 'sollen',   ihr: 'sollt',    sie: 'sollen'   },
  { infinitive: 'mögen',     ich: 'mag',      du: 'magst',     er: 'mag',      wir: 'mögen',    ihr: 'mögt',     sie: 'mögen'    },
  { infinitive: 'möchten',   ich: 'möchte',   du: 'möchtest',  er: 'möchte',   wir: 'möchten',  ihr: 'möchtet',  sie: 'möchten'  },
  { infinitive: 'gehen',     ich: 'gehe',     du: 'gehst',     er: 'geht',     wir: 'gehen',    ihr: 'geht',     sie: 'gehen'    },
  { infinitive: 'kommen',    ich: 'komme',    du: 'kommst',    er: 'kommt',    wir: 'kommen',   ihr: 'kommt',    sie: 'kommen'   },
  { infinitive: 'machen',    ich: 'mache',    du: 'machst',    er: 'macht',    wir: 'machen',   ihr: 'macht',    sie: 'machen'   },
  { infinitive: 'sagen',     ich: 'sage',     du: 'sagst',     er: 'sagt',     wir: 'sagen',    ihr: 'sagt',     sie: 'sagen'    },
  { infinitive: 'sehen',     ich: 'sehe',     du: 'siehst',    er: 'sieht',    wir: 'sehen',    ihr: 'seht',     sie: 'sehen'    },
  { infinitive: 'wissen',    ich: 'weiß',     du: 'weißt',     er: 'weiß',     wir: 'wissen',   ihr: 'wisst',    sie: 'wissen'   },
  { infinitive: 'nehmen',    ich: 'nehme',    du: 'nimmst',    er: 'nimmt',    wir: 'nehmen',   ihr: 'nehmt',    sie: 'nehmen'   },
  { infinitive: 'geben',     ich: 'gebe',     du: 'gibst',     er: 'gibt',     wir: 'geben',    ihr: 'gebt',     sie: 'geben'    },
  { infinitive: 'essen',     ich: 'esse',     du: 'isst',      er: 'isst',     wir: 'essen',    ihr: 'esst',     sie: 'essen'    },
  { infinitive: 'trinken',   ich: 'trinke',   du: 'trinkst',   er: 'trinkt',   wir: 'trinken',  ihr: 'trinkt',   sie: 'trinken'  },
  { infinitive: 'sprechen',  ich: 'spreche',  du: 'sprichst',  er: 'spricht',  wir: 'sprechen', ihr: 'sprecht',  sie: 'sprechen' },
  { infinitive: 'fahren',    ich: 'fahre',    du: 'fährst',    er: 'fährt',    wir: 'fahren',   ihr: 'fahrt',    sie: 'fahren'   },
  { infinitive: 'laufen',    ich: 'laufe',    du: 'läufst',    er: 'läuft',    wir: 'laufen',   ihr: 'lauft',    sie: 'laufen'   },
  { infinitive: 'schreiben', ich: 'schreibe', du: 'schreibst', er: 'schreibt', wir: 'schreiben',ihr: 'schreibt', sie: 'schreiben'},
  { infinitive: 'lesen',     ich: 'lese',     du: 'liest',     er: 'liest',    wir: 'lesen',    ihr: 'lest',     sie: 'lesen'    },
  { infinitive: 'kaufen',    ich: 'kaufe',    du: 'kaufst',    er: 'kauft',    wir: 'kaufen',   ihr: 'kauft',    sie: 'kaufen'   },
  { infinitive: 'arbeiten',  ich: 'arbeite',  du: 'arbeitest', er: 'arbeitet', wir: 'arbeiten', ihr: 'arbeitet', sie: 'arbeiten' },
  { infinitive: 'wohnen',    ich: 'wohne',    du: 'wohnst',    er: 'wohnt',    wir: 'wohnen',   ihr: 'wohnt',    sie: 'wohnen'   },
  { infinitive: 'spielen',   ich: 'spiele',   du: 'spielst',   er: 'spielt',   wir: 'spielen',  ihr: 'spielt',   sie: 'spielen'  },
  { infinitive: 'lernen',    ich: 'lerne',    du: 'lernst',    er: 'lernt',    wir: 'lernen',   ihr: 'lernt',    sie: 'lernen'   },
  { infinitive: 'heißen',    ich: 'heiße',    du: 'heißt',     er: 'heißt',    wir: 'heißen',   ihr: 'heißt',    sie: 'heißen'   },
  { infinitive: 'finden',    ich: 'finde',    du: 'findest',   er: 'findet',   wir: 'finden',   ihr: 'findet',   sie: 'finden'   },
  { infinitive: 'denken',    ich: 'denke',    du: 'denkst',    er: 'denkt',    wir: 'denken',   ihr: 'denkt',    sie: 'denken'   },
  { infinitive: 'brauchen',  ich: 'brauche',  du: 'brauchst',  er: 'braucht',  wir: 'brauchen', ihr: 'braucht',  sie: 'brauchen' },
  { infinitive: 'helfen',    ich: 'helfe',    du: 'hilfst',    er: 'hilft',    wir: 'helfen',   ihr: 'helft',    sie: 'helfen'   },
  { infinitive: 'schlafen',  ich: 'schlafe',  du: 'schläfst',  er: 'schläft',  wir: 'schlafen', ihr: 'schlaft',  sie: 'schlafen' },
  { infinitive: 'stehen',    ich: 'stehe',    du: 'stehst',    er: 'steht',    wir: 'stehen',   ihr: 'steht',    sie: 'stehen'   },
  { infinitive: 'liegen',    ich: 'liege',    du: 'liegst',    er: 'liegt',    wir: 'liegen',   ihr: 'liegt',    sie: 'liegen'   },
  { infinitive: 'bringen',   ich: 'bringe',   du: 'bringst',   er: 'bringt',   wir: 'bringen',  ihr: 'bringt',   sie: 'bringen'  },
  { infinitive: 'verstehen', ich: 'verstehe', du: 'verstehst', er: 'versteht', wir: 'verstehen',ihr: 'versteht', sie: 'verstehen'},
  { infinitive: 'zeigen',    ich: 'zeige',    du: 'zeigst',    er: 'zeigt',    wir: 'zeigen',   ihr: 'zeigt',    sie: 'zeigen'   },
  { infinitive: 'fragen',    ich: 'frage',    du: 'fragst',    er: 'fragt',    wir: 'fragen',   ihr: 'fragt',    sie: 'fragen'   },
  { infinitive: 'hören',     ich: 'höre',     du: 'hörst',     er: 'hört',     wir: 'hören',    ihr: 'hört',     sie: 'hören'    },
  { infinitive: 'lachen',    ich: 'lache',    du: 'lachst',    er: 'lacht',    wir: 'lachen',   ihr: 'lacht',    sie: 'lachen'   },
  { infinitive: 'lieben',    ich: 'liebe',    du: 'liebst',    er: 'liebt',    wir: 'lieben',   ihr: 'liebt',    sie: 'lieben'   },
  { infinitive: 'kennen',    ich: 'kenne',    du: 'kennst',    er: 'kennt',    wir: 'kennen',   ihr: 'kennt',    sie: 'kennen'   },
  { infinitive: 'treffen',   ich: 'treffe',   du: 'triffst',   er: 'trifft',   wir: 'treffen',  ihr: 'trefft',   sie: 'treffen'  },
  { infinitive: 'vergessen', ich: 'vergesse', du: 'vergisst',  er: 'vergisst', wir: 'vergessen',ihr: 'vergesst', sie: 'vergessen'},
  { infinitive: 'anfangen',  ich: 'fange an', du: 'fängst an', er: 'fängt an', wir: 'fangen an',ihr: 'fangt an', sie: 'fangen an'},
];

// Pre-build: lowercased conjugated form → verb matches
interface VerbMatch {
  verb: VerbEntry;
  pronoun: PronounKey;
  correct: string;
}

const FORM_MAP = new Map<string, VerbMatch[]>();
for (const verb of VERB_TABLE) {
  for (const pronoun of PRONOUN_KEYS) {
    const form = verb[pronoun].toLowerCase().split(' ')[0]; // handle separable verbs like "fange"
    if (!FORM_MAP.has(form)) FORM_MAP.set(form, []);
    FORM_MAP.get(form)!.push({ verb, pronoun, correct: verb[pronoun] });
  }
}

// ─── Quiz types ───────────────────────────────────────────────────────────────
interface QuizQuestion {
  sentence: string;
  blankedSentence: string;
  correct: string;
  options: string[];
  verbInfinitive: string;
  pronoun: string;
  rawWord: string;
}

type GrammarState = 'tracking' | 'quiz' | 'correct' | 'incorrect';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildQuizQuestion(sentence: string): QuizQuestion | null {
  const words = sentence.split(/\s+/);
  for (const raw of words) {
    const clean = raw.toLowerCase().replace(/[.,!?;:"""„»«']/g, '');
    const matches = FORM_MAP.get(clean);
    if (!matches || matches.length === 0) continue;

    const match = matches[0];
    const { verb, pronoun, correct } = match;

    // Build 2 wrong options: other forms of same verb + a random different verb form
    const sameVerbWrongs = PRONOUN_KEYS
      .filter((p) => verb[p].toLowerCase() !== correct.toLowerCase())
      .map((p) => verb[p]);
    const altVerb = VERB_TABLE.find((v) => v.infinitive !== verb.infinitive);
    const pool = [...sameVerbWrongs, altVerb ? altVerb[pronoun] : sameVerbWrongs[0]];
    const wrongs = shuffle(pool).slice(0, 2);

    const blankedSentence = sentence.replace(
      new RegExp(`\\b${escapeRegex(raw)}\\b`, 'gi'),
      '______'
    );

    return {
      sentence,
      blankedSentence,
      correct,
      options: shuffle([correct, ...wrongs]),
      verbInfinitive: verb.infinitive,
      pronoun,
      rawWord: raw,
    };
  }
  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function GrammarMode() {
  const { transcript, currentTimeSec } = useAppStore();

  const [grammarState, setGrammarState] = useState<GrammarState>('tracking');
  const [activeQuestion, setActiveQuestion] = useState<QuizQuestion | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  const quizzedIdxRef = useRef<Set<number>>(new Set());
  const isMountedRef = useRef(true);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      try { getGlobalPlayer()?.playVideo(); } catch { /* ignore */ }
    };
  }, []);

  // Watch playback time → trigger quiz when new sentence plays
  useEffect(() => {
    if (grammarState !== 'tracking' || transcript.length === 0) return;
    const nowMs = currentTimeSec * 1000;
    const idx = transcript.findIndex(
      (line) => nowMs >= line.offset && nowMs < line.offset + line.duration
    );
    if (idx === -1 || quizzedIdxRef.current.has(idx)) return;

    const line = transcript[idx];
    const question = buildQuizQuestion(line.text);
    if (!question) return; // no detectable verb → skip silently

    quizzedIdxRef.current.add(idx);
    setActiveQuestion(question);
    setSelectedOption(null);
    setGrammarState('quiz');
    try { getGlobalPlayer()?.pauseVideo(); } catch { /* ignore */ }
  }, [currentTimeSec, transcript, grammarState]);

  const handleOptionClick = useCallback(
    (option: string) => {
      if (!activeQuestion || grammarState !== 'quiz') return;
      setSelectedOption(option);
      const isCorrect = option.toLowerCase() === activeQuestion.correct.toLowerCase();
      setScore((prev) => ({
        correct: prev.correct + (isCorrect ? 1 : 0),
        total: prev.total + 1,
      }));
      if (isCorrect) {
        setGrammarState('correct');
        resumeTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          setGrammarState('tracking');
          setActiveQuestion(null);
          try { getGlobalPlayer()?.playVideo(); } catch { /* ignore */ }
        }, 1400);
      } else {
        setGrammarState('incorrect');
      }
    },
    [activeQuestion, grammarState]
  );

  const handleRetry = useCallback(() => {
    setSelectedOption(null);
    setGrammarState('quiz');
  }, []);

  const handleSkip = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setGrammarState('tracking');
    setActiveQuestion(null);
    try { getGlobalPlayer()?.playVideo(); } catch { /* ignore */ }
  }, []);

  const accuracy = score.total === 0 ? 0 : Math.round((score.correct / score.total) * 100);
  const hasQuiz = grammarState === 'quiz' || grammarState === 'correct' || grammarState === 'incorrect';

  return (
    <div
      id="grammar-quiz-mode"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '14px 16px',
        background: 'var(--bg-card)',
        border: '1.5px solid var(--border-default)',
        borderRadius: 16,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <BookOpen size={14} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Grammar Quiz</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
              Verb conjugation · auto-pauses on each sentence
            </div>
          </div>
        </div>

        {/* Score pill */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 99,
            background: score.total === 0 ? 'var(--bg-elevated)' : accuracy >= 70 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${score.total === 0 ? 'var(--border-subtle)' : accuracy >= 70 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}
        >
          <Sparkles size={11} color={score.total === 0 ? 'var(--text-muted)' : accuracy >= 70 ? '#10b981' : '#ef4444'} />
          <span style={{ fontSize: 11.5, fontWeight: 700, color: score.total === 0 ? 'var(--text-muted)' : accuracy >= 70 ? '#10b981' : '#ef4444' }}>
            {score.total === 0 ? 'No questions yet' : `${accuracy}%  ·  ${score.correct}/${score.total}`}
          </span>
        </div>
      </div>

      {/* Idle / tracking indicator */}
      {!hasQuiz && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 12,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#10b981', boxShadow: '0 0 0 3px rgba(16,185,129,0.2)',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
            Watching for German verbs in the transcript…
          </span>
        </div>
      )}

      {/* Quiz card */}
      {hasQuiz && activeQuestion && (
        <QuizCard
          question={activeQuestion}
          grammarState={grammarState}
          selectedOption={selectedOption}
          onOptionClick={handleOptionClick}
          onRetry={handleRetry}
          onSkip={handleSkip}
        />
      )}
    </div>
  );
}

// ─── Quiz Card ────────────────────────────────────────────────────────────────
function QuizCard({
  question,
  grammarState,
  selectedOption,
  onOptionClick,
  onRetry,
  onSkip,
}: {
  question: QuizQuestion;
  grammarState: GrammarState;
  selectedOption: string | null;
  onOptionClick: (o: string) => void;
  onRetry: () => void;
  onSkip: () => void;
}) {
  const isCorrect = grammarState === 'correct';
  const isIncorrect = grammarState === 'incorrect';
  const isAnswered = isCorrect || isIncorrect;

  const parts = question.blankedSentence.split('______');

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 12,
        padding: 16, borderRadius: 14, position: 'relative', overflow: 'hidden',
        background: 'var(--bg-elevated)',
        border: `1.5px solid ${isCorrect ? 'rgba(16,185,129,0.35)' : isIncorrect ? 'rgba(239,68,68,0.35)' : 'var(--border-subtle)'}`,
        transition: 'border-color 0.2s ease',
      }}
    >
      {/* Top accent bar */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: isCorrect
            ? 'linear-gradient(90deg,#10b981,#34d399)'
            : isIncorrect
              ? 'linear-gradient(90deg,#ef4444,#f87171)'
              : 'linear-gradient(90deg,#7c3aed,#a855f7)',
          borderRadius: '14px 14px 0 0',
          transition: 'background 0.3s',
        }}
      />

      {/* Verb context pill */}
      <div style={{ marginTop: 4 }}>
        <span
          style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em',
            textTransform: 'uppercase', color: '#a855f7',
            background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)',
            padding: '2px 8px', borderRadius: 6,
          }}
        >
          {question.pronoun} + ______ &nbsp;·&nbsp; infinitive: {question.verbInfinitive}
        </span>
      </div>

      {/* Sentence with blank */}
      <div
        style={{
          fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
          lineHeight: 1.6, padding: '8px 10px',
          background: 'rgba(0,0,0,0.04)', borderRadius: 10,
          borderLeft: '3px solid #7c3aed',
        }}
      >
        {parts[0]}
        <span
          style={{
            display: 'inline-block', minWidth: 72, textAlign: 'center',
            fontWeight: 800, margin: '0 4px', padding: '0 6px', borderRadius: 6,
            color: isCorrect ? '#10b981' : isIncorrect ? '#ef4444' : '#7c3aed',
            background: isCorrect
              ? 'rgba(16,185,129,0.12)'
              : isIncorrect
                ? 'rgba(239,68,68,0.1)'
                : 'rgba(124,58,237,0.1)',
            border: `1.5px ${isAnswered ? 'solid' : 'dashed'} ${
              isCorrect ? 'rgba(16,185,129,0.4)' : isIncorrect ? 'rgba(239,68,68,0.4)' : 'rgba(124,58,237,0.4)'
            }`,
            transition: 'all 0.2s ease',
          }}
        >
          {isAnswered ? (selectedOption ?? '?') : '______'}
        </span>
        {parts[1] ?? ''}
      </div>

      {/* Options */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {question.options.map((opt) => {
          const isThisCorrect = opt.toLowerCase() === question.correct.toLowerCase();
          const isSelected = selectedOption === opt;

          let bg = 'var(--bg-card)';
          let border = 'var(--border-default)';
          let color = 'var(--text-primary)';

          if (isAnswered) {
            if (isThisCorrect) { bg = 'rgba(16,185,129,0.12)'; border = 'rgba(16,185,129,0.4)'; color = '#10b981'; }
            else if (isSelected) { bg = 'rgba(239,68,68,0.1)'; border = 'rgba(239,68,68,0.4)'; color = '#ef4444'; }
          }

          return (
            <button
              key={opt}
              id={`grammar-option-${opt.replace(/\s+/g, '-')}`}
              onClick={() => !isAnswered && onOptionClick(opt)}
              style={{
                flex: '1 1 auto', padding: '9px 12px', borderRadius: 10,
                border: `1.5px solid ${border}`, background: bg, color,
                fontSize: 13.5, fontWeight: 700, cursor: isAnswered ? 'default' : 'pointer',
                transition: 'all 0.18s ease', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
              onMouseEnter={(e) => {
                if (!isAnswered) {
                  e.currentTarget.style.background = 'rgba(124,58,237,0.08)';
                  e.currentTarget.style.borderColor = 'rgba(124,58,237,0.45)';
                  e.currentTarget.style.color = '#7c3aed';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isAnswered) {
                  e.currentTarget.style.background = bg;
                  e.currentTarget.style.borderColor = border;
                  e.currentTarget.style.color = color;
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              {isAnswered && isThisCorrect && <CheckCircle2 size={13} />}
              {isAnswered && isSelected && !isThisCorrect && <XCircle size={13} />}
              {opt}
            </button>
          );
        })}
      </div>

      {/* Feedback row */}
      {isAnswered && (
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 10px', borderRadius: 10,
            background: isCorrect ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.07)',
            border: `1px solid ${isCorrect ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isCorrect ? <CheckCircle2 size={14} color="#10b981" /> : <XCircle size={14} color="#ef4444" />}
            <span style={{ fontSize: 12.5, fontWeight: 600, color: isCorrect ? '#10b981' : '#ef4444' }}>
              {isCorrect ? 'Richtig! Resuming…' : `Falsch! Correct: "${question.correct}"`}
            </span>
          </div>
          {!isCorrect && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                id="grammar-retry-btn"
                onClick={onRetry}
                style={{
                  padding: '5px 12px', borderRadius: 8,
                  border: '1.5px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)',
                  color: '#ef4444', fontSize: 11.5, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                ↺ Retry
              </button>
              <button
                id="grammar-skip-btn"
                onClick={onSkip}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '5px 12px', borderRadius: 8,
                  border: '1.5px solid var(--border-default)', background: 'var(--bg-card)',
                  color: 'var(--text-secondary)', fontSize: 11.5, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <SkipForward size={11} /> Skip
              </button>
            </div>
          )}
        </div>
      )}

      {/* Skip button when actively quizzing (no selection yet) */}
      {grammarState === 'quiz' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            id="grammar-quiz-skip-btn"
            onClick={onSkip}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 8,
              border: '1px solid var(--border-subtle)', background: 'transparent',
              color: 'var(--text-muted)', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <SkipForward size={10} /> No verb here — skip
          </button>
        </div>
      )}
    </div>
  );
}
