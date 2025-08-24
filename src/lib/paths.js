export const withBase = (p) => `${import.meta.env.BASE_URL}${p}`.replace(/\/{2,}/g, '/');
