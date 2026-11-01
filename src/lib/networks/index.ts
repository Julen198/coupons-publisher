import { admitad } from "./admitad.ts";
import { awin } from "./awin.ts";
import { tradedoubler } from "./tradedoubler.ts";
import type { NetworkAdapter } from "./types.ts";
import { webgains } from "./webgains.ts";

// Networks whose API we read coupons and advertisers from (credentials entered in Redes de afiliación)
export const ADAPTERS: NetworkAdapter[] = [awin, tradedoubler, admitad, webgains];

export const adapterFor = (id: string) => ADAPTERS.find((a) => a.id === id);
