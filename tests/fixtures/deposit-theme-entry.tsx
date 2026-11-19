import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { DepositSelector } from "@/components/deposit-selector";
document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") || "light";
function Example({ verified }: { verified: boolean }) {
  const [deposit, setDeposit] = useState(0);
  return <section className="pro-editor-surface" aria-label={verified ? "Verified service" : "Starter service"}>
    <h2>{verified ? "Verified" : "Starter"} service</h2>
    <form className="editor-form"><DepositSelector pricePence={5000} initialDepositPence={1000} verified={verified} onChange={setDeposit} /></form>
    <output aria-label="Selected deposit">{deposit}</output>
  </section>;
}
createRoot(document.getElementById("root")!).render(<div className="pro-app"><main className="pro-main"><Example verified={false} /><Example verified /></main></div>);
