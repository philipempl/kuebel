import "./app.css";
import App from "./App.svelte";

// Beispieldaten nur in der Entwicklung, gesteuert ueber VITE_DEMO=de|en.
// import.meta.env.DEV ist im Produktionsbau statisch false, der Zweig und das
// Demo-Modul fallen damit komplett aus dem Bundle.
if (import.meta.env.DEV && import.meta.env.VITE_DEMO) {
  const { installDemo } = await import("./lib/demo");
  installDemo(import.meta.env.VITE_DEMO === "de" ? "de" : "en");
}

const app = new App({ target: document.getElementById("app")! });
export default app;
