'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { CheckCircle2, XCircle, BookOpen, SkipForward, Search, Target, Sparkles, ChevronDown } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { getGlobalPlayer } from '@/components/player/VideoPlayer';

// ─── German Verb Conjugation Dictionary (A1 / A2 level) ─────────────────────
interface VerbEntry {
  infinitive: string;
  label: string; // human-readable display e.g. "sein (to be)"
  ich: string;
  du: string;
  er: string;    // er/sie/es
  wir: string;
  ihr: string;
  sie: string;   // sie/Sie
}

type PronounKey = 'ich' | 'du' | 'er' | 'wir' | 'ihr' | 'sie';
const PRONOUN_KEYS: PronounKey[] = ['ich', 'du', 'er', 'wir', 'ihr', 'sie'];
const PRONOUN_LABELS: Record<PronounKey, string> = {
  ich: 'ich', du: 'du', er: 'er/sie/es', wir: 'wir', ihr: 'ihr', sie: 'sie/Sie',
};

export const VERB_TABLE: VerbEntry[] = [
  { infinitive: 'sein',      label: 'sein (to be)',       ich: 'bin',      du: 'bist',      er: 'ist',      wir: 'sind',     ihr: 'seid',     sie: 'sind'     },
  { infinitive: 'haben',     label: 'haben (to have)',    ich: 'habe',     du: 'hast',      er: 'hat',      wir: 'haben',    ihr: 'habt',     sie: 'haben'    },
  { infinitive: 'werden',    label: 'werden (to become)', ich: 'werde',    du: 'wirst',     er: 'wird',     wir: 'werden',   ihr: 'werdet',   sie: 'werden'   },
  { infinitive: 'können',    label: 'können (can)',        ich: 'kann',     du: 'kannst',    er: 'kann',     wir: 'können',   ihr: 'könnt',    sie: 'können'   },
  { infinitive: 'müssen',    label: 'müssen (must)',       ich: 'muss',     du: 'musst',     er: 'muss',     wir: 'müssen',   ihr: 'müsst',    sie: 'müssen'   },
  { infinitive: 'wollen',    label: 'wollen (to want)',   ich: 'will',     du: 'willst',    er: 'will',     wir: 'wollen',   ihr: 'wollt',    sie: 'wollen'   },
  { infinitive: 'dürfen',    label: 'dürfen (may)',        ich: 'darf',     du: 'darfst',    er: 'darf',     wir: 'dürfen',   ihr: 'dürft',    sie: 'dürfen'   },
  { infinitive: 'sollen',    label: 'sollen (should)',    ich: 'soll',     du: 'sollst',    er: 'soll',     wir: 'sollen',   ihr: 'sollt',    sie: 'sollen'   },
  { infinitive: 'mögen',     label: 'mögen (to like)',    ich: 'mag',      du: 'magst',     er: 'mag',      wir: 'mögen',    ihr: 'mögt',     sie: 'mögen'    },
  { infinitive: 'möchten',   label: 'möchten (would like)',ich:'möchte',   du: 'möchtest',  er: 'möchte',   wir: 'möchten',  ihr: 'möchtet',  sie: 'möchten'  },
  { infinitive: 'gehen',     label: 'gehen (to go)',      ich: 'gehe',     du: 'gehst',     er: 'geht',     wir: 'gehen',    ihr: 'geht',     sie: 'gehen'    },
  { infinitive: 'kommen',    label: 'kommen (to come)',   ich: 'komme',    du: 'kommst',    er: 'kommt',    wir: 'kommen',   ihr: 'kommt',    sie: 'kommen'   },
  { infinitive: 'machen',    label: 'machen (to do/make)',ich: 'mache',    du: 'machst',    er: 'macht',    wir: 'machen',   ihr: 'macht',    sie: 'machen'   },
  { infinitive: 'sagen',     label: 'sagen (to say)',     ich: 'sage',     du: 'sagst',     er: 'sagt',     wir: 'sagen',    ihr: 'sagt',     sie: 'sagen'    },
  { infinitive: 'sehen',     label: 'sehen (to see)',     ich: 'sehe',     du: 'siehst',    er: 'sieht',    wir: 'sehen',    ihr: 'seht',     sie: 'sehen'    },
  { infinitive: 'wissen',    label: 'wissen (to know)',   ich: 'weiß',     du: 'weißt',     er: 'weiß',     wir: 'wissen',   ihr: 'wisst',    sie: 'wissen'   },
  { infinitive: 'nehmen',    label: 'nehmen (to take)',   ich: 'nehme',    du: 'nimmst',    er: 'nimmt',    wir: 'nehmen',   ihr: 'nehmt',    sie: 'nehmen'   },
  { infinitive: 'geben',     label: 'geben (to give)',    ich: 'gebe',     du: 'gibst',     er: 'gibt',     wir: 'geben',    ihr: 'gebt',     sie: 'geben'    },
  { infinitive: 'essen',     label: 'essen (to eat)',     ich: 'esse',     du: 'isst',      er: 'isst',     wir: 'essen',    ihr: 'esst',     sie: 'essen'    },
  { infinitive: 'trinken',   label: 'trinken (to drink)', ich: 'trinke',   du: 'trinkst',   er: 'trinkt',   wir: 'trinken',  ihr: 'trinkt',   sie: 'trinken'  },
  { infinitive: 'sprechen',  label: 'sprechen (to speak)',ich: 'spreche',  du: 'sprichst',  er: 'spricht',  wir: 'sprechen', ihr: 'sprecht',  sie: 'sprechen' },
  { infinitive: 'fahren',    label: 'fahren (to drive)',  ich: 'fahre',    du: 'fährst',    er: 'fährt',    wir: 'fahren',   ihr: 'fahrt',    sie: 'fahren'   },
  { infinitive: 'schreiben', label: 'schreiben (to write)',ich:'schreibe', du: 'schreibst', er: 'schreibt', wir: 'schreiben',ihr: 'schreibt', sie: 'schreiben'},
  { infinitive: 'lesen',     label: 'lesen (to read)',    ich: 'lese',     du: 'liest',     er: 'liest',    wir: 'lesen',    ihr: 'lest',     sie: 'lesen'    },
  { infinitive: 'kaufen',    label: 'kaufen (to buy)',    ich: 'kaufe',    du: 'kaufst',    er: 'kauft',    wir: 'kaufen',   ihr: 'kauft',    sie: 'kaufen'   },
  { infinitive: 'arbeiten',  label: 'arbeiten (to work)', ich: 'arbeite',  du: 'arbeitest', er: 'arbeitet', wir: 'arbeiten', ihr: 'arbeitet', sie: 'arbeiten' },
  { infinitive: 'wohnen',    label: 'wohnen (to live)',   ich: 'wohne',    du: 'wohnst',    er: 'wohnt',    wir: 'wohnen',   ihr: 'wohnt',    sie: 'wohnen'   },
  { infinitive: 'spielen',   label: 'spielen (to play)',  ich: 'spiele',   du: 'spielst',   er: 'spielt',   wir: 'spielen',  ihr: 'spielt',   sie: 'spielen'  },
  { infinitive: 'lernen',    label: 'lernen (to learn)',  ich: 'lerne',    du: 'lernst',    er: 'lernt',    wir: 'lernen',   ihr: 'lernt',    sie: 'lernen'   },
  { infinitive: 'heißen',    label: 'heißen (to be called)',ich:'heiße',   du: 'heißt',     er: 'heißt',    wir: 'heißen',   ihr: 'heißt',    sie: 'heißen'   },
  { infinitive: 'finden',    label: 'finden (to find)',   ich: 'finde',    du: 'findest',   er: 'findet',   wir: 'finden',   ihr: 'findet',   sie: 'finden'   },
  { infinitive: 'denken',    label: 'denken (to think)',  ich: 'denke',    du: 'denkst',    er: 'denkt',    wir: 'denken',   ihr: 'denkt',    sie: 'denken'   },
  { infinitive: 'brauchen',  label: 'brauchen (to need)', ich: 'brauche',  du: 'brauchst',  er: 'braucht',  wir: 'brauchen', ihr: 'braucht',  sie: 'brauchen' },
  { infinitive: 'helfen',    label: 'helfen (to help)',   ich: 'helfe',    du: 'hilfst',    er: 'hilft',    wir: 'helfen',   ihr: 'helft',    sie: 'helfen'   },
  { infinitive: 'schlafen',  label: 'schlafen (to sleep)',ich: 'schlafe',  du: 'schläfst',  er: 'schläft',  wir: 'schlafen', ihr: 'schlaft',  sie: 'schlafen' },
  { infinitive: 'stehen',    label: 'stehen (to stand)',  ich: 'stehe',    du: 'stehst',    er: 'steht',    wir: 'stehen',   ihr: 'steht',    sie: 'stehen'   },
  { infinitive: 'liegen',    label: 'liegen (to lie)',    ich: 'liege',    du: 'liegst',    er: 'liegt',    wir: 'liegen',   ihr: 'liegt',    sie: 'liegen'   },
  { infinitive: 'bringen',   label: 'bringen (to bring)', ich: 'bringe',   du: 'bringst',   er: 'bringt',   wir: 'bringen',  ihr: 'bringt',   sie: 'bringen'  },
  { infinitive: 'verstehen', label: 'verstehen (to understand)',ich:'verstehe',du:'verstehst',er:'versteht',wir:'verstehen',ihr:'versteht',sie:'verstehen'   },
  { infinitive: 'zeigen',    label: 'zeigen (to show)',   ich: 'zeige',    du: 'zeigst',    er: 'zeigt',    wir: 'zeigen',   ihr: 'zeigt',    sie: 'zeigen'   },
  { infinitive: 'fragen',    label: 'fragen (to ask)',    ich: 'frage',    du: 'fragst',    er: 'fragt',    wir: 'fragen',   ihr: 'fragt',    sie: 'fragen'   },
  { infinitive: 'hören',     label: 'hören (to hear)',    ich: 'höre',     du: 'hörst',     er: 'hört',     wir: 'hören',    ihr: 'hört',     sie: 'hören'    },
  { infinitive: 'kennen',    label: 'kennen (to know)',   ich: 'kenne',    du: 'kennst',    er: 'kennt',    wir: 'kennen',   ihr: 'kennt',    sie: 'kennen'   },
  { infinitive: 'treffen',   label: 'treffen (to meet)',  ich: 'treffe',   du: 'triffst',   er: 'trifft',   wir: 'treffen',  ihr: 'trefft',   sie: 'treffen'  },
  { infinitive: 'lieben',    label: 'lieben (to love)',   ich: 'liebe',    du: 'liebst',    er: 'liebt',    wir: 'lieben',   ihr: 'liebt',    sie: 'lieben'   },
  { infinitive: 'warten',    label: 'warten (to wait)',   ich: 'warte',    du: 'wartest',   er: 'wartet',   wir: 'warten',   ihr: 'wartet',   sie: 'warten'   },
  { infinitive: 'öffnen',    label: 'öffnen (to open)',   ich: 'öffne',    du: 'öffnest',   er: 'öffnet',   wir: 'öffnen',   ihr: 'öffnet',   sie: 'öffnen'   },
  { infinitive: 'zahlen',    label: 'zahlen (to pay)',    ich: 'zahle',    du: 'zahlst',    er: 'zahlt',    wir: 'zahlen',   ihr: 'zahlt',    sie: 'zahlen'   },
  { infinitive: 'reisen',    label: 'reisen (to travel)', ich: 'reise',    du: 'reist',     er: 'reist',    wir: 'reisen',   ihr: 'reist',    sie: 'reisen'   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

/** Build a Set of lowercased conjugated forms for a given verb entry */
function buildFormSet(verb: VerbEntry): Map<string, PronounKey> {
  const map = new Map<string, PronounKey>();
  for (const p of PRONOUN_KEYS) {
    map.set(verb[p].toLowerCase(), p);
  }
  return map;
}

// ─── Quiz types ───────────────────────────────────────────────────────────────
interface QuizQuestion {
  sentence: string;
  blankedSentence: string; // sentence with the matched conjugation replaced by "______"
  correct: string;         // the exact conjugation found in the sentence
  correctPronoun: PronounKey;
  options: string[];       // 3 options: correct + 2 other conjugations of the SAME verb
  targetVerb: VerbEntry;
  rawWord: string;         // original word token as it appeared
}

type GrammarState = 'idle' | 'tracking' | 'quiz' | 'correct' | 'incorrect';

// ─── Component ────────────────────────────────────────────────────────────────
export function GrammarMode() {
  const { transcript, currentTimeSec } = useAppStore();

  // ── Target verb selection ──────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('');
  const [targetVerb, setTargetVerb] = useState<VerbEntry | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Quiz state ─────────────────────────────────────────────────────────────
  const [grammarState, setGrammarState] = useState<GrammarState>('idle');
  const [activeQuestion, setActiveQuestion] = useState<QuizQuestion | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0, hits: 0 });

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

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        searchRef.current && !searchRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Filtered verb suggestions ──────────────────────────────────────────────
  const suggestions = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    if (!q) return VERB_TABLE.slice(0, 8); // show first 8 when empty
    return VERB_TABLE.filter(
      (v) => v.infinitive.startsWith(q) || v.label.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [searchInput]);

  // ── Pre-build form map for target verb ────────────────────────────────────
  const targetFormMap = useMemo(
    () => (targetVerb ? buildFormSet(targetVerb) : null),
    [targetVerb]
  );

  // ── Select a verb ─────────────────────────────────────────────────────────
  const selectVerb = useCallback((verb: VerbEntry) => {
    setTargetVerb(verb);
    setSearchInput(verb.infinitive);
    setShowDropdown(false);
    setGrammarState('tracking');
    setActiveQuestion(null);
    setSelectedOption(null);
    setScore({ correct: 0, total: 0, hits: 0 });
    quizzedIdxRef.current.clear();
  }, []);

  // ── Clear target verb ─────────────────────────────────────────────────────
  const clearVerb = useCallback(() => {
    setTargetVerb(null);
    setSearchInput('');
    setGrammarState('idle');
    setActiveQuestion(null);
    setSelectedOption(null);
    quizzedIdxRef.current.clear();
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    try { getGlobalPlayer()?.playVideo(); } catch { /* ignore */ }
  }, []);

  // ── Watch playback → detect target verb in current sentence ───────────────
  useEffect(() => {
    if (grammarState !== 'tracking' || !targetVerb || !targetFormMap || transcript.length === 0) return;
    const nowMs = currentTimeSec * 1000;
    const idx = transcript.findIndex(
      (line) => nowMs >= line.offset && nowMs < line.offset + line.duration
    );
    if (idx === -1 || quizzedIdxRef.current.has(idx)) return;

    const line = transcript[idx];
    // Scan each word for a match against the target verb's forms
    const words = line.text.split(/\s+/);
    let foundRaw: string | null = null;
    let foundPronoun: PronounKey | null = null;

    for (const raw of words) {
      const clean = raw.toLowerCase().replace(/[.,!?;:"""„»«']/g, '');
      const pronoun = targetFormMap.get(clean);
      if (pronoun !== undefined) {
        foundRaw = raw;
        foundPronoun = pronoun;
        break;
      }
    }

    if (!foundRaw || !foundPronoun) return; // target verb not in this line → skip

    quizzedIdxRef.current.add(idx);
    setScore((prev) => ({ ...prev, hits: prev.hits + 1 }));

    // Build the quiz question
    const correct = targetVerb[foundPronoun];
    // 2 wrong options: other forms of the SAME verb (different pronouns)
    const otherForms = PRONOUN_KEYS
      .filter((p) => targetVerb[p].toLowerCase() !== correct.toLowerCase())
      .map((p) => targetVerb[p]);
    const wrongs = shuffle(otherForms).slice(0, 2);

    const blankedSentence = line.text.replace(
      new RegExp(`\\b${escapeRegex(foundRaw)}\\b`, 'gi'),
      '______'
    );

    const question: QuizQuestion = {
      sentence: line.text,
      blankedSentence,
      correct,
      correctPronoun: foundPronoun,
      options: shuffle([correct, ...wrongs]),
      targetVerb,
      rawWord: foundRaw,
    };

    setActiveQuestion(question);
    setSelectedOption(null);
    setGrammarState('quiz');
    try { getGlobalPlayer()?.pauseVideo(); } catch { /* ignore */ }
  }, [currentTimeSec, transcript, grammarState, targetVerb, targetFormMap]);

  // ── Option selected ───────────────────────────────────────────────────────
  const handleOptionClick = useCallback(
    (option: string) => {
      if (!activeQuestion || grammarState !== 'quiz') return;
      setSelectedOption(option);
      const isCorrect = option.toLowerCase() === activeQuestion.correct.toLowerCase();
      setScore((prev) => ({
        ...prev,
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

  const accuracy = score.total === 0 ? null : Math.round((score.correct / score.total) * 100);
  const hasQuiz = grammarState === 'quiz' || grammarState === 'correct' || grammarState === 'incorrect';

  return (
    <div
      id="grammar-quiz-mode"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: '14px 16px',
        background: 'var(--bg-card)',
        border: '1.5px solid var(--border-default)',
        borderRadius: 16,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Target size={14} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              Targeted Verb Quiz
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
              Practice one specific verb · pauses only when it appears
            </div>
          </div>
        </div>

        {/* Score pill — only shown after tracking starts */}
        {targetVerb && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 99,
              background: accuracy === null ? 'var(--bg-elevated)' : accuracy >= 70 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${accuracy === null ? 'var(--border-subtle)' : accuracy >= 70 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}
          >
            <Sparkles size={11} color={accuracy === null ? 'var(--text-muted)' : accuracy >= 70 ? '#10b981' : '#ef4444'} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: accuracy === null ? 'var(--text-muted)' : accuracy >= 70 ? '#10b981' : '#ef4444' }}>
              {accuracy === null
                ? `${score.hits} hit${score.hits !== 1 ? 's' : ''} found`
                : `${accuracy}% · ${score.correct}/${score.total}`}
            </span>
          </div>
        )}
      </div>

      {/* ── Verb Selector ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Target Verb (Infinitive)
        </label>

        <div style={{ position: 'relative' }}>
          {/* Search input */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 12px', borderRadius: 10,
              background: 'var(--bg-elevated)',
              border: `1.5px solid ${targetVerb ? 'rgba(124,58,237,0.5)' : 'var(--border-default)'}`,
              transition: 'border-color 0.15s ease',
            }}
          >
            <Search size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <input
              ref={searchRef}
              id="grammar-verb-search"
              type="text"
              value={searchInput}
              placeholder="Type a verb infinitive… e.g. sein, haben, machen"
              onChange={(e) => {
                setSearchInput(e.target.value);
                setShowDropdown(true);
                if (targetVerb && e.target.value !== targetVerb.infinitive) {
                  setTargetVerb(null);
                  setGrammarState('idle');
                }
              }}
              onFocus={() => setShowDropdown(true)}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
                fontFamily: 'inherit',
              }}
            />
            {targetVerb && (
              <button
                onClick={clearVerb}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 16, lineHeight: 1,
                  padding: '0 2px', display: 'flex', alignItems: 'center',
                }}
                title="Clear selection"
              >×</button>
            )}
            <ChevronDown
              size={13}
              color="var(--text-muted)"
              style={{ flexShrink: 0, transform: showDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
            />
          </div>

          {/* Dropdown */}
          {showDropdown && suggestions.length > 0 && (
            <div
              ref={dropdownRef}
              style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                background: 'var(--bg-card)', border: '1.5px solid var(--border-default)',
                borderRadius: 12, boxShadow: 'var(--shadow-md)',
                zIndex: 100, overflow: 'hidden',
                maxHeight: 260, overflowY: 'auto',
              }}
            >
              {suggestions.map((verb) => {
                const isSelected = targetVerb?.infinitive === verb.infinitive;
                return (
                  <button
                    key={verb.infinitive}
                    id={`grammar-verb-${verb.infinitive}`}
                    onClick={() => selectVerb(verb)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '9px 14px',
                      background: isSelected ? 'rgba(124,58,237,0.08)' : 'transparent',
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'baseline', gap: 8,
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? '#7c3aed' : 'var(--text-primary)' }}>
                      {verb.infinitive}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 400 }}>
                      {verb.label.replace(verb.infinitive + ' ', '')}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Conjugation preview for selected verb */}
        {targetVerb && (
          <div
            style={{
              display: 'flex', flexWrap: 'wrap', gap: 5,
              padding: '8px 10px', borderRadius: 10,
              background: 'rgba(124,58,237,0.05)',
              border: '1px solid rgba(124,58,237,0.15)',
            }}
          >
            {PRONOUN_KEYS.map((p) => (
              <span
                key={p}
                style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 6,
                  background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)',
                  color: '#7c3aed', fontWeight: 600,
                }}
              >
                {PRONOUN_LABELS[p]} <strong>{targetVerb[p]}</strong>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Status / tracking banner ────────────────────────────────────────── */}
      {grammarState === 'idle' && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 12,
            background: 'var(--bg-elevated)', border: '1px dashed var(--border-default)',
          }}
        >
          <BookOpen size={15} color="var(--text-muted)" />
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            Select a target verb above to start. The quiz will activate only when that verb appears in the video.
          </span>
        </div>
      )}

      {grammarState === 'tracking' && !hasQuiz && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 12,
            background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.15)',
          }}
        >
          <div
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#a855f7', boxShadow: '0 0 0 3px rgba(168,85,247,0.2)',
              flexShrink: 0, animation: 'pulse 2s infinite',
            }}
          />
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
            Listening for <strong style={{ color: '#7c3aed' }}>{targetVerb?.infinitive}</strong> in the transcript…
            &nbsp;({score.hits} match{score.hits !== 1 ? 'es' : ''} so far)
          </span>
        </div>
      )}

      {/* ── Quiz Card ────────────────────────────────────────────────────────── */}
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
        border: `1.5px solid ${isCorrect ? 'rgba(16,185,129,0.35)' : isIncorrect ? 'rgba(239,68,68,0.35)' : 'rgba(124,58,237,0.2)'}`,
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

      {/* Context pill: pronoun + verb */}
      <div style={{ marginTop: 4 }}>
        <span
          style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em',
            textTransform: 'uppercase', color: '#a855f7',
            background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)',
            padding: '2px 9px', borderRadius: 6,
          }}
        >
          {PRONOUN_LABELS[question.correctPronoun]} · {question.targetVerb.infinitive}
        </span>
      </div>

      {/* Sentence with blank */}
      <div
        style={{
          fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
          lineHeight: 1.65, padding: '8px 12px',
          background: 'rgba(0,0,0,0.04)', borderRadius: 10,
          borderLeft: '3px solid #7c3aed',
        }}
      >
        {parts[0]}
        <span
          style={{
            display: 'inline-block', minWidth: 72, textAlign: 'center',
            fontWeight: 800, margin: '0 4px', padding: '0 8px', borderRadius: 6,
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
            if (isThisCorrect)    { bg = 'rgba(16,185,129,0.12)'; border = 'rgba(16,185,129,0.4)'; color = '#10b981'; }
            else if (isSelected)  { bg = 'rgba(239,68,68,0.1)';   border = 'rgba(239,68,68,0.4)'; color = '#ef4444'; }
          }

          return (
            <button
              key={opt}
              id={`grammar-option-${opt.replace(/\s+/g, '-')}`}
              onClick={() => !isAnswered && onOptionClick(opt)}
              style={{
                flex: '1 1 auto', padding: '10px 14px', borderRadius: 10,
                border: `1.5px solid ${border}`, background: bg, color,
                fontSize: 14, fontWeight: 700, cursor: isAnswered ? 'default' : 'pointer',
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
            {isCorrect
              ? <CheckCircle2 size={14} color="#10b981" />
              : <XCircle size={14} color="#ef4444" />}
            <span style={{ fontSize: 12.5, fontWeight: 600, color: isCorrect ? '#10b981' : '#ef4444' }}>
              {isCorrect
                ? 'Richtig! Resuming…'
                : `Falsch! Correct answer: "${question.correct}"`}
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

      {/* Skip button when quiz is active (no answer yet) */}
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
            <SkipForward size={10} /> Skip this one
          </button>
        </div>
      )}
    </div>
  );
}

