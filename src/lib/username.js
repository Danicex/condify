/** Random, readable display names like "swift_falcon_482". Always matches the backend rule /^[A-Za-z0-9_]{3,20}$/. */
const ADJ = ['swift', 'bright', 'calm', 'bold', 'lucky', 'clever', 'brave', 'sunny', 'quiet', 'noble', 'rapid', 'steady']
const NOUN = ['falcon', 'otter', 'comet', 'maple', 'tiger', 'ember', 'harbor', 'panda', 'cedar', 'orbit', 'lynx', 'pixel']
const pick = (a) => a[Math.floor(Math.random() * a.length)]

export function randomUsername() {
  return `${pick(ADJ)}_${pick(NOUN)}_${Math.floor(100 + Math.random() * 900)}` // max 6+1+6+1+3 = 17 chars
}
