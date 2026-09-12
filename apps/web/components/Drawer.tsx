"use client";
// Right-side drawer (M5.14). The town is the screen now, so the panels that used to own a
// permanent 400px column live in here and are opened from one header button.
//
// Glass on purpose: the drawer is translucent with a backdrop blur so the town keeps
// playing behind it. That is the reason it slides over the map rather than pushing it
// narrower, which would drop the map off its 2x whole-number scale every time you opened
// a panel.
//
// Motion is already a dependency of this app and was imported nowhere until now, so the
// slide costs no new package. Under `prefers-reduced-motion` it does not slide at all.
import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";

export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // Escape closes from anywhere, including from inside a form in one of the panels.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Move focus into the panel when it opens so the keyboard follows the eye. Returning
  // focus to the trigger is the caller's job, because only it knows which button opened.
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="scrim"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
          />
          <motion.div
            ref={panel}
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={reduce ? { opacity: 0 } : { x: "100%" }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: "100%" }}
            transition={{ duration: reduce ? 0 : 0.26, ease: [0.2, 0, 0, 1] }}
          >
            <div className="drawer-head">
              <span className="h3">{title}</span>
              <button className="btn icon" onClick={onClose} aria-label="Close panel">
                <X size={14} aria-hidden="true" />
              </button>
            </div>
            <div className="drawer-body">{children}</div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
