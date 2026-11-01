"use client";

import { useState } from "react";
import { NETWORKS } from "@/lib/affiliate";
import { Field, inputCls } from "@/app/ui";

interface NetworkFieldsProps {
  network?: string;
  merchantId?: string;
  trackingUrl?: string;
}

// Awin builds links from its merchant ID; other networks use the tracking link they hand out.
// The advertiser id is what the network sync matches on, so every network keeps it.
export function NetworkFields({ network = "awin", merchantId = "", trackingUrl = "" }: NetworkFieldsProps) {
  const [net, setNet] = useState(network);
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-600 dark:text-neutral-400">Red de afiliación</span>
        <select name="network" value={net} onChange={(e) => setNet(e.target.value)} className={inputCls}>
          {NETWORKS.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
        </select>
      </label>
      <Field label={net === "awin" ? "Awin merchant ID" : "ID del anunciante en la red"} name="merchant_id" inputMode="numeric" defaultValue={merchantId} placeholder="Opcional" />
      {net !== "awin" && (
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Field label="Enlace de seguimiento de la red" name="tracking_url" type="url" defaultValue={trackingUrl} placeholder="https://…?subid={ref}&url={url}" />
          <p className="text-xs text-neutral-500">
            Pega el enlace que te da la red y escribe <code className="font-mono">{"{url}"}</code> donde va la página de destino y{" "}
            <code className="font-mono">{"{ref}"}</code> donde va el subid. Sin ellos, el enlace se usa tal cual.
          </p>
        </div>
      )}
    </>
  );
}
