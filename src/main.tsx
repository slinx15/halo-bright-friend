import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Remove dark mode — use light theme
document.documentElement.classList.remove("dark");

createRoot(document.getElementById("root")!).render(<App />);

createRoot(document.getElementById("root")!).render(<App />);
