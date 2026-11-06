import { Brain, Dumbbell, GraduationCap, Leaf, Puzzle } from 'lucide-react'
const map = { Puzzle, Brain, Dumbbell, Leaf, GraduationCap }
export default function TaskIcon({ name, ...props }) {
  const I = map[name] || Puzzle
  return <I {...props} />
}
