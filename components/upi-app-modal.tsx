"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface UpiAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  upiId: string;
  name: string;
  amount: number;
  currency: string;
}

interface AppOption {
  name: string;
  icon: string;
  scheme: string;
  bgClass: string;
}

const apps: AppOption[] = [
  {
    name: "Paytm",
    icon: "P",
    scheme: "paytm://pay",
    bgClass: "bg-blue-600",
  },
  {
    name: "PhonePe",
    icon: "Ph",
    scheme: "phonepe://pay",
    bgClass: "bg-purple-600",
  },
  {
    name: "WhatsApp",
    icon: "W",
    scheme: "upi://pay",
    bgClass: "bg-green-600",
  },
];

export function UpiAppModal({
  isOpen,
  onClose,
  upiId,
  name,
  amount,
  currency,
}: UpiAppModalProps) {
  function handleAppClick(app: AppOption) {
    const params = new URLSearchParams({
      pa: upiId,
      pn: name,
      am: amount.toFixed(2),
      cu: currency,
    });
    window.location.href = `${app.scheme}?${params.toString()}`;
    onClose();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-[#1A1A1A] rounded-t-2xl px-4 pt-5 pb-10 max-w-lg mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Pay with</h2>
              <button
                onClick={onClose}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              {apps.map((app) => (
                <button
                  key={app.name}
                  onClick={() => handleAppClick(app)}
                  className="w-full flex items-center gap-4 px-4 py-4 bg-[var(--surface)] rounded-xl active:scale-[0.98] transition-transform text-left"
                >
                  <div
                    className={`w-12 h-12 rounded-xl ${app.bgClass} flex items-center justify-center text-white font-bold text-lg`}
                  >
                    {app.icon}
                  </div>
                  <div>
                    <span className="text-white font-medium">{app.name}</span>
                    <p className="text-xs text-zinc-500">
                      Pay ₹{amount.toFixed(2)} to {name}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
