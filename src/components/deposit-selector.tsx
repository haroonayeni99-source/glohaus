"use client";

import { useEffect, useMemo, useState } from "react";
import {
  depositLimitMessage,
  maximumRequiredDepositPence,
  minimumRequiredDepositPence,
} from "@/modules/bookings/deposit-policy";

type DepositMode = "fixed" | "percentage";

function startingMode(pricePence: number, depositPence: number): DepositMode {
  const percentage = pricePence ? (depositPence * 100) / pricePence : 0;
  return [15, 20, 25, 30, 35, 40].some(
    (preset) => Math.abs(percentage - preset) < 0.01,
  )
    ? "percentage"
    : "fixed";
}

export function DepositSelector({
  pricePence,
  initialDepositPence = 0,
  onChange,
  verified,
}: {
  pricePence: number;
  initialDepositPence?: number;
  onChange: (depositPence: number) => void;
  verified: boolean;
}) {
  const [mode, setMode] = useState(() =>
    startingMode(pricePence, initialDepositPence),
  );
  const [fixedValue, setFixedValue] = useState(
    initialDepositPence ? (initialDepositPence / 100).toFixed(2) : "",
  );
  const initialPercentage = pricePence
    ? Math.round((initialDepositPence * 100) / pricePence)
    : 0;
  const [percentage, setPercentage] = useState(
    [15, 20, 25, 30, 35, 40].includes(initialPercentage)
      ? String(initialPercentage)
      : "20",
  );
  const [customPercentage, setCustomPercentage] = useState("");
  const minPence = useMemo(
    () => minimumRequiredDepositPence(Math.max(0, pricePence || 0)),
    [pricePence],
  );
  const maxPence = useMemo(
    () => maximumRequiredDepositPence(Math.max(0, pricePence || 0)),
    [pricePence],
  );
  const effectivePercentage =
    percentage === "custom" ? Number(customPercentage) : Number(percentage);
  const selectedPence =
    mode === "percentage"
      ? Math.round((Math.max(0, effectivePercentage || 0) * pricePence) / 100)
      : Math.round(Math.max(0, Number(fixedValue) || 0) * 100);
  const outsideRange = selectedPence < minPence || selectedPence > maxPence;

  useEffect(() => {
    onChange(verified ? selectedPence : 0);
  }, [onChange, selectedPence, verified]);

  if (!verified)
    return (
      <fieldset className="deposit-selector">
        <legend>Deposit requirement</legend>
        <p className="deposit-selector-intro">
          Starter professionals cannot set a deposit. Customers pay the full service price through GLOHAUS at booking.
        </p>
      </fieldset>
    );

  return (
    <fieldset className="deposit-selector">
      <legend>Deposit requirement</legend>
      <p className="deposit-selector-intro">
        Verified professional deposits must be between 15% and 40% of the service price.
        For this service: <strong>£{(minPence / 100).toFixed(2)}</strong> to <strong>£{(maxPence / 100).toFixed(2)}</strong>.
      </p>
      <div className="deposit-mode-options" role="radiogroup" aria-label="Deposit type">
        {[
          ["fixed", "Fixed deposit"],
          ["percentage", "Percentage deposit"],
        ].map(([value, label]) => (
          <label key={value} className={mode === value ? "is-selected" : ""}>
            <input
              type="radio"
              name="depositMode"
              checked={mode === value}
              onChange={() => setMode(value as DepositMode)}
            />
            {label}
          </label>
        ))}
      </div>
      {mode === "fixed" && (
        <label className="deposit-field">
          Fixed deposit (£)
          <input
            inputMode="decimal"
            type="number"
            min={(minPence / 100).toFixed(2)}
            max={(maxPence / 100).toFixed(2)}
            step="0.01"
            value={fixedValue}
            onChange={(event) => setFixedValue(event.target.value)}
          />
        </label>
      )}
      {mode === "percentage" && (
        <div className="deposit-percentage-fields">
          <label className="deposit-field">
            Percentage
            <select
              value={percentage}
              onChange={(event) => setPercentage(event.target.value)}
            >
              {[15, 20, 25, 30, 35, 40].map((value) => (
                <option key={value} value={value}>
                  {value}%
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </label>
          {percentage === "custom" && (
            <label className="deposit-field">
              Custom percentage (15–40)
              <input
                inputMode="numeric"
                type="number"
                min="15"
                max="40"
                step="1"
                value={customPercentage}
                onChange={(event) => setCustomPercentage(event.target.value)}
              />
            </label>
          )}
        </div>
      )}
      <p className={outsideRange ? "deposit-limit-error" : "deposit-selected"}>
        {outsideRange
          ? depositLimitMessage(Math.max(0, pricePence || 0))
          : `Deposit due at booking: £${(selectedPence / 100).toFixed(2)}.`}
      </p>
    </fieldset>
  );
}
