"use client";
import { createContext, useContext } from "react";
import { defaultLabels, type Labels } from "@/modules/platform/domain";
const Context = createContext<Labels>(defaultLabels);
export function PlatformLabelsProvider({
  labels,
  children,
}: {
  labels: Labels;
  children: React.ReactNode;
}) {
  return <Context.Provider value={labels}>{children}</Context.Provider>;
}
export function useLabels() {
  return useContext(Context);
}
export function PlatformLabel({ name }: { name: string }) {
  const labels = useLabels();
  return <>{labels[name as keyof Labels] || name}</>;
}
