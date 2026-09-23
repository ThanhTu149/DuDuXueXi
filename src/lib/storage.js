export function readLocalValue(key, fallback = null) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function readLocalJson(key, fallback = null) {
  const value = readLocalValue(key);
  if (value === null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function writeLocalValue(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function writeLocalJson(key, value) {
  return writeLocalValue(key, JSON.stringify(value));
}
