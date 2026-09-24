// Shared by the server layout (the init script) and the client toggle. Kept out of the
// "use client" module: a server component importing a value from one gets a client reference.

export const THEME_STORAGE_KEY = "ixnos-data-theme";

// The choice also lives in a cookie so the server renders it: switching language re-renders the
// page's root element, and a theme only the browser knew about was lost.
export const THEME_COOKIE = "theme";
export const themeCookie = (theme: string) => `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;

// Runs in <head> before the first paint, for choices saved before the cookie existed. Without
// any choice the page follows the system setting through CSS alone.
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;if(document.cookie.indexOf("${THEME_COOKIE}=")<0)document.cookie="${THEME_COOKIE}="+t+"; path=/; max-age=31536000; samesite=lax"}}catch(e){}`;
