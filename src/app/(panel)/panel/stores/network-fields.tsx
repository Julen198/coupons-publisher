"use client";

import { useState } from "react";
import { NETWORKS } from "@/lib/affiliate";
import { Field, inputCls } from "@/app/ui";

interface NetworkFieldsProps {
  network?: string;
  merchantId?: string;
  trackingUrl?: string;
}

// What each network calls the advertiser id, and an example of its tracking link with the placeholders in place
const HINTS: Record<string, { id: string; link: string }> = {
  awin: { id: "Awin merchant ID", link: "" },
  tradedoubler: { id: "ID del programa (p)", link: "https://clk.tradedoubler.com/click?p=123&a=456&epi={ref}&url={url}" },
  admitad: { id: "ID de la campaña", link: "https://ad.admitad.com/goto/abc123/?subid={ref}&ulp={url}" },
  webgains: { id: "ID del programa", link: "https://track.webgains.com/click.html?wgcampaignid=1&wgprogramid=2&clickref={ref}&wgtarget={url}" },
  cj: { id: "CJ advertiser ID (CID)", link: "https://www.anrdoezrs.net/click-PID-AID?sid={ref}&url={url}" },
  rakuten: { id: "Rakuten MID", link: "https://click.linksynergy.com/deeplink?id=XXXX&mid=123&u1={ref}&murl={url}" },
  impact: { id: "ID de la campaña", link: "https://marca.sjv.io/c/1/2/3?subId1={ref}&u={url}" },
  adtraction: { id: "ID del programa", link: "https://track.adtraction.com/t/t?a=123&as=456&t=2&tk=1&epi={ref}&url={url}" },
  affilae: { id: "ID del programa (24 caracteres)", link: "{url}?ae=42&aev={ref}" },
  tradetracker: { id: "ID de la campaña", link: "https://tc.tradetracker.net/?c=123&m=0&a=456&r={ref}&u={url}" },
  daisycon: { id: "ID del programa", link: "https://ds1.nl/c/?si=123&li=456&wi=789&ws={ref}&dl={url}" },
  kwanko: { id: "ID de la campaña", link: "https://action.metaffiliation.com/trk.php?mclic=XXXX&redir={url}&argsite={ref}" },
  partnerize: { id: "ID de la campaña (p. ej. 10l176)", link: "https://prf.hn/click/camref:XXXX/pubref:{ref}/destination:{url}" },
  effiliation: { id: "ID del programa", link: "https://track.effiliation.com/servlet/effi.redir?id_compteur=123&effi_id={ref}&url={url}" },
};

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
      <Field label={HINTS[net]?.id ?? "ID del anunciante en la red"} name="merchant_id" inputMode={net === "awin" ? "numeric" : undefined} defaultValue={merchantId} placeholder="Opcional" />
      {net !== "awin" && (
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Field label="Enlace de seguimiento de la red" name="tracking_url" type="text" inputMode="url" defaultValue={trackingUrl} placeholder={HINTS[net]?.link || "https://…?subid={ref}&url={url}"} />
          <p className="text-xs text-neutral-500">
            Pega el enlace que te da la red y escribe <code className="font-mono">{"{url}"}</code> donde va la página de destino y{" "}
            <code className="font-mono">{"{ref}"}</code> donde va el subid. Sin ellos, el enlace se usa tal cual.
          </p>
        </div>
      )}
    </>
  );
}
