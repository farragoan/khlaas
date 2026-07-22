"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";

const DEFAULT_MESSAGES = [
  "Reading your receipt…",
  "Finding the items…",
  "Matching up the prices…",
  "Almost there…",
];

export function ScanningLoader({ messages }: { messages?: string[] }) {
  const list = messages ?? DEFAULT_MESSAGES;
  const [index, setIndex] = useState(0);

  const advance = useCallback(() => {
    setIndex((i) => (i + 1) % list.length);
  }, [list.length]);

  useEffect(() => {
    const id = setInterval(advance, 1700);
    return () => clearInterval(id);
  }, [advance]);

  return (
    <div className="h-5 flex items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.p
          key={index}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3 }}
          className="text-sm text-zinc-400 text-center"
        >
          {list[index]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
