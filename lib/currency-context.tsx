"use client";

import { createContext, useContext } from "react";

const CurrencyContext = createContext("INR");

export const CurrencyProvider = CurrencyContext.Provider;

export function useCurrency() {
  return useContext(CurrencyContext);
}

export function getCurrencySymbol(currency: string): string {
  try {
    return (
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
      })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? currency
    );
  } catch {
    return currency;
  }
}
