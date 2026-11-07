import { notFound } from "next/navigation";

// The proxy rewrites missing deals and stores here: calling notFound() before anything streams gives a real 404
export default function MissingPage(): never {
  notFound();
}
