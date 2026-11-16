import type { Metadata } from "next";
import { HomeFeed, homeMetadata, readFilters } from "./home-feed";

// The home page: every live deal. Its old ?cat= links answer 308 to /categorias/<slug> (see src/proxy.ts).
export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  return homeMetadata(readFilters(await searchParams));
}

export default function HomePage({ searchParams }: PageProps<"/">) {
  return <HomeFeed searchParams={searchParams} />;
}
