export const COLOR_THEME_KEYS = ['pastel', 'rose', 'ocean'];

export const THEMES = {
  pastel: { name: 'Học thuật', vars: { '--accent': '#3F6B43', '--accent-hover': '#315837', '--accent-subtle': '#EEF4EC', '--accent-2': '#3A6B8C', '--accent-2-subtle': '#ECF1F5' } },
  rose: { name: 'Hoa đào', vars: { '--accent': '#A04561', '--accent-hover': '#873750', '--accent-subtle': '#F9EDF1', '--accent-2': '#426C7A', '--accent-2-subtle': '#EDF3F5' } },
  ocean: { name: 'Biển xanh', vars: { '--accent': '#286776', '--accent-hover': '#205463', '--accent-subtle': '#EAF3F5', '--accent-2': '#775A37', '--accent-2-subtle': '#F5F0EA' } },
};

export const BACKGROUNDS = [
  { id: 'none', name: 'Mặc định' },
  { id: 'sakura', name: 'Hoa anh đào' },
  { id: 'ocean', name: 'Biển' },
  { id: 'mountain', name: 'Núi' },
  { id: 'forest', name: 'Rừng' },
];

export function getAutoTheme() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? 'light' : 'dark';
}

export function applyTheme(themeKey, isDark = false) {
  const root = document.documentElement;
  const safeKey = COLOR_THEME_KEYS.includes(themeKey) ? themeKey : 'pastel';
  root.dataset.colorTheme = safeKey;
  root.classList.toggle('dark', Boolean(isDark));
  root.style.colorScheme = isDark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isDark ? '#14161A' : '#FAF9F5');
  for (const key of ['--accent', '--accent-hover', '--accent-subtle', '--accent-2', '--accent-2-subtle']) {
    root.style.removeProperty(key);
  }
}

let audioCtx = null;
function getAudioContext() {
  if (audioCtx) return audioCtx;
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor();
  } catch {
    return null;
  }
  return audioCtx;
}

export function playTone(frequency, duration, type = 'sine') {
  const isSoundEnabled = typeof localStorage === 'undefined' || localStorage.getItem('dudu-sound-enabled') !== 'false';
  if (!isSoundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.12, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

export const sounds = {
  correct: () => {
    playTone(523, 0.1);
    setTimeout(() => playTone(659, 0.1), 100);
    setTimeout(() => playTone(784, 0.15), 200);
  },
  wrong: () => playTone(200, 0.3, 'sawtooth'),
  levelUp: () => {
    playTone(523, 0.1);
    setTimeout(() => playTone(659, 0.1), 100);
    setTimeout(() => playTone(784, 0.1), 200);
    setTimeout(() => playTone(1046, 0.3), 300);
  },
  achievement: () => {
    playTone(659, 0.15);
    setTimeout(() => playTone(784, 0.15), 150);
    setTimeout(() => playTone(1046, 0.3), 300);
  },
  click: () => playTone(800, 0.05),
};
