"use client";
import { createContext, useContext } from "react";
export const IntroReadiness = createContext<(state: "ready" | "error") => void>(() => {});
export const useIntroReadiness = () => useContext(IntroReadiness);
