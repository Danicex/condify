/**
 * Nimlock unlock tasks.
 *
 * When a user locks money for a goal they pick ONE task from this list. If they want to
 * liquidate (withdraw) BEFORE the lock duration ends, they must complete that task first.
 *
 * Task `type` decides which mini-game the UI renders (see components/TaskRunner.jsx):
 *   quiz     – multiple-choice question           { question, options[], answer(index) }
 *   memory   – memorise a sequence, then recall    { sequence[], showMs }
 *   timer    – hold / do something for N seconds   { seconds }
 *   counter  – tap to count reps                   { target }
 *   checklist– tick every step                      { steps[] }
 */
export const CATEGORIES = [
  { id: 'brain_teaser', label: 'Brain Teaser', icon: 'Puzzle', blurb: 'Riddles & logic puzzles' },
  { id: 'brain_memory', label: 'Brain Memory', icon: 'Brain', blurb: 'Recall sequences & patterns' },
  { id: 'fitness_health', label: 'Fitness & Health', icon: 'Dumbbell', blurb: 'Move your body, earn your money' },
  // extra fields
  { id: 'mindfulness', label: 'Mindfulness', icon: 'Leaf', blurb: 'Breathe, reflect, reset' },
  { id: 'finance_iq', label: 'Finance IQ', icon: 'GraduationCap', blurb: 'Quick money-knowledge checks' },
]

export const TASKS = [
  /* ---------------- Brain Teaser ---------------- */
  {
    id: 'bt-riddle-footsteps', category: 'brain_teaser', title: 'The Footstep Riddle', difficulty: 'easy', minutes: 1, type: 'quiz',
    description: 'Answer a classic riddle correctly.',
    config: { question: 'The more of me you take, the more you leave behind. What am I?', options: ['Footsteps', 'Time', 'Money', 'Memories'], answer: 0 },
  },
  {
    id: 'bt-sequence', category: 'brain_teaser', title: 'Number Sequence', difficulty: 'medium', minutes: 1, type: 'quiz',
    description: 'Find the next number in the pattern.',
    config: { question: '2, 6, 12, 20, 30, … what comes next?', options: ['40', '42', '44', '38'], answer: 1 },
  },
  {
    id: 'bt-lateral', category: 'brain_teaser', title: 'Lateral Thinking', difficulty: 'hard', minutes: 2, type: 'quiz',
    description: 'Crack a lateral-thinking puzzle.',
    config: { question: 'A man pushes his car to a hotel and tells the owner he’s bankrupt. Where is he?', options: ['A casino playing Monopoly', 'A car dealership', 'A real hotel, lost', 'A garage'], answer: 0 },
  },
  {
    id: 'bt-logic', category: 'brain_teaser', title: 'Logic Gate', difficulty: 'medium', minutes: 1, type: 'quiz',
    description: 'Solve a quick deduction question.',
    config: { question: 'All blocks are chains. Some chains are secure. Which statement MUST be true?', options: ['All blocks are secure', 'Some blocks may be secure', 'No block is secure', 'All chains are blocks'], answer: 1 },
  },

  /* ---------------- Brain Memory ---------------- */
  {
    id: 'bm-digits-5', category: 'brain_memory', title: 'Digit Span (5)', difficulty: 'easy', minutes: 1, type: 'memory',
    description: 'Memorise 5 digits, then type them back.',
    config: { sequence: ['7', '2', '9', '4', '1'], showMs: 3500 },
  },
  {
    id: 'bm-digits-8', category: 'brain_memory', title: 'Digit Span (8)', difficulty: 'hard', minutes: 2, type: 'memory',
    description: 'Memorise 8 digits, then type them back.',
    config: { sequence: ['3', '8', '1', '6', '0', '5', '9', '2'], showMs: 5000 },
  },
  {
    id: 'bm-colors', category: 'brain_memory', title: 'Colour Order', difficulty: 'medium', minutes: 1, type: 'memory',
    description: 'Remember the order of colour words.',
    config: { sequence: ['Amber', 'Green', 'Gold', 'Ivory', 'Slate'], showMs: 4000 },
  },
  {
    id: 'bm-words', category: 'brain_memory', title: 'Word Chain', difficulty: 'medium', minutes: 1, type: 'memory',
    description: 'Memorise six words and recall them in order.',
    config: { sequence: ['Mountain', 'Ledger', 'Falcon', 'Harvest', 'Signal', 'Lantern'], showMs: 6000 },
  },

  /* ---------------- Fitness & Health ---------------- */
  {
    id: 'fh-pushups', category: 'fitness_health', title: '20 Push-ups', difficulty: 'medium', minutes: 3, type: 'counter',
    description: 'Do 20 push-ups. Tap once per rep.',
    config: { target: 20, unit: 'push-ups' },
  },
  {
    id: 'fh-squats', category: 'fitness_health', title: '30 Squats', difficulty: 'medium', minutes: 3, type: 'counter',
    description: 'Do 30 bodyweight squats. Tap once per rep.',
    config: { target: 30, unit: 'squats' },
  },
  {
    id: 'fh-plank', category: 'fitness_health', title: '60-second Plank', difficulty: 'hard', minutes: 2, type: 'timer',
    description: 'Hold a plank until the timer hits zero.',
    config: { seconds: 60, verb: 'Hold the plank' },
  },
  {
    id: 'fh-walk', category: 'fitness_health', title: '5-minute Brisk Walk', difficulty: 'easy', minutes: 5, type: 'timer',
    description: 'Walk at a brisk pace for 5 minutes.',
    config: { seconds: 300, verb: 'Keep walking' },
  },
  {
    id: 'fh-water', category: 'fitness_health', title: 'Hydration Reset', difficulty: 'easy', minutes: 2, type: 'checklist',
    description: 'Drink water and stretch.',
    config: { steps: ['Drink a full glass of water', 'Stand up and stretch your arms overhead', 'Roll your shoulders 10 times'] },
  },

  /* ---------------- Mindfulness ---------------- */
  {
    id: 'mf-breath', category: 'mindfulness', title: 'Box Breathing', difficulty: 'easy', minutes: 2, type: 'timer',
    description: 'Breathe in 4 · hold 4 · out 4 · hold 4 for two minutes.',
    config: { seconds: 120, verb: 'Breathe slowly' },
  },
  {
    id: 'mf-reflect', category: 'mindfulness', title: 'Spending Reflection', difficulty: 'easy', minutes: 2, type: 'checklist',
    description: 'Pause and reflect before you withdraw.',
    config: { steps: ['Write down why you need the money now', 'Ask: will this matter in 30 days?', 'Take three slow breaths', 'Confirm you still want to withdraw'] },
  },

  /* ---------------- Finance IQ ---------------- */
  {
    id: 'fi-compound', category: 'finance_iq', title: 'Compound Interest', difficulty: 'medium', minutes: 1, type: 'quiz',
    description: 'Prove you know why saving early wins.',
    config: { question: 'Which grows $1,000 the most over 20 years at the same rate?', options: ['Simple interest', 'Compound interest', 'No interest', 'Negative interest'], answer: 1 },
  },
  {
    id: 'fi-risk', category: 'finance_iq', title: 'Diversification', difficulty: 'easy', minutes: 1, type: 'quiz',
    description: 'A quick check on spreading risk.',
    config: { question: 'What is the main benefit of diversifying across assets?', options: ['Guaranteed profit', 'Lower overall risk', 'No fees', 'Higher taxes'], answer: 1 },
  },
]

export const getTask = (id) => TASKS.find((t) => t.id === id)
export const tasksByCategory = () =>
  CATEGORIES.map((c) => ({ ...c, tasks: TASKS.filter((t) => t.category === c.id) }))
export const getCategory = (id) => CATEGORIES.find((c) => c.id === id)
