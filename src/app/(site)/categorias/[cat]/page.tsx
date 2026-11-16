import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { categoryOf } from "@/lib/catalog";
import { HomeFeed, homeMetadata, readFilters } from "../../home-feed";

// One indexable page per category (/categorias/moda…): the home feed scoped to it, with its own title and canonical.
// An unknown slug answers 404 from the proxy before the page streams.
export async function generateMetadata({ params, searchParams }: PageProps<"/categorias/[cat]">): Promise<Metadata> {
  const cat = categoryOf((await params).cat);
  if (!cat) return { title: "Página no encontrada", robots: { index: false } };
  return homeMetadata(readFilters(await searchParams, cat.slug));
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/categorias/[cat]">) {
  const cat = categoryOf((await params).cat);
  if (!cat) notFound();
  return <HomeFeed searchParams={searchParams} cat={cat.slug} />;
}
