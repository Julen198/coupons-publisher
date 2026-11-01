import { sql } from "./db";
import { fetchStoreIcon } from "./store-icon.ts";

// After the response: look up each new store's square icon on its website (a few at a time)
export async function fillStoreIcons(slugs: string[]) {
  const queue = [...slugs];
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let slug = queue.shift(); slug; slug = queue.shift()) {
      try {
        const [store] = await sql()<{ website: string }[]>`SELECT website FROM stores WHERE slug = ${slug}`;
        const icon = store ? await fetchStoreIcon(store.website) : "";
        if (icon) await sql()`UPDATE stores SET logo_data = ${icon} WHERE slug = ${slug} AND logo_data = ''`;
      } catch (e) {
        console.error("store icon lookup failed", slug, e);
      }
    }
  }));
}
