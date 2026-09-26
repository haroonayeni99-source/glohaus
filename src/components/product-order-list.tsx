"use client";

import Image from "next/image";
import Link from "next/link";
import { PackageCheck, Truck } from "lucide-react";
import { useState } from "react";
import type { ProductOrder } from "@/modules/shop/domain";

function money(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

function statusLabel(status: ProductOrder["status"]) {
  return status.replace("_", " ");
}

export function ProductOrderList({
  initialOrders,
  mode,
}: {
  initialOrders: ProductOrder[];
  mode: "customer" | "professional";
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shippingOrder, setShippingOrder] = useState<string | null>(null);
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [notice, setNotice] = useState("");

  async function confirmDelivery(id: string) {
    setBusyId(id);
    setNotice("");
    try {
      const response = await fetch(`/api/v1/account/orders/${id}/delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error?.code === "INVALID_REQUEST"
            ? "This order cannot be confirmed as delivered yet."
            : "Delivery could not be confirmed.",
        );
      setOrders((current) =>
        current.map((order) =>
          order.id === id
            ? {
                ...order,
                status: "delivered",
                deliveredAt: data.order.deliveredAt,
              }
            : order,
        ),
      );
      setNotice("Delivery confirmed. Professional proceeds remain protected for 48 hours before becoming available.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Delivery could not be confirmed.");
    } finally {
      setBusyId(null);
    }
  }

  async function advance(
    id: string,
    status: "processing" | "shipped",
  ) {
    setBusyId(id);
    setNotice("");
    try {
      const response = await fetch(`/api/v1/professional/orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          carrier: status === "shipped" ? carrier : null,
          trackingNumber: status === "shipped" ? tracking : null,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error?.code === "INVALID_REQUEST"
            ? "Check the fulfilment details and try again."
            : "This order could not be updated.",
        );

      setOrders((current) =>
        current.map((order) =>
          order.id === id
            ? {
                ...order,
                status: data.order.status,
                trackingCarrier: data.order.trackingCarrier,
                trackingNumber: data.order.trackingNumber,
                shippedAt: data.order.shippedAt,
              }
            : order,
        ),
      );
      setShippingOrder(null);
      setCarrier("");
      setTracking("");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "This order could not be updated.",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (!orders.length)
    return (
      <section className="product-orders-empty">
        <PackageCheck size={30} aria-hidden />
        <h2>No shop orders yet.</h2>
        <p>
          {mode === "customer"
            ? "Paid product orders will appear here once marketplace checkout is enabled."
            : "Paid customer product orders will appear here when marketplace checkout goes live."}
        </p>
        {mode === "customer" && <Link href="/shop">Browse Shop</Link>}
      </section>
    );

  return (
    <div className="product-order-list">
      {orders.map((order) => (
        <article className="product-order-card" key={order.id}>
          <header>
            <div>
              <small>
                {new Intl.DateTimeFormat("en-GB", {
                  dateStyle: "medium",
                  timeZone: "Europe/London",
                }).format(new Date(order.createdAt))}
              </small>
              <h2>{order.professionalName}</h2>
            </div>
            <span className={`product-order-status status-${order.status}`}>
              {statusLabel(order.status)}
            </span>
          </header>

          <div className="product-order-items">
            {order.items.map((item) => (
              <div key={item.id}>
                <span className="product-order-thumb">
                  {item.imageAssetId ? (
                    <Image
                      fill
                      unoptimized
                      sizes="56px"
                      src={`/api/media/${item.imageAssetId}`}
                      alt={item.productName}
                    />
                  ) : (
                    <PackageCheck size={18} aria-hidden />
                  )}
                </span>
                <span>
                  <strong>{item.productName}</strong>
                  <small>
                    {item.quantity} × {money(item.unitPricePence)}
                  </small>
                </span>
                <strong>{money(item.lineTotalPence)}</strong>
              </div>
            ))}
          </div>

          <div className="product-order-address">
            <strong>Delivery</strong>
            <span>{order.recipientName}</span>
            <span>{order.addressLine1}</span>
            {order.addressLine2 && <span>{order.addressLine2}</span>}
            <span>
              {order.city} · {order.postcode} · {order.countryCode}
            </span>
          </div>

          {(order.trackingCarrier || order.trackingNumber) && (
            <div className="product-order-tracking">
              <Truck size={17} aria-hidden />
              <span>
                <strong>{order.trackingCarrier}</strong>
                <small>{order.trackingNumber}</small>
              </span>
            </div>
          )}

          <footer>
            <div>
              <span>Products</span>
              <strong>{money(order.subtotalPence)}</strong>
              <span>Delivery</span>
              <strong>{money(order.deliveryPence)}</strong>
              <span>Total</span>
              <strong>{money(order.totalPence)}</strong>
            </div>

            {mode === "customer" && order.status === "shipped" && (
              <div className="product-order-actions">
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void confirmDelivery(order.id)}
                >
                  Confirm delivery
                </button>
              </div>
            )}

            {mode === "professional" &&
              (order.status === "paid" || order.status === "processing") && (
                <div className="product-order-actions">
                  {order.status === "paid" && (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void advance(order.id, "processing")}
                    >
                      Mark processing
                    </button>
                  )}
                  {shippingOrder === order.id ? (
                    <div className="shipping-fields">
                      <input
                        aria-label="Shipping carrier"
                        placeholder="Carrier"
                        value={carrier}
                        onChange={(event) => setCarrier(event.target.value)}
                      />
                      <input
                        aria-label="Tracking number"
                        placeholder="Tracking number"
                        value={tracking}
                        onChange={(event) => setTracking(event.target.value)}
                      />
                      <button
                        type="button"
                        disabled={
                          busyId !== null ||
                          carrier.trim().length < 2 ||
                          tracking.trim().length < 3
                        }
                        onClick={() => void advance(order.id, "shipped")}
                      >
                        Confirm shipped
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => setShippingOrder(order.id)}
                    >
                      Add tracking & ship
                    </button>
                  )}
                </div>
              )}
          </footer>
        </article>
      ))}
      {notice && <p className="form-notice" role="status">{notice}</p>}
    </div>
  );
}
