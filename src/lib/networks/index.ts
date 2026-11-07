import { admitad } from "./admitad.ts";
import { adtraction } from "./adtraction.ts";
import { affilae } from "./affilae.ts";
import { awin } from "./awin.ts";
import { cj } from "./cj.ts";
import { effiliation } from "./effiliation.ts";
import { impact } from "./impact.ts";
import { kwanko } from "./kwanko.ts";
import { partnerize } from "./partnerize.ts";
import { rakuten } from "./rakuten.ts";
import { tradedoubler } from "./tradedoubler.ts";
import type { NetworkAdapter } from "./types.ts";
import { webgains } from "./webgains.ts";

// Networks whose API we read coupons and advertisers from (credentials entered in Redes de afiliación)
export const ADAPTERS: NetworkAdapter[] = [awin, tradedoubler, admitad, webgains, cj, rakuten, impact, adtraction, effiliation, kwanko, affilae, partnerize];

export const adapterFor = (id: string) => ADAPTERS.find((a) => a.id === id);
