import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/** Bouton discret, affiché seulement après un défilement significatif. */
export function BackToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => setIsVisible(window.scrollY > 360);
    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  if (!isVisible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-20 right-3 z-40 grid h-10 w-10 place-items-center rounded-full border border-blue-400/45 bg-slate-950 text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:bottom-6 sm:right-6"
      aria-label="Retourner au début de la page"
      title="Retourner au début"
    >
      <ArrowUp className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
